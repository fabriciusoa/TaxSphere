/**
 * Runner que orquestra o pipeline DCTFWeb para UMA empresa.
 *
 * Pipeline sequencial (espelha perdcompAutomacaoRunner):
 *   1. sync_declaracoes   → consulta lista no e-CAC e upsert em dctfweb_declaracoes
 *   2. baixar_recibos     → baixa PDFs dos recibos das declarações pendentes
 *   3. consultar_darfs    → grade de DARFs gerados em dctfweb_darfs
 *   4. alertar_vencimento → produz log/notificação para DARFs vencendo
 *
 * Reaproveita o EcacService (mesma sessão mTLS) — não cria novo browser.
 */
import { getOne, getAll, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { EcacService } from './ecacService';
import { certificadoService } from './certificadoService';
import { DctfwebRpaService, type DctfwebDeclaracaoBruta, type DctfwebDarfBruto } from './dctfwebRpaService';
import { dctfwebControl } from './dctfwebAutomacaoControl';
import { calcularPrazoLegal, calcularMaed, detectaImpedimentoCnd, type CategoriaDctfweb } from './dctfwebRegrasService';
import { storageService, buildStoragePath } from './storageService';

export interface DctfwebAutomacaoRequest {
  id_empresa: number;
  sync_declaracoes: boolean;
  baixar_recibos: boolean;
  consultar_darfs: boolean;
  alertar_vencimento: boolean;
  is_batch: boolean;
}

export interface DctfwebAutomacaoResultado {
  sucesso: boolean;
  etapas: string[];
}

const empresasEmExecucao = new Set<number>();

// (normalização agora vem do regrasService — alinhada ao manual oficial)

async function persistirEstado(idEmpresa: number, etapasConcluidas: string[], etapaAtual: string, mensagemAtual: string): Promise<void> {
  const partes = [...etapasConcluidas];
  if (etapaAtual && mensagemAtual) partes.push(`Executando ${etapaAtual}: ${mensagemAtual}`);
  const msgFinal = partes.join(' | ').substring(0, 1500);
  await runQuery(
    `UPDATE dctfweb_automacao_config SET ultima_execucao_msg = $1 WHERE id_empresa = $2`,
    [msgFinal, idEmpresa]
  ).catch(() => {});
}

async function upsertDeclaracao(idEmpresa: number, d: DctfwebDeclaracaoBruta): Promise<void> {
  // Calcula prazo legal conforme cap. 4.2 do manual (varia por categoria).
  const prazoLegal = calcularPrazoLegal(d.categoria as CategoriaDctfweb, d.periodo_apuracao);

  // Detecta atraso: data_transmissao após prazo_legal, ou ainda em andamento com prazo vencido.
  let entregueEmAtraso = false;
  let diasAtraso = 0;
  if (prazoLegal) {
    if (d.data_transmissao) {
      const dt = new Date(d.data_transmissao);
      const ms = dt.getTime() - prazoLegal.getTime();
      if (ms > 0) {
        entregueEmAtraso = true;
        diasAtraso = Math.ceil(ms / 86_400_000);
      }
    } else if (d.situacao_normalizada === 'EM_ANDAMENTO') {
      const ms = Date.now() - prazoLegal.getTime();
      if (ms > 0) diasAtraso = Math.ceil(ms / 86_400_000);
    }
  }

  // MAED (cap. 5): só para ORIGINAL em atraso
  const maed = (d.tipo === 'ORIGINAL' && diasAtraso > 0)
    ? calcularMaed({ debito_apurado: d.debito_apurado, dias_atraso: diasAtraso, regime: 'NORMAL' }).com_reducao.multa_final
    : 0;

  // Impedimento de CND (cap. 17.1.1): retificadora em andamento
  const impede = detectaImpedimentoCnd({
    tipo: d.tipo,
    situacao_normalizada: d.situacao_normalizada,
    id_declaracao_original: null,
  });

  await runQuery(
    `INSERT INTO dctfweb_declaracoes
       (id_empresa, periodo_apuracao, categoria, tipo,
        situacao, situacao_normalizada,
        debito_apurado, credito_vinculado, saldo_pagar,
        numero_recibo, data_transmissao, data_recepcao,
        prazo_legal, entregue_em_atraso, dias_atraso,
        maed_valor, impede_cnd, impede_cnd_motivo)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
     ON CONFLICT (id_empresa, periodo_apuracao, categoria, tipo) DO UPDATE SET
       situacao = EXCLUDED.situacao,
       situacao_normalizada = EXCLUDED.situacao_normalizada,
       debito_apurado = EXCLUDED.debito_apurado,
       credito_vinculado = EXCLUDED.credito_vinculado,
       saldo_pagar = EXCLUDED.saldo_pagar,
       numero_recibo = COALESCE(EXCLUDED.numero_recibo, dctfweb_declaracoes.numero_recibo),
       data_transmissao = COALESCE(EXCLUDED.data_transmissao, dctfweb_declaracoes.data_transmissao),
       data_recepcao = COALESCE(EXCLUDED.data_recepcao, dctfweb_declaracoes.data_recepcao),
       prazo_legal = COALESCE(EXCLUDED.prazo_legal, dctfweb_declaracoes.prazo_legal),
       entregue_em_atraso = EXCLUDED.entregue_em_atraso,
       dias_atraso = EXCLUDED.dias_atraso,
       maed_valor = EXCLUDED.maed_valor,
       impede_cnd = EXCLUDED.impede_cnd,
       impede_cnd_motivo = EXCLUDED.impede_cnd_motivo,
       atualizado_em = NOW()`,
    [
      idEmpresa, d.periodo_apuracao, d.categoria, d.tipo,
      d.situacao, d.situacao_normalizada,
      d.debito_apurado, d.credito_vinculado, d.saldo_pagar,
      d.numero_recibo || null, d.data_transmissao, d.data_recepcao,
      prazoLegal, entregueEmAtraso, diasAtraso,
      maed, impede.impede, impede.motivo || null,
    ]
  );
}

async function upsertDarf(idEmpresa: number, periodoApuracao: string, darf: DctfwebDarfBruto): Promise<void> {
  // Liga ao id_declaracao se já existe (mesmo período × empresa); senão cria órfão.
  const decl = await getOne<{ id: number }>(
    `SELECT id FROM dctfweb_declaracoes WHERE id_empresa = $1 AND periodo_apuracao = $2 LIMIT 1`,
    [idEmpresa, periodoApuracao]
  );
  if (!decl) {
    log.warn(`[dctfweb-runner] DARF de empresa ${idEmpresa} período ${periodoApuracao} sem declaração-pai — ignorando`);
    return;
  }
  await runQuery(
    `INSERT INTO dctfweb_darfs
       (id_declaracao, id_empresa, codigo_receita, denominacao,
        periodo_apuracao, vencimento, principal, multa, juros, total,
        numero_documento, codigo_barras)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT DO NOTHING`,
    [
      decl.id, idEmpresa, darf.codigo_receita, darf.denominacao,
      darf.periodo_apuracao, darf.vencimento,
      darf.principal, darf.multa, darf.juros, darf.total,
      darf.numero_documento, darf.codigo_barras,
    ]
  );
}

/**
 * Persiste um arquivo baixado (Recibo, DARF, Espelho) no storage configurado
 * e registra metadata em dctfweb_arquivos. UPSERT por (id_empresa, tipo, numero_recibo, numero_documento).
 */
async function persistirArquivo(p: {
  id_empresa: number;
  tipo: 'RECIBO_PDF' | 'DARF_PDF' | 'ESPELHO_XML';
  periodo_apuracao?: string | null;
  numero_recibo?: string | null;
  numero_documento?: string | null;
  ext: 'pdf' | 'xml';
  content_type: string;
  buffer: Buffer;
  fonte: 'RPA' | 'SERPRO_API' | 'UPLOAD';
}): Promise<void> {
  const identificador = p.numero_documento || p.numero_recibo || `${Date.now()}`;
  const relPath = buildStoragePath({
    id_empresa: p.id_empresa,
    tipo: p.tipo,
    periodo_apuracao: p.periodo_apuracao,
    identificador,
    ext: p.ext,
  });
  const up = await storageService.upload(relPath, p.buffer, p.content_type);

  // Vincula a declaracao/darf pelos identificadores quando possível
  const decl = p.numero_recibo
    ? await getOne<{ id: number }>(
      `SELECT id FROM dctfweb_declaracoes WHERE id_empresa = $1 AND numero_recibo = $2 LIMIT 1`,
      [p.id_empresa, p.numero_recibo]
    )
    : null;
  const darf = p.numero_documento
    ? await getOne<{ id: number }>(
      `SELECT id FROM dctfweb_darfs WHERE id_empresa = $1 AND numero_documento = $2 LIMIT 1`,
      [p.id_empresa, p.numero_documento]
    )
    : null;

  await runQuery(
    `INSERT INTO dctfweb_arquivos
       (id_empresa, id_declaracao, id_darf, tipo, numero_recibo, numero_documento,
        periodo_apuracao, storage_backend, storage_path, content_type, tamanho_bytes,
        sha256, fonte)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     ON CONFLICT (id_empresa, tipo, numero_recibo, numero_documento) DO UPDATE SET
       id_declaracao = COALESCE(EXCLUDED.id_declaracao, dctfweb_arquivos.id_declaracao),
       id_darf = COALESCE(EXCLUDED.id_darf, dctfweb_arquivos.id_darf),
       storage_backend = EXCLUDED.storage_backend,
       storage_path = EXCLUDED.storage_path,
       tamanho_bytes = EXCLUDED.tamanho_bytes,
       sha256 = EXCLUDED.sha256,
       baixado_em = NOW()`,
    [
      p.id_empresa, decl?.id || null, darf?.id || null, p.tipo,
      p.numero_recibo || null, p.numero_documento || null,
      p.periodo_apuracao || null, up.backend, up.path, p.content_type, up.tamanho,
      up.sha256, p.fonte,
    ]
  ).catch((e) => log.warn(`[dctfweb-runner] persistirArquivo: ${e.message}`));
}

export async function runDctfwebEmpresa(req: DctfwebAutomacaoRequest): Promise<DctfwebAutomacaoResultado> {
  const etapas: string[] = [];
  let algumaFalhou = false;
  let pipelineFinalizadoNoCorpo = false; // flag pra evitar dupla finalização

  if (empresasEmExecucao.has(req.id_empresa)) {
    log.warn(`[dctfweb-runner] Empresa ${req.id_empresa} já em execução — disparo duplicado ignorado`);
    return { sucesso: false, etapas: ['Já existe pipeline em execução para esta empresa'] };
  }
  empresasEmExecucao.add(req.id_empresa);
  // Reseta controle pause/cancel para esta nova execução
  dctfwebControl.reset(req.id_empresa);

  // Helper: checa pause/cancel antes de cada etapa. Retorna true se foi cancelado.
  const checarControle = async (): Promise<boolean> => {
    if (dctfwebControl.isCancelled(req.id_empresa)) return true;
    if (dctfwebControl.isPaused(req.id_empresa)) {
      await persistirEstado(req.id_empresa, etapas, 'Pausado', 'aguardando retomada do usuário');
      const cancelado = await dctfwebControl.waitWhilePaused(req.id_empresa);
      if (cancelado) return true;
    }
    return false;
  };

  try {
    // Marca início
    await runQuery(
      `INSERT INTO dctfweb_automacao_config (id_empresa, ultima_execucao, ultima_execucao_status, ultima_execucao_msg)
       VALUES ($1, NOW(), 'em_andamento', 'Iniciando pipeline DCTFweb')
       ON CONFLICT (id_empresa) DO UPDATE SET
         ultima_execucao = NOW(),
         ultima_execucao_status = 'em_andamento',
         ultima_execucao_msg = 'Iniciando pipeline DCTFweb'`,
      [req.id_empresa]
    );

    // Localiza certificado ativo com sessão
    const cert = await getOne<any>(
      `SELECT * FROM certificados_digitais
        WHERE id_empresa = $1 AND ativo = 1 AND senha_cifrada IS NOT NULL
        ORDER BY criado_em DESC LIMIT 1`,
      [req.id_empresa]
    );
    if (!cert) {
      etapas.push('SKIP: sem certificado ativo');
      pipelineFinalizadoNoCorpo = true;
      return finalizar(req.id_empresa, false, etapas);
    }
    if (!cert.sessao_cookies) {
      etapas.push('SKIP: sessão e-CAC não autenticada (faça login manual primeiro)');
      pipelineFinalizadoNoCorpo = true;
      return finalizar(req.id_empresa, false, etapas);
    }

    const pfxBuffer = await certificadoService.decrypt(cert.pfx_encrypted, cert.iv);
    const passphrase = await certificadoService.decryptSenha(cert.senha_cifrada);

    // Reusa toda a infra do EcacService: mTLS + injeção de cookies + sessão e-CAC
    const ecac = new EcacService((msg) => persistirEstado(req.id_empresa, etapas, 'sessao', msg));
    const dctfweb = new DctfwebRpaService((msg) => persistirEstado(req.id_empresa, etapas, 'DCTFweb', msg));

    try {
      const paginaAutenticada = await ecac.prepararSessaoAutenticada(pfxBuffer, passphrase, cert.sessao_cookies);
      dctfweb.usarPaginaAutenticada(paginaAutenticada);

      // ── ETAPA 1 ────────────────────────────────────────────────────────────
      if (req.sync_declaracoes && !(await checarControle())) {
        try {
          const r = await dctfweb.consultarDeclaracoes();
          if (r.success) {
            for (const d of r.data) await upsertDeclaracao(req.id_empresa, d);
            etapas.push(`sync_decl: OK (${r.data.length} processadas)`);
            if (r.errors.length) etapas[etapas.length - 1] += ` [${r.errors[0]}]`;
          } else {
            etapas.push(`sync_decl: ERRO (${r.errors.join('; ').slice(0, 150)})`);
            algumaFalhou = true;
          }
        } catch (e: any) {
          etapas.push(`sync_decl: EXCEPTION (${e.message})`);
          algumaFalhou = true;
        }
        await persistirEstado(req.id_empresa, etapas, '', '');
      }

      // ── ETAPA 2 ────────────────────────────────────────────────────────────
      // Baixa Recibo (PDF) + Espelho (XML) das declarações ainda sem arquivos no storage.
      if (req.baixar_recibos && !(await checarControle())) {
        try {
          const pendentes = await getAll<{ numero_recibo: string; periodo_apuracao: string }>(
            `SELECT d.numero_recibo, d.periodo_apuracao
               FROM dctfweb_declaracoes d
              WHERE d.id_empresa = $1
                AND d.numero_recibo IS NOT NULL
                AND NOT EXISTS (
                  SELECT 1 FROM dctfweb_arquivos a
                   WHERE a.id_empresa = d.id_empresa
                     AND a.tipo = 'RECIBO_PDF'
                     AND a.numero_recibo = d.numero_recibo
                )`,
            [req.id_empresa]
          );
          const numeros = pendentes.map(p => p.numero_recibo);
          const periodoPor = new Map(pendentes.map(p => [p.numero_recibo, p.periodo_apuracao]));

          if (numeros.length === 0) {
            etapas.push('recibos: nada pendente');
          } else {
            const pdfs = await dctfweb.baixarRecibos(numeros);
            for (const [numero, pdf] of pdfs.entries()) {
              await persistirArquivo({
                id_empresa: req.id_empresa,
                tipo: 'RECIBO_PDF',
                periodo_apuracao: periodoPor.get(numero) || null,
                numero_recibo: numero,
                ext: 'pdf',
                content_type: 'application/pdf',
                buffer: pdf,
                fonte: 'RPA',
              });
            }
            etapas.push(`recibos: ${pdfs.size}/${numeros.length} baixados`);

            // Espelho XML — best-effort (não falha pipeline se zero)
            try {
              const xmls = await dctfweb.baixarEspelhosXml(numeros);
              for (const [numero, xml] of xmls.entries()) {
                await persistirArquivo({
                  id_empresa: req.id_empresa,
                  tipo: 'ESPELHO_XML',
                  periodo_apuracao: periodoPor.get(numero) || null,
                  numero_recibo: numero,
                  ext: 'xml',
                  content_type: 'application/xml',
                  buffer: xml,
                  fonte: 'RPA',
                });
              }
              if (xmls.size > 0) etapas[etapas.length - 1] += ` | espelhos: ${xmls.size}`;
            } catch { /* espelho é opcional */ }
          }
        } catch (e: any) {
          etapas.push(`recibos: EXCEPTION (${e.message})`);
          algumaFalhou = true;
        }
        await persistirEstado(req.id_empresa, etapas, '', '');
      }

      // ── ETAPA 3 ────────────────────────────────────────────────────────────
      // Lista DARFs e baixa o PDF de cada um que ainda não está no storage.
      if (req.consultar_darfs && !(await checarControle())) {
        try {
          const r = await dctfweb.consultarDarfs();
          if (r.success) {
            for (const d of r.data) await upsertDarf(req.id_empresa, d.periodo_apuracao, d);
            etapas.push(`darfs: OK (${r.data.length} consultados)`);

            // Baixa PDF dos DARFs novos (números de documento ainda não persistidos)
            const numerosPendentes = r.data
              .map(d => d.numero_documento)
              .filter((n): n is string => !!n);
            if (numerosPendentes.length > 0) {
              const jaSalvos = await getAll<{ numero_documento: string }>(
                `SELECT numero_documento FROM dctfweb_arquivos
                  WHERE id_empresa = $1 AND tipo = 'DARF_PDF'
                    AND numero_documento = ANY($2)`,
                [req.id_empresa, numerosPendentes]
              );
              const jaSet = new Set(jaSalvos.map(j => j.numero_documento));
              const aBaixar = numerosPendentes.filter(n => !jaSet.has(n));
              if (aBaixar.length > 0) {
                try {
                  const pdfs = await dctfweb.baixarDarfsPdf(aBaixar);
                  for (const [numero, pdf] of pdfs.entries()) {
                    const darfMeta = r.data.find(d => d.numero_documento === numero);
                    await persistirArquivo({
                      id_empresa: req.id_empresa,
                      tipo: 'DARF_PDF',
                      periodo_apuracao: darfMeta?.periodo_apuracao || null,
                      numero_documento: numero,
                      ext: 'pdf',
                      content_type: 'application/pdf',
                      buffer: pdf,
                      fonte: 'RPA',
                    });
                  }
                  etapas[etapas.length - 1] += ` | DARFs PDF: ${pdfs.size}/${aBaixar.length}`;
                } catch (e: any) {
                  log.warn(`[dctfweb-runner] baixarDarfsPdf: ${e.message}`);
                }
              }
            }
          } else {
            etapas.push(`darfs: ERRO (${r.errors.join('; ').slice(0, 150)})`);
            algumaFalhou = true;
          }
        } catch (e: any) {
          etapas.push(`darfs: EXCEPTION (${e.message})`);
          algumaFalhou = true;
        }
        await persistirEstado(req.id_empresa, etapas, '', '');
      }

      // ── ETAPA 4 ────────────────────────────────────────────────────────────
      if (req.alertar_vencimento && !(await checarControle())) {
        try {
          const diasGlobal = await getOne<{ dias: number }>(
            `SELECT dias_antes_vencimento_alertar AS dias FROM dctfweb_automacao_config_global WHERE id = 1`
          );
          const dias = diasGlobal?.dias ?? 3;
          const proximas = await getOne<{ n: number }>(
            `SELECT COUNT(*)::int AS n FROM dctfweb_darfs
              WHERE id_empresa = $1 AND pago = FALSE
                AND vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + ($2::int))`,
            [req.id_empresa, dias]
          );
          // Aqui poderíamos enviar email/notificação via notificacoesController.
          // Por enquanto só registramos no log + mensagem da etapa.
          log.info(`[dctfweb-alerta] Empresa ${req.id_empresa} tem ${proximas?.n || 0} DARF(s) vencendo em ${dias}d`);
          etapas.push(`alertas: ${proximas?.n || 0} DARF(s) vencendo em ${dias}d`);
        } catch (e: any) {
          etapas.push(`alertas: EXCEPTION (${e.message})`);
          algumaFalhou = true;
        }
        await persistirEstado(req.id_empresa, etapas, '', '');
      }
    } finally {
      try { await ecac.encerrar(); } catch { /* ignore */ }
    }

    // Se foi cancelado, marca como cancelado mesmo se nenhuma etapa falhou
    if (dctfwebControl.isCancelled(req.id_empresa)) {
      etapas.push('CANCELADO pelo usuário');
      pipelineFinalizadoNoCorpo = true;
      return finalizar(req.id_empresa, false, etapas);
    }

    pipelineFinalizadoNoCorpo = true;
    return finalizar(req.id_empresa, !algumaFalhou, etapas);
  } catch (fatal: any) {
    // Qualquer exceção não tratada no corpo (ex: ecac.prepararSessao falha,
    // crash do Playwright, etc.) é capturada aqui para garantir que o status
    // seja atualizado — caso contrário a empresa fica para sempre em "em_andamento".
    log.error(`[dctfweb-runner] Empresa ${req.id_empresa} FATAL: ${fatal.message}`);
    etapas.push(`FATAL: ${fatal.message?.slice(0, 200) || 'erro desconhecido'}`);
    pipelineFinalizadoNoCorpo = true;
    return finalizar(req.id_empresa, false, etapas);
  } finally {
    // Cinto + suspensório: se por algum motivo nem o try nem o catch alcançaram
    // finalizar() (por exemplo, throw síncrono no INSERT inicial), garantimos
    // que o status sai de 'em_andamento' aqui.
    if (!pipelineFinalizadoNoCorpo) {
      try {
        await finalizar(req.id_empresa, false, etapas.length ? etapas : ['Pipeline terminou em estado desconhecido']);
      } catch { /* ignore */ }
    }
    empresasEmExecucao.delete(req.id_empresa);
  }
}

async function finalizar(idEmpresa: number, sucesso: boolean, etapas: string[]): Promise<DctfwebAutomacaoResultado> {
  await runQuery(
    `UPDATE dctfweb_automacao_config
        SET ultima_execucao = NOW(),
            ultima_execucao_status = $1,
            ultima_execucao_msg = $2,
            atualizado_em = NOW()
      WHERE id_empresa = $3`,
    [sucesso ? 'concluido' : 'erro', etapas.join(' | ').substring(0, 1500), idEmpresa]
  ).catch(() => {});
  log.info(`[dctfweb-runner] Empresa ${idEmpresa} → ${sucesso ? 'OK' : 'ERRO'} (${etapas.join(' | ')})`);
  return { sucesso, etapas };
}
