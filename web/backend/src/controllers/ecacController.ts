import { Response } from 'express';
import { getOne, getAll, runQuery, beginTransaction, commitTransaction, rollbackTransaction } from '../database/connection';
import { AuthRequest } from '../types';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { certificadoService } from '../services/certificadoService';
import { EcacService, autenticarManualmente, encryptSessaoCookies } from '../services/ecacService';
import { capturarCookiesEdge } from '../services/edgeCookieService';
import { parseReciboPdf } from '../services/perdcompReciboParser';
import { sincronizarSaldosFromEcac } from '../services/ecacCreditoService';
import { log } from '../utils/logger';

interface AuthRequestWithFile extends AuthRequest {
  file?: Express.Multer.File;
}

// Thumbprints dos certificados instalados temporariamente no Windows Store (chave = cert id)
const certThumbprints = new Map<number, string>();
// Temp Edge profile dirs criados por instalarCertificado (chave = cert id)
const certTempProfiles = new Map<number, string>();
// Porta CDP usada para abrir o Edge isolado (chave = cert id) — usada por capturarSessaoEdge
// para conectar ao Edge ainda em execução e ler os cookies de sessão (que ficam só em memória).
const certCdpPorts = new Map<number, number>();

function removerCertDoStore(thumbprint: string): void {
  try {
    execSync(
      `powershell -NoProfile -Command "Remove-Item 'Cert:\\CurrentUser\\My\\${thumbprint}' -Force -ErrorAction SilentlyContinue"`,
      { timeout: 8000 }
    );
    log.info(`[ecac] Certificado ${thumbprint.substring(0, 8)}... removido do Windows Store`);
  } catch (e: any) {
    log.warn(`[ecac] Falha ao remover cert do Windows Store: ${e.message}`);
  }
}

/**
 * Closes any msedge.exe processes whose command-line includes the given profile dir.
 * Must run before reading cookies — Edge keeps cookies in memory and only writes
 * the full schema/data to disk on graceful shutdown (or periodically on a long delay).
 * Without this, the SQLite file may not even contain the `cookies` table yet.
 */
function fecharEdgeDoPerfil(profileDir: string): void {
  const tempDir = path.join(process.cwd(), 'temp');
  try {
    fs.mkdirSync(tempDir, { recursive: true });
  } catch { /* ignore */ }
  const tempPs1 = path.join(tempDir, `kill_edge_${Date.now()}.ps1`);
  try {
    // Single-quoted PS literal, double single-quote to escape any single quotes
    const dirLit = profileDir.replace(/'/g, "''");
    // Graceful close: send WM_CLOSE to each matching Edge window via CloseMainWindow().
    // This gives Edge a chance to flush its in-memory cookies to disk.
    // Stop-Process -Force is equivalent to TerminateProcess and skips the flush.
    const script = [
      `$pattern = '${dirLit}'`,
      `$procIds = @(Get-CimInstance Win32_Process -Filter "Name='msedge.exe'" |`,
      `  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($pattern) } |`,
      `  Select-Object -ExpandProperty ProcessId)`,
      `Write-Host "Encontrados $($procIds.Count) processo(s) Edge no perfil"`,
      `foreach ($id in $procIds) {`,
      `  try {`,
      `    $p = Get-Process -Id $id -ErrorAction SilentlyContinue`,
      `    if ($p) { [void]$p.CloseMainWindow() }`,
      `  } catch { }`,
      `}`,
      `# Wait up to 6s for graceful exit`,
      `$deadline = (Get-Date).AddSeconds(6)`,
      `while ((Get-Date) -lt $deadline) {`,
      `  $alive = $procIds | Where-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue }`,
      `  if (-not $alive) { break }`,
      `  Start-Sleep -Milliseconds 250`,
      `}`,
      `# Force-kill any survivors`,
      `foreach ($id in $procIds) {`,
      `  Stop-Process -Id $id -Force -ErrorAction SilentlyContinue`,
      `}`,
    ].join('\n');
    fs.writeFileSync(tempPs1, script, 'utf-8');
    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`, { timeout: 15000 }).toString().trim();
    log.info(`[ecac] Processos Edge do perfil isolado encerrados (${out || 'OK'})`);
  } catch (e: any) {
    log.warn(`[ecac] Falha ao fechar Edge do perfil: ${e.message}`);
  } finally {
    try { fs.unlinkSync(tempPs1); } catch { /* ignore */ }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ CERTIFICADOS ============

function calcularStatusCert(validadeAte: string | null): 'ATIVO' | 'EXPIRANDO' | 'EXPIRADO' {
  if (!validadeAte) return 'ATIVO';
  const agora = new Date();
  const exp = new Date(validadeAte);
  if (exp < agora) return 'EXPIRADO';
  const dias = Math.ceil((exp.getTime() - agora.getTime()) / (1000 * 60 * 60 * 24));
  return dias <= 30 ? 'EXPIRANDO' : 'ATIVO';
}

export const ecacCertificadoController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const params: any[] = [];
      const where = id_empresa ? `AND c.id_empresa = $1` : '';
      if (id_empresa) params.push(id_empresa);

      const certs = await getAll<any>(
        `SELECT c.id, c.id_empresa,
                COALESCE(c.nome, c.nome_arquivo) AS nome,
                c.nome_arquivo, c.tipo,
                c.cn    AS emitido_para,
                c.emissor AS emitido_por,
                c.serial_number, c.validade_de, c.validade_ate, c.ativo,
                COALESCE(c.status,
                  CASE
                    WHEN c.validade_ate IS NULL OR c.validade_ate = '' THEN 'ATIVO'
                    WHEN c.validade_ate::timestamptz < NOW() THEN 'EXPIRADO'
                    WHEN c.validade_ate::timestamptz < NOW() + INTERVAL '30 days' THEN 'EXPIRANDO'
                    ELSE 'ATIVO'
                  END
                ) AS status,
                c.ultimo_uso, c.criado_em,
                CASE WHEN c.sessao_cookies IS NOT NULL THEN true ELSE false END AS sessao_ativa,
                (c.senha_cifrada IS NOT NULL) AS senha_configurada,
                e.razao_social, e.cnpj
         FROM certificados_digitais c
         JOIN adm_empresas e ON e.id = c.id_empresa
         WHERE 1=1 ${where}
         ORDER BY c.criado_em DESC`,
        params
      );
      res.json(certs);
    } catch (error: any) {
      log.error(`Erro ao listar certificados: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar certificados' });
    }
  },

  upload: async (req: AuthRequestWithFile, res: Response) => {
    try {
      const file = req.file;
      const { id_empresa, senha_certificado, nome } = req.body;

      log.info(`[ecac.upload] arquivo="${file?.originalname}" empresa=${id_empresa} temSenha=${!!senha_certificado}`);

      if (!file) return res.status(400).json({ error: 'Arquivo .pfx é obrigatório' });
      if (!id_empresa) return res.status(400).json({ error: 'Empresa é obrigatória' });
      if (!senha_certificado) return res.status(400).json({ error: 'Senha do certificado é obrigatória' });

      const empresa = await getOne<any>('SELECT id, cnpj, razao_social FROM adm_empresas WHERE id = $1', [id_empresa]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const validation = await certificadoService.validatePfx(file.buffer, senha_certificado);
      log.info(`[ecac.upload] validação: valid=${validation.valid} cn="${validation.info?.cn}" erro="${validation.error}"`);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }

      const { encrypted, iv } = certificadoService.encrypt(file.buffer);
      const senhaCifrada = certificadoService.encryptSenha(senha_certificado);
      const status = calcularStatusCert(validation.info?.validadeAte || null);
      const nomeCustom = nome || file.originalname;

      const txClient = await beginTransaction();
      let lastID: number;
      try {
        await runQuery(
          'UPDATE certificados_digitais SET ativo = 0 WHERE id_empresa = $1',
          [id_empresa],
          txClient
        );

        const result = await runQuery(
          `INSERT INTO certificados_digitais
           (id_empresa, nome, nome_arquivo, tipo, pfx_encrypted, iv,
            cn, emissor, serial_number, validade_de, validade_ate,
            status, senha_cifrada, ativo)
           VALUES ($1, $2, $3, 'A1', $4, $5, $6, $7, $8, $9, $10, $11, $12, 1)
           RETURNING id`,
          [
            id_empresa, nomeCustom, file.originalname,
            encrypted, iv,
            validation.info?.cn || '',
            validation.info?.emissor || '',
            validation.info?.serialNumber || '',
            validation.info?.validadeDe || '',
            validation.info?.validadeAte || '',
            status, senhaCifrada,
          ],
          txClient
        );
        await commitTransaction(txClient);
        lastID = result.id;
      } catch (txErr) {
        await rollbackTransaction(txClient);
        throw txErr;
      }

      const cert = await getOne<any>(
        `SELECT c.id, c.id_empresa, COALESCE(c.nome, c.nome_arquivo) AS nome, c.cn AS emitido_para,
                c.emissor AS emitido_por, c.validade_de, c.validade_ate, c.status, c.ativo, c.criado_em,
                e.razao_social, e.cnpj
         FROM certificados_digitais c JOIN adm_empresas e ON e.id = c.id_empresa
         WHERE c.id = $1`, [lastID]
      );

      log.info(`Certificado "${nomeCustom}" cadastrado para ${empresa.razao_social} (${empresa.cnpj})`);
      res.status(201).json({ ...cert, info: validation.info, message: 'Certificado digital cadastrado com sucesso' });
    } catch (error: any) {
      log.error(`[ecac.upload] Erro: ${error.message}`);
      res.status(500).json({ error: `Erro ao processar certificado digital: ${error.message}` });
    }
  },

  /** Valida um certificado já cadastrado (por ID) e atualiza seu status no banco */
  validarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>(
        'SELECT id, validade_ate, status FROM certificados_digitais WHERE id = $1',
        [req.params.id]
      );
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });

      const novoStatus = calcularStatusCert(cert.validade_ate);
      const diasRestantes = cert.validade_ate
        ? Math.max(0, Math.ceil((new Date(cert.validade_ate).getTime() - Date.now()) / 86400000))
        : 0;

      if (novoStatus !== cert.status) {
        await runQuery(
          `UPDATE certificados_digitais SET status = $1, atualizado_em = NOW() WHERE id = $2`,
          [novoStatus, req.params.id]
        );
      }

      res.json({
        id: cert.id,
        valido: novoStatus !== 'EXPIRADO',
        status: novoStatus,
        diasRestantes,
        validoAte: cert.validade_ate,
      });
    } catch (error: any) {
      log.error(`Erro ao validar certificado: ${error.message}`);
      res.status(500).json({ error: 'Erro ao validar certificado' });
    }
  },

  /**
   * Autenticação manual no e-CAC — abre browser visível para o usuário logar com o certificado.
   * Captura e armazena os cookies de sessão para uso automatizado posterior.
   * Disponível apenas em ambientes locais/desktop (requer display e Windows Certificate Store).
   */
  autenticar: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>(
        'SELECT id, id_empresa, cn, validade_ate, status, pfx_encrypted, iv, senha_cifrada FROM certificados_digitais WHERE id = $1',
        [req.params.id]
      );
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
      if (cert.status === 'EXPIRADO') {
        return res.status(400).json({ error: 'Certificado expirado. Faça upload de um novo certificado.' });
      }
      if (!cert.senha_cifrada) {
        return res.status(400).json({
          error: 'Senha do certificado não configurada. Configure a senha antes de autenticar.',
          acao_requerida: 'Configure a senha RPA na aba Certificados antes de autenticar.',
        });
      }

      log.info(`[ecac.autenticar] Iniciando autenticação manual para certificado ${cert.id} (${cert.cn})`);

      // Respond immediately; authentication runs async
      res.json({
        message: 'Autenticação iniciada. Um browser será aberto — faça login com Gov.BR e selecione o certificado digital. A sessão será salva automaticamente.',
        tipo: 'manual_iniciada',
        certificado: { id: cert.id, cn: cert.cn },
      });

      // Run in background (fire-and-forget)
      setImmediate(async () => {
        try {
          const pfxBuffer = certificadoService.decrypt(cert.pfx_encrypted, cert.iv);
          const passphrase = certificadoService.decryptSenha(cert.senha_cifrada);

          const { sessaoCookies, cookiesCount } = await autenticarManualmente(
            pfxBuffer,
            passphrase,
            5 * 60 * 1000,
            (msg) => log.info(`[Auth:${cert.id}] ${msg}`),
            // afterAuth: run the first sync inside the same authenticated browser session
            // so bot detection never sees a new Playwright-launched session
            async (context, page) => {
              log.info(`[Auth:${cert.id}] Iniciando sync automática na sessão autenticada`);
              const ecacSvc = new EcacService((msg, pct) =>
                log.info(`[Auth:${cert.id}][Sync] ${msg} (${pct}%)`)
              );
              ecacSvc.usarContextoExistente(context, page);
              const result = await ecacSvc.consultarPerdcompDocumentos(pfxBuffer, passphrase, null, false);
              if (!result.success) {
                log.warn(`[Auth:${cert.id}] Sync na sessão autenticada falhou: ${result.errors.join('; ')}`);
                return;
              }
              // Persist documents without creating an ecac_sincronizacoes record
              // (the normal sync flow will create it; here we just pre-populate the cache)
              let importados = 0;
              const id_empresa = cert.id_empresa;
              for (const doc of result.documentos) {
                if (!doc.numero) continue;
                try {
                  let dataEntrega: string | null = null;
                  if (doc.data_entrega) {
                    const parts = doc.data_entrega.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                    if (parts) dataEntrega = `${parts[3]}-${parts[2]}-${parts[1]}`;
                  }
                  const existe = await getOne<any>(
                    `SELECT id FROM ecac_perdcomp_documentos WHERE id_empresa = $1 AND numero = $2`,
                    [id_empresa, doc.numero]
                  );
                  if (existe) {
                    await runQuery(
                      `UPDATE ecac_perdcomp_documentos
                       SET tipo_documento=$1, tipo_credito=$2, periodo_apuracao=$3,
                           data_entrega=$4, status_ecac=$5, orig_retif=$6, atualizado_em=NOW()
                       WHERE id=$7`,
                      [doc.tipo_documento||null, doc.tipo_credito||null, doc.periodo_apuracao||null,
                       dataEntrega, doc.status_ecac||null, doc.orig_retif||null, existe.id]
                    );
                  } else {
                    await runQuery(
                      `INSERT INTO ecac_perdcomp_documentos
                       (id_empresa, numero, tipo_documento, tipo_credito, periodo_apuracao,
                        data_entrega, status_ecac, orig_retif)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
                      [id_empresa, doc.numero, doc.tipo_documento||null, doc.tipo_credito||null,
                       doc.periodo_apuracao||null, dataEntrega, doc.status_ecac||null, doc.orig_retif||null]
                    );
                    importados++;
                  }
                } catch { /* ignore individual failures */ }
              }
              log.info(`[Auth:${cert.id}] Sync na sessão autenticada: ${result.total} docs, ${importados} novos`);
            },
          );

          await runQuery(
            `UPDATE certificados_digitais SET sessao_cookies = $1, ultimo_uso = NOW(), atualizado_em = NOW() WHERE id = $2`,
            [sessaoCookies, cert.id]
          );

          log.info(`[ecac.autenticar] Sessão salva para certificado ${cert.id} (${cookiesCount} cookies)`);
        } catch (e: any) {
          log.error(`[ecac.autenticar] Falha na autenticação background: ${e.message}`);
          // Mark session as failed so frontend knows
          await runQuery(
            `UPDATE certificados_digitais SET sessao_cookies = NULL, atualizado_em = NOW() WHERE id = $1`,
            [cert.id]
          ).catch(() => {});
        }
      });
    } catch (error: any) {
      log.error(`Erro ao iniciar autenticação: ${error.message}`);
      res.status(500).json({ error: 'Erro ao processar autenticação' });
    }
  },


  /** Valida arquivo .pfx recém-enviado (sem cadastrar) */
  validarArquivo: async (req: AuthRequestWithFile, res: Response) => {
    try {
      const file = req.file;
      const { senha_certificado } = req.body;

      if (!file) return res.status(400).json({ error: 'Arquivo .pfx é obrigatório' });
      if (!senha_certificado) return res.status(400).json({ error: 'Senha do certificado é obrigatória' });

      const validation = await certificadoService.validatePfx(file.buffer, senha_certificado);
      res.json({ valid: validation.valid, info: validation.info, error: validation.error });
    } catch (error: any) {
      log.error(`Erro ao validar arquivo de certificado: ${error.message}`);
      res.status(500).json({ error: 'Erro ao validar certificado' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>('SELECT id FROM certificados_digitais WHERE id = $1', [req.params.id]);
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });

      await runQuery('DELETE FROM certificados_digitais WHERE id = $1', [req.params.id]);
      res.json({ message: 'Certificado excluído' });
    } catch (error: any) {
      log.error(`Erro ao excluir certificado: ${error.message}`);
      res.status(500).json({ error: 'Erro ao excluir certificado' });
    }
  },

  atualizarSenha: async (req: AuthRequestWithFile, res: Response) => {
    try {
      const { senha_certificado } = req.body;
      if (!senha_certificado) return res.status(400).json({ error: 'Senha é obrigatória' });

      const cert = await getOne<any>('SELECT * FROM certificados_digitais WHERE id = $1', [req.params.id]);
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });

      // pfx_encrypted vem do PostgreSQL como Buffer (BYTEA) ou string \x... dependendo do driver
      const pfxBuffer = certificadoService.decrypt(cert.pfx_encrypted, cert.iv);
      const validation = await certificadoService.validatePfx(pfxBuffer, senha_certificado);
      if (!validation.valid) {
        return res.status(400).json({ error: 'Senha incorreta para este certificado' });
      }

      const senhaCifrada = certificadoService.encryptSenha(senha_certificado);
      await runQuery(
        `UPDATE certificados_digitais SET senha_cifrada = $1, atualizado_em = NOW() WHERE id = $2`,
        [senhaCifrada, req.params.id]
      );

      res.json({ message: 'Senha atualizada com sucesso. O RPA poderá usar este certificado.' });
    } catch (error: any) {
      log.error(`Erro ao atualizar senha do certificado: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar senha' });
    }
  },

  limparSessao: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>('SELECT id FROM certificados_digitais WHERE id = $1', [req.params.id]);
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });

      await runQuery(
        `UPDATE certificados_digitais SET sessao_cookies = NULL, atualizado_em = NOW() WHERE id = $1`,
        [req.params.id]
      );

      // Remove cert from Windows Store too (it was kept after capture for mTLS).
      const thumbprint = certThumbprints.get(cert.id);
      if (thumbprint) {
        removerCertDoStore(thumbprint);
        certThumbprints.delete(cert.id);
      }

      res.json({ message: 'Sessão removida. O sistema fará nova autenticação na próxima execução.' });
    } catch (error: any) {
      log.error(`Erro ao limpar sessão: ${error.message}`);
      res.status(500).json({ error: 'Erro ao limpar sessão' });
    }
  },

  /**
   * Instala o certificado .pfx no Windows Certificate Store (CurrentUser\My) para que
   * o Edge consiga apresentá-lo durante a autenticação TLS no gov.br.
   * Retorna o thumbprint para ser removido após capturar a sessão.
   */
  instalarCertificado: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>(
        'SELECT id, cn, pfx_encrypted, iv, senha_cifrada FROM certificados_digitais WHERE id = $1',
        [req.params.id]
      );
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
      if (!cert.senha_cifrada) {
        return res.status(400).json({ error: 'Senha do certificado não configurada. Configure a senha antes de instalar.' });
      }

      // Remove previous install for this cert if any
      const existingThumb = certThumbprints.get(cert.id);
      if (existingThumb) removerCertDoStore(existingThumb);

      const pfxBuffer = certificadoService.decrypt(cert.pfx_encrypted, cert.iv);
      const passphrase = certificadoService.decryptSenha(cert.senha_cifrada);

      const tempDir = path.join(process.cwd(), 'temp');
      fs.mkdirSync(tempDir, { recursive: true });
      const ts = Date.now();
      const tempPfxPath = path.join(tempDir, `install_${ts}.pfx`);
      const tempPs1Path = path.join(tempDir, `install_${ts}.ps1`);

      try {
        fs.writeFileSync(tempPfxPath, pfxBuffer, { mode: 0o600 });

        const safePass = passphrase.replace(/'/g, "''"); // escape for PS single-quoted string
        const pfxPathEsc = tempPfxPath.replace(/\\/g, '\\\\');

        // Install PFX properly:
        // - End-entity cert (HasPrivateKey) → CurrentUser\My with Exportable+PersistKeySet
        // - Intermediate CAs → CurrentUser\CA (so Edge can build the chain)
        // - Root CAs       → CurrentUser\Root
        // Using X509Certificate2Collection.Import so we control each store individually.
        const ps1 = `
Add-Type -AssemblyName System.Security
$flags = [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]"UserKeySet,PersistKeySet,Exportable"
$pfxBytes = [System.IO.File]::ReadAllBytes('${pfxPathEsc}')
$col = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
$col.Import($pfxBytes, '${safePass}', $flags)
$thumbprint = ''
foreach ($c in $col) {
    if ($c.HasPrivateKey) {
        $s = New-Object System.Security.Cryptography.X509Certificates.X509Store('My','CurrentUser')
        $s.Open('ReadWrite'); $s.Add($c); $s.Close()
        $thumbprint = $c.Thumbprint
        Write-Host "Installed end-entity: $($c.Subject) thumb=$thumbprint"
    } else {
        # Determine if root (self-signed) or intermediate
        if ($c.Subject -eq $c.Issuer) {
            $s = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
        } else {
            $s = New-Object System.Security.Cryptography.X509Certificates.X509Store('CA','CurrentUser')
        }
        $s.Open('ReadWrite'); $s.Add($c); $s.Close()
        Write-Host "Installed CA: $($c.Subject)"
    }
}
if (-not $thumbprint) { Write-Error "No end-entity certificate with private key found in PFX"; exit 1 }
Write-Output $thumbprint
`.trim();
        fs.writeFileSync(tempPs1Path, ps1, 'utf-8');

        const out = execSync(
          `powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1Path}"`,
          { timeout: 20000 }
        ).toString().trim();

        // Last non-empty line is the thumbprint (Write-Output, after Write-Host lines)
        const thumbprint = out.split(/\r?\n/).map(l => l.trim()).filter(l => /^[0-9A-F]{40}$/i.test(l)).pop() ?? '';
        if (!thumbprint) throw new Error(`Thumbprint não encontrado. Saída PowerShell:\n${out}`);

        certThumbprints.set(cert.id, thumbprint);
        log.info(`[ecac.instalarCertificado] Cert ${cert.cn} instalado (${thumbprint.substring(0, 8)}...) — cadeia completa`);

        // Open Edge with an ISOLATED profile directory so we get a brand-new process
        // with a fresh TLS session cache. The existing Edge process (running the app)
        // has cached TLS sessions to sso.acesso.gov.br from before the cert was installed,
        // so --new-window would reuse those sessions and skip the client cert request.
        // A new --user-data-dir forces a separate process with no cached sessions.
        const tempProfileDir = path.join(tempDir, `edge_profile_${ts}`);
        fs.mkdirSync(tempProfileDir, { recursive: true });
        certTempProfiles.set(cert.id, tempProfileDir);
        log.info(`[ecac.instalarCertificado] Perfil Edge isolado criado: ${tempProfileDir}`);

        // Pick a random high port for CDP (avoid 9222 default to reduce conflicts).
        // We need CDP because e-CAC's session cookie is in-memory only — never written
        // to disk — so we MUST attach via CDP while Edge is still running to read it.
        const cdpPort = 19000 + Math.floor(Math.random() * 5000);
        certCdpPorts.set(cert.id, cdpPort);

        let edgeAberto = false;
        try {
          execSync(
            `start msedge --user-data-dir="${tempProfileDir}" --remote-debugging-port=${cdpPort} --remote-allow-origins=* "https://cav.receita.fazenda.gov.br/autenticacao/Login"`,
            { timeout: 5000, windowsHide: true }
          );
          log.info(`[ecac.instalarCertificado] Edge (perfil isolado) aberto para autenticação (CDP port=${cdpPort})`);
          edgeAberto = true;
        } catch (e: any) {
          log.warn(`[ecac.instalarCertificado] Não foi possível abrir Edge automaticamente: ${e.message}`);
        }

        res.json({
          message: 'Certificado instalado no Windows Store (cadeia completa). Uma janela do Edge foi aberta em perfil isolado.',
          thumbprint: thumbprint.substring(0, 8) + '...',
          loginUrl: 'https://cav.receita.fazenda.gov.br/autenticacao/Login',
          edgeAberto,
        });
      } finally {
        try { fs.unlinkSync(tempPfxPath); } catch { /* ignore */ }
        try { fs.unlinkSync(tempPs1Path); } catch { /* ignore */ }
      }
    } catch (error: any) {
      log.error(`[ecac.instalarCertificado] Erro: ${error.message}`);
      res.status(500).json({ error: `Erro ao instalar certificado: ${error.message}` });
    }
  },

  /**
   * Captura a sessão do e-CAC lendo os cookies diretamente do banco SQLite do Edge.
   * Requer que o usuário tenha feito login no e-CAC no Edge antes de chamar este endpoint.
   * Sem Playwright — sem risco de detecção como bot.
   */
  capturarSessaoEdge: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>('SELECT id FROM certificados_digitais WHERE id = $1', [req.params.id]);
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });

      const tempProfileDir = certTempProfiles.get(cert.id);
      const cdpPort = certCdpPorts.get(cert.id);
      log.info(`[ecac.capturarSessaoEdge] Capturando cookies via CDP para certificado ${cert.id} — port=${cdpPort}`);

      if (!cdpPort) {
        return res.status(400).json({
          error: 'Sessão de autenticação não encontrada. Clique em "Abrir e-CAC" antes de capturar.',
        });
      }

      // Connect to the running Edge instance via CDP — this gives us in-memory cookies
      // (including session cookies that are NEVER written to disk by Edge).
      // The eCAC session cookie is set by the server after SSO completes and is a
      // session-only cookie, so disk-based reading from SQLite never sees it.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { chromium } = require('playwright');
      let cookies: any[] = [];
      let browser: any = null;
      try {
        browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`);
        const contexts = browser.contexts();
        log.info(`[ecac.capturarSessaoEdge] Conectado ao Edge via CDP — ${contexts.length} contexto(s)`);
        // Get cookies from all contexts (in case there's more than one)
        const allCookies: any[] = [];
        for (const ctx of contexts) {
          const ctxCookies = await ctx.cookies();
          allCookies.push(...ctxCookies);
        }
        // Filter for e-CAC related domains
        const ecacDomains = ['cav.receita.fazenda.gov.br', 'sso.acesso.gov.br', 'acesso.gov.br', 'gov.br'];
        cookies = allCookies.filter(c => ecacDomains.some(d => c.domain.endsWith(d)));
        log.info(`[ecac.capturarSessaoEdge] Total cookies via CDP: ${allCookies.length}, e-CAC: ${cookies.length}`);
        const cookieSummary = cookies.map(c => `${c.domain}${c.path}:${c.name}`).join(', ');
        log.info(`[ecac.capturarSessaoEdge] Cookies capturados: ${cookieSummary}`);
      } finally {
        try { if (browser) await browser.close(); } catch { /* ignore — connectOverCDP doesn't own the browser */ }
      }

      if (cookies.length === 0) {
        return res.status(400).json({
          error: 'Nenhum cookie do e-CAC encontrado. Certifique-se de ter feito login no e-CAC na janela que foi aberta antes de capturar.',
        });
      }

      // Normalize Playwright-format cookies to our EdgeCookie format for storage
      const edgeCookies = cookies.map(c => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: typeof c.expires === 'number' ? c.expires : -1,
        httpOnly: Boolean(c.httpOnly),
        secure: Boolean(c.secure),
        sameSite: c.sameSite || 'Lax',
      }));

      const sessaoCookies = encryptSessaoCookies(edgeCookies);
      await runQuery(
        `UPDATE certificados_digitais SET sessao_cookies = $1, ultimo_uso = NOW(), atualizado_em = NOW() WHERE id = $2`,
        [sessaoCookies, cert.id]
      );

      // Now close Edge and clean up
      if (tempProfileDir) {
        fecharEdgeDoPerfil(tempProfileDir);
        await sleep(500);
        certTempProfiles.delete(cert.id);
        try {
          fs.rmSync(tempProfileDir, { recursive: true, force: true });
          log.info(`[ecac.capturarSessaoEdge] Perfil Edge isolado removido: ${tempProfileDir}`);
        } catch (e: any) {
          log.warn(`[ecac.capturarSessaoEdge] Falha ao remover perfil: ${e.message}`);
        }
      }
      certCdpPorts.delete(cert.id);

      // KEEP the certificate in Windows Store — Playwright/EcacService needs it for
      // mTLS during sync operations. We'll remove it later via "Limpar sessão".
      // (Previously we removed it here, breaking mTLS for subsequent operations.)

      log.info(`[ecac.capturarSessaoEdge] ${cookies.length} cookie(s) salvos para certificado ${cert.id}`);
      res.json({ message: 'Sessão capturada com sucesso', cookiesCount: cookies.length });
    } catch (error: any) {
      log.error(`[ecac.capturarSessaoEdge] Erro: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  },

  statusSessao: async (req: AuthRequest, res: Response) => {
    try {
      const cert = await getOne<any>(
        `SELECT id, cn, validade_ate, ativo, status,
          CASE WHEN sessao_cookies IS NOT NULL THEN true ELSE false END as sessao_ativa,
          senha_cifrada IS NOT NULL as senha_configurada
         FROM certificados_digitais WHERE id = $1`,
        [req.params.id]
      );
      if (!cert) return res.status(404).json({ error: 'Certificado não encontrado' });
      res.json(cert);
    } catch (error: any) {
      log.error(`Erro ao verificar sessão: ${error.message}`);
      res.status(500).json({ error: 'Erro ao verificar sessão' });
    }
  },
};

// ============ SINCRONIZAÇÃO eCAC ============

// Controle por id_empresa de uma sync ativa, e mapeamento sync_id -> id_empresa
// para que pause/resume/cancel possam ser feitos pelo id da sincronização.
const activeSyncs = new Map<number, { cancel: boolean; pause: boolean; syncId?: number }>();
const syncToEmpresa = new Map<number, number>();

export const ecacSincronizacaoController = {
  /**
   * Importa documentos PER/DCOMP do e-CAC usando a sessão previamente autenticada.
   * Acionado pelo Dashboard — não requer que o usuário digite a senha.
   */
  sincronizarAutomatico: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo, _isBatch } = req.body;
      if (!id_empresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });

      // Manual on-demand: allow at any hour by default.
      // Callers can pass _isBatch:true to enforce the after-18h window (e.g. cron jobs).
      req.body = { id_empresa, tipo: tipo || 'perdcomp', _isBatch: _isBatch ?? false };
      return ecacSincronizacaoController.sincronizar(req, res);
    } catch (err: any) {
      log.error(`[ecac.importarAutomatico] ${err.message}`);
      res.status(500).json({ error: `Erro ao iniciar importação automática: ${err.message}` });
    }
  },

  sincronizar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo, _isBatch } = req.body;
      const isBatchMode = _isBatch === true;

      if (!id_empresa) {
        return res.status(400).json({ error: 'id_empresa é obrigatório' });
      }

      const empresa = await getOne<any>('SELECT id, cnpj, razao_social FROM adm_empresas WHERE id = $1', [id_empresa]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const cert = await getOne<any>(
        `SELECT * FROM certificados_digitais
         WHERE id_empresa = $1 AND ativo = 1 AND senha_cifrada IS NOT NULL
         ORDER BY criado_em DESC LIMIT 1`,
        [id_empresa]
      );
      if (!cert) {
        return res.status(404).json({
          error: 'Nenhum certificado ativo com senha RPA configurada para esta empresa.',
          acao_requerida: 'Configure a senha RPA e realize a autenticação manual no e-CAC antes de sincronizar.',
        });
      }

      if (!cert.sessao_cookies) {
        return res.status(400).json({
          error: 'Sessão e-CAC não encontrada. Realize a autenticação manual primeiro.',
          acao_requerida: 'Acesse a aba Certificados e clique em "Autenticar no e-CAC" para criar uma sessão válida.',
          codigo: 'SESSAO_NAO_ENCONTRADA',
        });
      }

      if (activeSyncs.has(id_empresa)) {
        return res.status(409).json({ error: 'Sincronização já em andamento para esta empresa' });
      }

      const { id: syncId } = await runQuery(
        `INSERT INTO ecac_sincronizacoes (id_empresa, id_certificado, id_usuario, tipo, status, iniciado_em)
         VALUES ($1, $2, $3, $4, 'em_andamento', NOW())
         RETURNING id`,
        [id_empresa, cert.id, req.user!.id, tipo || 'perdcomp']
      );

      res.json({ sync_id: syncId, message: 'Sincronização iniciada' });

      const control = { cancel: false, pause: false };
      activeSyncs.set(id_empresa, control);

      setImmediate(async () => {
        try {
          const pfxBuffer = certificadoService.decrypt(cert.pfx_encrypted, cert.iv);
          const passphrase = certificadoService.decryptSenha(cert.senha_cifrada);

          const ecac = new EcacService((msg, pct) => {
            runQuery(
              `UPDATE ecac_sincronizacoes SET detalhes = $1 WHERE id = $2`,
              [JSON.stringify({ progresso: pct, mensagem: msg }), syncId]
            ).catch(() => {});
          });

          // isBatch=false: manual on-demand syncs are allowed at any time (8h–24h).
          // Automated overnight batch jobs pass isBatch=true (enforces after-18h window).
          const result = await ecac.consultarPerdcompDocumentos(
            pfxBuffer,
            passphrase,
            cert.sessao_cookies,
            isBatchMode,
          );

          if (!result.success) {
            const errorMsg = result.errors.join('; ');

            // Do NOT auto-wipe sessao_cookies on sessaoExpirada — a single transient
            // redirect (e-CAC anti-fraud, slow load, etc.) shouldn't destroy a freshly
            // captured session. The user can manually clear via the "Limpar sessão" button
            // (DELETE /ecac/certificados/:id/sessao) and re-authenticate when really needed.
            if (result.sessaoExpirada) {
              log.warn(`[ecac.sync] sessaoExpirada detectada para cert ${cert.id} — cookies preservados; usuário pode reautenticar manualmente`);
            }

            await runQuery(
              `UPDATE ecac_sincronizacoes SET status = 'erro', erro_mensagem = $1, concluido_em = NOW() WHERE id = $2`,
              [errorMsg, syncId]
            );
            return;
          }

          // Upsert documents into ecac_perdcomp_documentos
          let importados = 0;
          let atualizados = 0;
          let ignorados = 0;

          for (const doc of result.documentos) {
            if (!doc.numero) { ignorados++; continue; }
            try {
              // Parse date_entrega from DD/MM/YYYY or DD/MM/YYYY HH:mm:ss
              let dataEntrega: string | null = null;
              if (doc.data_entrega) {
                const parts = doc.data_entrega.match(/(\d{2})\/(\d{2})\/(\d{4})/);
                if (parts) dataEntrega = `${parts[3]}-${parts[2]}-${parts[1]}`;
              }

              const existe = await getOne<any>(
                `SELECT id FROM ecac_perdcomp_documentos WHERE id_empresa = $1 AND numero = $2`,
                [id_empresa, doc.numero]
              );

              if (existe) {
                await runQuery(
                  `UPDATE ecac_perdcomp_documentos
                   SET tipo_documento = $1, tipo_credito = $2, periodo_apuracao = $3,
                       data_entrega = $4, status_ecac = $5, orig_retif = $6,
                       id_sincronizacao = $7, atualizado_em = NOW()
                   WHERE id = $8`,
                  [
                    doc.tipo_documento || null, doc.tipo_credito || null,
                    doc.periodo_apuracao || null, dataEntrega,
                    doc.status_ecac || null, doc.orig_retif || null,
                    syncId, existe.id,
                  ]
                );
                atualizados++;
              } else {
                await runQuery(
                  `INSERT INTO ecac_perdcomp_documentos
                   (id_empresa, id_sincronizacao, numero, tipo_documento, tipo_credito,
                    periodo_apuracao, data_entrega, status_ecac, orig_retif)
                   VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
                  [
                    id_empresa, syncId, doc.numero,
                    doc.tipo_documento || null, doc.tipo_credito || null,
                    doc.periodo_apuracao || null, dataEntrega,
                    doc.status_ecac || null, doc.orig_retif || null,
                  ]
                );
                importados++;
              }
            } catch (err: any) {
              log.warn(`[eCAC] Erro ao persistir documento ${doc.numero}: ${err.message}`);
              ignorados++;
            }
          }

          await runQuery(
            `UPDATE ecac_sincronizacoes
             SET status = 'concluido',
                 creditos_importados = $1,
                 registros_ignorados = $2,
                 concluido_em = NOW(),
                 detalhes = $3
             WHERE id = $4`,
            [
              importados,
              ignorados,
              JSON.stringify({
                progresso: 100,
                mensagem: 'Concluído',
                documentos_extraidos: result.total,
                paginas: result.paginas,
                importados,
                atualizados,
                ignorados,
              }),
              syncId,
            ]
          );

          log.info(`[eCAC] Sync ${syncId} concluída: ${result.total} documentos extraídos — ${importados} importados, ${atualizados} atualizados, ${ignorados} ignorados`);
        } catch (err: any) {
          log.error(`[eCAC] Sync ${syncId} falhou: ${err.message}`);
          await runQuery(
            `UPDATE ecac_sincronizacoes SET status = 'erro', erro_mensagem = $1, concluido_em = NOW() WHERE id = $2`,
            [err.message, syncId]
          ).catch(() => {});
        } finally {
          activeSyncs.delete(id_empresa);
        }
      });
    } catch (error: any) {
      log.error(`Erro ao iniciar sincronização: ${error.message}`);
      res.status(500).json({ error: 'Erro ao iniciar sincronização' });
    }
  },

  status: async (req: AuthRequest, res: Response) => {
    try {
      const sync = await getOne<any>(
        `SELECT s.*, e.razao_social, e.cnpj
         FROM ecac_sincronizacoes s
         JOIN adm_empresas e ON e.id = s.id_empresa
         WHERE s.id = $1`,
        [req.params.id]
      );
      if (!sync) return res.status(404).json({ error: 'Sincronização não encontrada' });

      let detalhes = null;
      try { detalhes = sync.detalhes ? JSON.parse(sync.detalhes) : null; } catch { /* ignore */ }

      res.json({ ...sync, detalhes });
    } catch (error: any) {
      log.error(`Erro ao consultar status: ${error.message}`);
      res.status(500).json({ error: 'Erro ao consultar status' });
    }
  },

  listarDocumentos: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const params: any[] = [];
      let whereClause = '';
      if (id_empresa) { params.push(id_empresa); whereClause = `WHERE d.id_empresa = $${params.length}`; }

      const docs = await getAll<any>(
        `SELECT d.id, d.id_empresa, d.id_sincronizacao, d.numero,
                d.tipo_documento, d.tipo_credito, d.periodo_apuracao,
                d.data_entrega, d.status_ecac, d.orig_retif,
                d.status_normalizado, d.id_documento_retificado, d.retificado_por_id,
                d.numero_perdcomp_inicial, d.numero_recibo, d.data_transmissao,
                d.oriundo_acao_judicial, d.valor_pedido, d.valor_saldo_negativo,
                d.selic_acumulada, d.credito_atualizado, d.credito_original_data_entrega,
                d.saldo_credito_original, d.credito_original_utilizado, d.total_debitos_dcomp,
                d.forma_apuracao, d.forma_tributacao, d.exercicio,
                d.periodo_inicial, d.periodo_final,
                d.responsavel_nome, d.responsavel_cpf,
                d.recibo_baixado_em, d.recibo_parse_status, d.recibo_parse_erro,
                d.id_perdcomp_sistema,
                CASE WHEN d.recibo_pdf IS NOT NULL THEN true ELSE false END AS tem_recibo,
                CASE WHEN d.id_perdcomp_sistema IS NOT NULL THEN true ELSE false END AS vinculado_sistema,
                ret.numero AS numero_retificador,
                d.criado_em, d.atualizado_em,
                e.razao_social, e.cnpj
         FROM ecac_perdcomp_documentos d
         JOIN adm_empresas e ON e.id = d.id_empresa
         LEFT JOIN ecac_perdcomp_documentos ret ON ret.id = d.retificado_por_id
         ${whereClause}
         ORDER BY d.data_entrega DESC NULLS LAST, d.numero DESC
         LIMIT 500`,
        params
      );
      res.json(docs);
    } catch (error: any) {
      log.error(`Erro ao listar documentos e-CAC: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar documentos' });
    }
  },

  /**
   * Inicia o download dos PDFs de recibo para os PER/DCOMPs sem recibo.
   * Executa em background, atualiza ecac_sincronizacoes com o progresso.
   */
  baixarRecibos: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, somente_pendentes = true, _isBatch = false } = req.body || {};
      if (!id_empresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });

      const empresa = await getOne<any>('SELECT id, cnpj, razao_social FROM adm_empresas WHERE id = $1', [id_empresa]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      const cert = await getOne<any>(
        `SELECT * FROM certificados_digitais
         WHERE id_empresa = $1 AND ativo = 1 AND senha_cifrada IS NOT NULL
         ORDER BY criado_em DESC LIMIT 1`,
        [id_empresa]
      );
      if (!cert) return res.status(404).json({ error: 'Nenhum certificado ativo configurado' });
      if (!cert.sessao_cookies) {
        return res.status(400).json({
          error: 'Sessão e-CAC não encontrada. Realize a autenticação manual primeiro.',
          codigo: 'SESSAO_NAO_ENCONTRADA',
        });
      }

      const filterClause = somente_pendentes ? `AND recibo_pdf IS NULL` : '';
      const docs = await getAll<{ id: number; numero: string }>(
        `SELECT id, numero FROM ecac_perdcomp_documentos WHERE id_empresa = $1 ${filterClause} ORDER BY numero`,
        [id_empresa]
      );

      if (docs.length === 0) {
        return res.json({ message: 'Nenhum PER/DCOMP pendente de recibo', total: 0 });
      }

      if (activeSyncs.has(id_empresa)) {
        return res.status(409).json({ error: 'Operação em andamento para esta empresa' });
      }

      const { id: syncId } = await runQuery(
        `INSERT INTO ecac_sincronizacoes (id_empresa, id_certificado, id_usuario, tipo, status, iniciado_em)
         VALUES ($1, $2, $3, 'recibos', 'em_andamento', NOW())
         RETURNING id`,
        [id_empresa, cert.id, req.user!.id]
      );

      res.json({ sync_id: syncId, total: docs.length, message: 'Download de recibos iniciado' });

      const control = { cancel: false, pause: false, syncId: syncId as number };
      activeSyncs.set(id_empresa, control);
      syncToEmpresa.set(syncId, id_empresa);

      setImmediate(async () => {
        try {
          const pfxBuffer = certificadoService.decrypt(cert.pfx_encrypted, cert.iv);
          const passphrase = certificadoService.decryptSenha(cert.senha_cifrada);

          const ecac = new EcacService((msg, pct) => {
            runQuery(
              `UPDATE ecac_sincronizacoes SET detalhes = $1 WHERE id = $2`,
              [JSON.stringify({ progresso: pct, mensagem: msg, total: docs.length, pausado: control.pause }), syncId]
            ).catch(() => {});
          });

          const numeros = docs.map(d => d.numero);
          const numeroToId = new Map(docs.map(d => [d.numero, d.id]));
          let baixados = 0;
          let parseOk = 0;
          let parseErro = 0;
          let debitosImportados = 0;
          // Track which numbers we've already persisted via the progressive callback,
          // so the post-loop doesn't double-process them.
          const persistedNumeros = new Set<string>();

          // Persist a single recibo to DB (PDF + parse + débitos). Used both progressively
          // (called as onRecibo callback during baixarRecibos) AND from the post-loop
          // for any recibos that weren't covered by the callback.
          const persistRecibo = async (numero: string, pdfBuffer: Buffer): Promise<void> => {
            const docId = numeroToId.get(numero);
            if (!docId) return;
            try {
              await runQuery(
                `UPDATE ecac_perdcomp_documentos
                 SET recibo_pdf = $1, recibo_baixado_em = NOW(), atualizado_em = NOW()
                 WHERE id = $2`,
                [pdfBuffer, docId]
              );
              baixados++;

              try {
                const dados = await parseReciboPdf(pdfBuffer);

                await runQuery(
                  `UPDATE ecac_perdcomp_documentos SET
                     numero_perdcomp_inicial = COALESCE($1, numero_perdcomp_inicial),
                     numero_recibo = COALESCE($2, numero_recibo),
                     data_transmissao = COALESCE($3, data_transmissao),
                     oriundo_acao_judicial = COALESCE($4, oriundo_acao_judicial),
                     valor_pedido = COALESCE($5, valor_pedido),
                     valor_saldo_negativo = COALESCE($6, valor_saldo_negativo),
                     selic_acumulada = COALESCE($7, selic_acumulada),
                     credito_atualizado = COALESCE($8, credito_atualizado),
                     credito_original_data_entrega = COALESCE($9, credito_original_data_entrega),
                     saldo_credito_original = COALESCE($10, saldo_credito_original),
                     credito_original_utilizado = COALESCE($11, credito_original_utilizado),
                     total_debitos_dcomp = COALESCE($12, total_debitos_dcomp),
                     forma_apuracao = COALESCE($13, forma_apuracao),
                     forma_tributacao = COALESCE($14, forma_tributacao),
                     exercicio = COALESCE($15, exercicio),
                     periodo_inicial = COALESCE($16, periodo_inicial),
                     periodo_final = COALESCE($17, periodo_final),
                     responsavel_nome = COALESCE($18, responsavel_nome),
                     responsavel_cpf = COALESCE($19, responsavel_cpf),
                     recibo_parse_status = 'OK',
                     recibo_parse_erro = NULL,
                     atualizado_em = NOW()
                   WHERE id = $20`,
                  [
                    dados.numero_perdcomp_inicial, dados.numero_recibo, dados.data_transmissao,
                    dados.oriundo_acao_judicial, dados.valor_pedido, dados.valor_saldo_negativo,
                    dados.selic_acumulada, dados.credito_atualizado, dados.credito_original_data_entrega,
                    dados.saldo_credito_original, dados.credito_original_utilizado, dados.total_debitos_dcomp,
                    dados.forma_apuracao, dados.forma_tributacao, dados.exercicio,
                    dados.periodo_inicial, dados.periodo_final,
                    dados.responsavel_nome, dados.responsavel_cpf,
                    docId,
                  ]
                );

                // Re-popula débitos compensados
                if (dados.debitos.length > 0) {
                  await runQuery(`DELETE FROM ecac_perdcomp_debitos_compensados WHERE id_documento = $1`, [docId]);
                  for (const d of dados.debitos) {
                    await runQuery(
                      `INSERT INTO ecac_perdcomp_debitos_compensados
                        (id_documento, ordem, cnpj_detentor, codigo_receita, denominacao_receita,
                         grupo_tributo, periodicidade, periodo_apuracao, data_vencimento,
                         principal, multa, juros, total, controlado_em_processo)
                       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                      [
                        docId, d.ordem, d.cnpj_detentor, d.codigo_receita, d.denominacao_receita,
                        d.grupo_tributo, d.periodicidade, d.periodo_apuracao, d.data_vencimento,
                        d.principal, d.multa, d.juros, d.total, d.controlado_em_processo,
                      ]
                    );
                    debitosImportados++;
                  }
                }
                parseOk++;
              } catch (parseErr: any) {
                log.warn(`[eCAC/Recibo] Parse falhou para ${numero}: ${parseErr.message}`);
                await runQuery(
                  `UPDATE ecac_perdcomp_documentos SET recibo_parse_status = 'ERRO', recibo_parse_erro = $1 WHERE id = $2`,
                  [parseErr.message, docId]
                ).catch(() => {});
                parseErro++;
              }
            } catch (err: any) {
              log.warn(`[eCAC/Recibo] Erro ao salvar PDF de ${numero}: ${err.message}`);
            }
          };

          const result = await ecac.baixarRecibos(
            pfxBuffer,
            passphrase,
            cert.sessao_cookies,
            numeros,
            _isBatch === true,
            undefined,
            control,
            // Progressive callback — saves each PDF immediately so the UI shows
            // it as available without waiting for the whole batch to finish.
            async (numero: string, pdfBuffer: Buffer) => {
              await persistRecibo(numero, pdfBuffer);
              persistedNumeros.add(numero);
            },
          );

          if (result.sessaoExpirada) {
            log.warn(`[ecac.recibos] sessaoExpirada detectada para cert ${cert.id} — cookies preservados`);
          }

          // Catch-up loop: persists any recibos that the progressive callback didn't cover
          // (defensive — onRecibo should have caught them all).
          for (const [numero, pdfBuffer] of result.recibos.entries()) {
            if (persistedNumeros.has(numero)) continue;
            await persistRecibo(numero, pdfBuffer);
          }

          const finalStatus = (result as any).cancelado
            ? 'cancelado'
            : (result.errors.length > 0 && result.recibos.size === 0 ? 'erro' : 'concluido');
          await runQuery(
            `UPDATE ecac_sincronizacoes
             SET status = $1, creditos_importados = $2, debitos_importados = $3, registros_ignorados = $4,
                 erro_mensagem = $5, concluido_em = NOW(),
                 detalhes = $6
             WHERE id = $7`,
            [
              finalStatus,
              baixados,
              debitosImportados,
              docs.length - baixados,
              result.errors.length > 0 ? result.errors.join('; ').substring(0, 2000) : null,
              JSON.stringify({
                progresso: 100,
                mensagem: 'Concluído',
                total_pdfs_baixados: baixados,
                total_solicitados: docs.length,
                parse_ok: parseOk,
                parse_erro: parseErro,
                debitos_importados: debitosImportados,
              }),
              syncId,
            ]
          );

          log.info(`[eCAC/Recibo] Sync ${syncId}: ${baixados}/${docs.length} PDFs, parse OK=${parseOk} ERRO=${parseErro}, débitos=${debitosImportados}`);
        } catch (err: any) {
          log.error(`[eCAC/Recibo] Sync ${syncId} falhou: ${err.message}`);
          await runQuery(
            `UPDATE ecac_sincronizacoes SET status = 'erro', erro_mensagem = $1, concluido_em = NOW() WHERE id = $2`,
            [err.message, syncId]
          ).catch(() => {});
        } finally {
          activeSyncs.delete(id_empresa);
          syncToEmpresa.delete(syncId);
        }
      });
    } catch (error: any) {
      log.error(`Erro ao iniciar download de recibos: ${error.message}`);
      res.status(500).json({ error: 'Erro ao iniciar download de recibos' });
    }
  },

  /**
   * Pausa a sincronização ativa identificada por sync_id (param da URL).
   * O loop do EcacService verifica periodicamente o flag e aguarda enquanto
   * pausado.
   */
  pausar: async (req: AuthRequest, res: Response) => {
    const syncId = parseInt(req.params.id, 10);
    const empresaId = syncToEmpresa.get(syncId);
    const ctrl = empresaId !== undefined ? activeSyncs.get(empresaId) : undefined;
    if (!ctrl) return res.status(404).json({ error: 'Sincronização ativa não encontrada' });
    ctrl.pause = true;
    return res.json({ ok: true, status: 'pausado' });
  },

  retomar: async (req: AuthRequest, res: Response) => {
    const syncId = parseInt(req.params.id, 10);
    const empresaId = syncToEmpresa.get(syncId);
    const ctrl = empresaId !== undefined ? activeSyncs.get(empresaId) : undefined;
    if (!ctrl) return res.status(404).json({ error: 'Sincronização ativa não encontrada' });
    ctrl.pause = false;
    return res.json({ ok: true, status: 'em_andamento' });
  },

  cancelar: async (req: AuthRequest, res: Response) => {
    const syncId = parseInt(req.params.id, 10);
    const empresaId = syncToEmpresa.get(syncId);
    const ctrl = empresaId !== undefined ? activeSyncs.get(empresaId) : undefined;
    if (ctrl) {
      ctrl.cancel = true;
      ctrl.pause = false; // libera o loop de pause se estiver pausado
    }
    // Sempre atualiza o banco — cobre o caso em que o backend foi reiniciado
    // e a sync ficou "órfã" no DB com status='em_andamento'.
    await runQuery(
      `UPDATE ecac_sincronizacoes
       SET status = 'cancelado', concluido_em = NOW(),
           erro_mensagem = COALESCE(erro_mensagem, 'Cancelado pelo usuário')
       WHERE id = $1 AND status = 'em_andamento'`,
      [syncId]
    ).catch(() => {});
    return res.json({ ok: true, status: ctrl ? 'cancelando' : 'cancelado' });
  },

  /**
   * Retorna o PDF do recibo já baixado (binário).
   */
  baixarReciboPdf: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const doc = await getOne<any>(
        `SELECT numero, recibo_pdf FROM ecac_perdcomp_documentos WHERE id = $1`,
        [id]
      );
      if (!doc) return res.status(404).json({ error: 'Documento não encontrado' });
      if (!doc.recibo_pdf) return res.status(404).json({ error: 'Recibo PDF ainda não foi baixado' });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="recibo_${doc.numero}.pdf"`);
      res.send(doc.recibo_pdf);
    } catch (error: any) {
      log.error(`Erro ao baixar PDF do recibo: ${error.message}`);
      res.status(500).json({ error: 'Erro ao baixar PDF' });
    }
  },

  /**
   * Sincroniza saldos_credito e movimentações a partir dos documentos e-CAC parseados.
   * - Aplica regras de retificação
   * - Normaliza status e-CAC
   * - Vincula com perdcomps do sistema (Etapa E)
   *
   * Padrão assíncrono igual à baixa de recibos: cria uma linha em ecac_sincronizacoes
   * com tipo='saldos-credito', retorna sync_id e processa em background. Frontend
   * polls GET /api/ecac/sincronizacoes/:id para acompanhar progresso.
   */
  sincronizarSaldos: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.body || {};
      if (!id_empresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });

      const empresa = await getOne<any>('SELECT id, cnpj, razao_social FROM adm_empresas WHERE id = $1', [id_empresa]);
      if (!empresa) return res.status(404).json({ error: 'Empresa não encontrada' });

      // Cria a sincronização e retorna sync_id imediatamente
      const { id: syncId } = await runQuery(
        `INSERT INTO ecac_sincronizacoes (id_empresa, id_usuario, tipo, status, iniciado_em, detalhes)
         VALUES ($1, $2, 'saldos-credito', 'em_andamento', NOW(), $3)
         RETURNING id`,
        [
          Number(id_empresa), req.user!.id,
          JSON.stringify({ progresso: 0, mensagem: 'Iniciando sincronização de saldos...' }),
        ]
      );

      log.info(`[ecac.sincronizarSaldos] Sync ${syncId} iniciado para empresa ${id_empresa}`);
      res.json({ sync_id: syncId, message: 'Sincronização iniciada' });

      // Processa em background com callback de progresso
      (async () => {
        try {
          const onProgress = async (mensagem: string, progresso: number, atual?: number, total?: number) => {
            await runQuery(
              `UPDATE ecac_sincronizacoes SET detalhes = $1 WHERE id = $2`,
              [JSON.stringify({ mensagem, progresso, atual, total }), syncId]
            );
          };

          const result = await sincronizarSaldosFromEcac(Number(id_empresa), onProgress);

          await runQuery(
            `UPDATE ecac_sincronizacoes
             SET status = 'concluido', concluido_em = NOW(),
                 creditos_importados = $1, debitos_importados = $2,
                 detalhes = $3
             WHERE id = $4`,
            [
              result.saldos_criados + result.saldos_atualizados,
              result.movimentacoes_geradas,
              JSON.stringify({
                progresso: 100,
                mensagem: `Sincronização concluída: ${result.documentos_processados} doc., ${result.saldos_criados} saldo(s) novo(s), ${result.saldos_atualizados} atualizado(s), ${result.movimentacoes_geradas} movimentação(ões).`,
                ...result,
              }),
              syncId,
            ]
          );
          log.info(`[ecac.sincronizarSaldos] Sync ${syncId} concluído`);
        } catch (err: any) {
          log.error(`[ecac.sincronizarSaldos] Sync ${syncId} falhou: ${err.message}`);
          await runQuery(
            `UPDATE ecac_sincronizacoes SET status = 'erro', erro_mensagem = $1, concluido_em = NOW() WHERE id = $2`,
            [err.message, syncId]
          ).catch(() => {});
        }
      })();
    } catch (error: any) {
      log.error(`Erro ao sincronizar saldos do e-CAC: ${error.message}`);
      res.status(500).json({ error: `Erro ao sincronizar saldos: ${error.message}` });
    }
  },

  /**
   * Lista os débitos compensados de um documento PER/DCOMP.
   */
  listarDebitosCompensados: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const debitos = await getAll<any>(
        `SELECT * FROM ecac_perdcomp_debitos_compensados WHERE id_documento = $1 ORDER BY ordem ASC`,
        [id]
      );
      res.json(debitos);
    } catch (error: any) {
      log.error(`Erro ao listar débitos compensados: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar débitos compensados' });
    }
  },

  /**
   * Retorna a sincronização ativa (status='em_andamento') mais recente
   * para uma empresa e tipo opcional. Usado pelo frontend para retomar
   * a exibição do progresso ao voltar para a página.
   */
  ativa: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, tipo } = req.query;
      if (!id_empresa) return res.status(400).json({ error: 'id_empresa é obrigatório' });
      const params: any[] = [id_empresa];
      let where = `s.id_empresa = $1 AND s.status = 'em_andamento'`;
      if (tipo) { params.push(tipo); where += ` AND s.tipo = $${params.length}`; }

      const sync = await getOne<any>(
        `SELECT s.*, e.razao_social, e.cnpj
         FROM ecac_sincronizacoes s
         JOIN adm_empresas e ON e.id = s.id_empresa
         WHERE ${where}
         ORDER BY s.iniciado_em DESC
         LIMIT 1`,
        params
      );
      if (!sync) return res.json(null);

      let detalhes = null;
      try { detalhes = sync.detalhes ? JSON.parse(sync.detalhes) : null; } catch { /* ignore */ }
      res.json({ ...sync, detalhes });
    } catch (error: any) {
      log.error(`Erro ao consultar sync ativa: ${error.message}`);
      res.status(500).json({ error: 'Erro ao consultar sync ativa' });
    }
  },

  historico: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const params: any[] = [];
      let whereClause = '';
      if (id_empresa) { params.push(id_empresa); whereClause = `WHERE s.id_empresa = $${params.length}`; }

      const syncs = await getAll<any>(
        `SELECT s.id, s.id_empresa, s.tipo, s.status,
                s.creditos_importados, s.debitos_importados, s.registros_ignorados,
                s.erro_mensagem, s.iniciado_em, s.concluido_em,
                e.razao_social, e.cnpj
         FROM ecac_sincronizacoes s
         JOIN adm_empresas e ON e.id = s.id_empresa
         ${whereClause}
         ORDER BY s.criado_em DESC
         LIMIT 50`,
        params
      );

      res.json(syncs);
    } catch (error: any) {
      log.error(`Erro ao listar histórico: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar histórico' });
    }
  },
};
