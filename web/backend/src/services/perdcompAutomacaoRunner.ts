import { getOne, getAll, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { EcacService } from './ecacService';
import { certificadoService } from './certificadoService';
import { sincronizarSaldosFromEcac } from './ecacCreditoService';
import { automacaoControl } from './perdcompAutomacaoControl';

/**
 * Runner que orquestra os fluxos do Playwright para UMA empresa.
 * Reaproveita o EcacService já testado em produção via os botões do dashboard.
 *
 * Pipeline sequencial:
 *   1. sync_documentos  → consultarPerdcompDocumentos
 *   2. baixar_recibos   → baixarRecibos (apenas pendentes >= 2018)
 *   3. baixar_documentos → baixarDocumentos (apenas pendentes >= 2018)
 *   4. sync_saldos       → reaproveita ecacCreditoService
 *
 * Cada etapa é independente — falha em uma não impede as outras.
 */

export interface AutomacaoRequest {
  id_empresa: number;
  sync_documentos: boolean;
  baixar_recibos: boolean;
  baixar_documentos: boolean;
  sync_saldos: boolean;
  /**
   * isBatch=true → executado pelo cron agendado (sujeito à janela de 18h-24h do e-CAC).
   * isBatch=false → executado manualmente pelo usuário (permitido a qualquer hora).
   */
  is_batch: boolean;
}

/**
 * Converte data do e-CAC ("dd/mm/yyyy" ou "dd/mm/yyyy hh:mm") para "yyyy-mm-dd".
 * Retorna null para strings vazias ou formatos inesperados (Postgres aceita NULL).
 */
function normalizarDataEntrega(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  // Já no formato ISO (yyyy-mm-dd)
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // dd/mm/yyyy (com ou sem hora depois)
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

/**
 * Constrói a mensagem completa: etapas já concluídas + etapa atual em progresso.
 * Formato: "sync_docs: OK (116 procesados) | recibos: nada pendente | Executando Documentos completos: Carregando..."
 * Assim o parser do frontend sempre tem as etapas concluídas E o estado atual.
 */
async function persistirEstado(idEmpresa: number, etapasConcluidas: string[], etapaAtual: string, mensagemAtual: string): Promise<void> {
  const partes = [...etapasConcluidas];
  if (etapaAtual && mensagemAtual) {
    partes.push(`Executando ${etapaAtual}: ${mensagemAtual}`);
  }
  const msgFinal = partes.join(' | ').substring(0, 1500);
  await runQuery(
    `UPDATE ecac_automacao_config SET ultima_execucao_msg = $1 WHERE id_empresa = $2`,
    [msgFinal, idEmpresa]
  ).catch(() => { /* não-bloqueante */ });
}

export interface AutomacaoResultado {
  sucesso: boolean;
  etapas: string[];
}

// Reentrant guard: evita que duas execuções concorrentes para a MESMA empresa
// corrompam o controle pause/cancel ou gerem race nas tabelas ecac_perdcomp_documentos.
const empresasEmExecucao = new Set<number>();

export async function runAutomacaoEmpresa(req: AutomacaoRequest): Promise<AutomacaoResultado> {
  const etapas: string[] = [];
  let algumaFalhou = false;

  if (empresasEmExecucao.has(req.id_empresa)) {
    log.warn(`[automacao] Empresa ${req.id_empresa} já tem pipeline em execução — ignorando disparo duplicado`);
    return { sucesso: false, etapas: ['Já existe um pipeline em execução para esta empresa'] };
  }
  empresasEmExecucao.add(req.id_empresa);

  // Garante liberação do guard mesmo em caminhos de erro (SKIP / exception)
  try {
    return await _runAutomacaoEmpresa(req, etapas, algumaFalhou);
  } finally {
    empresasEmExecucao.delete(req.id_empresa);
  }
}

async function _runAutomacaoEmpresa(
  req: AutomacaoRequest,
  etapas: string[],
  algumaFalhou: boolean,
): Promise<AutomacaoResultado> {
  // Reseta o controle de pause/cancel para esta nova execução
  automacaoControl.reset(req.id_empresa);

  // Helper: aguarda pausa e retorna true se foi cancelado
  const checarControle = async (): Promise<boolean> => {
    if (automacaoControl.isCancelled(req.id_empresa)) return true;
    if (automacaoControl.isPaused(req.id_empresa)) {
      await persistirEstado(req.id_empresa, etapas, 'Pausado', 'aguardando retomada do usuário');
      const cancelado = await automacaoControl.waitWhilePaused(req.id_empresa);
      if (cancelado) return true;
    }
    return false;
  };

  // Localiza certificado ativo com sessão válida
  const cert = await getOne<any>(
    `SELECT * FROM certificados_digitais
     WHERE id_empresa = $1 AND ativo = 1 AND senha_cifrada IS NOT NULL
     ORDER BY criado_em DESC LIMIT 1`,
    [req.id_empresa]
  );
  if (!cert) {
    etapas.push('SKIP: sem certificado ativo');
    return { sucesso: false, etapas };
  }
  if (!cert.sessao_cookies) {
    etapas.push('SKIP: sessão e-CAC não autenticada (faça login manual primeiro)');
    return { sucesso: false, etapas };
  }

  const pfxBuffer = await certificadoService.decrypt(cert.pfx_encrypted, cert.iv);
  const passphrase = await certificadoService.decryptSenha(cert.senha_cifrada);

  // ── ETAPA 1: Sincronizar lista de documentos ─────────────────────────────
  if (req.sync_documentos && !(await checarControle())) {
    try {
      const ecac = new EcacService((msg) => {
        persistirEstado(req.id_empresa, etapas, 'Lista PER/DCOMPs', msg);
      });
      const result = await ecac.consultarPerdcompDocumentos(pfxBuffer, passphrase, cert.sessao_cookies, req.is_batch);
      if (result.success) {
        // Upsert dos documentos (similar ao endpoint /ecac/importar-automatico)
        let importados = 0;
        for (const doc of result.documentos) {
          const dataEntregaIso = normalizarDataEntrega(doc.data_entrega);
          const existente = await getOne<{ id: number }>(
            `SELECT id FROM ecac_perdcomp_documentos WHERE id_empresa = $1 AND numero = $2`,
            [req.id_empresa, doc.numero]
          );
          if (existente) {
            await runQuery(
              `UPDATE ecac_perdcomp_documentos SET
                  tipo_documento = COALESCE($1, tipo_documento),
                  tipo_credito   = COALESCE($2, tipo_credito),
                  periodo_apuracao = COALESCE($3, periodo_apuracao),
                  data_entrega   = COALESCE($4, data_entrega),
                  status_ecac    = COALESCE($5, status_ecac),
                  orig_retif     = COALESCE($6, orig_retif),
                  atualizado_em  = NOW()
                WHERE id = $7`,
              [doc.tipo_documento, doc.tipo_credito, doc.periodo_apuracao, dataEntregaIso, doc.status_ecac, doc.orig_retif, existente.id]
            );
          } else {
            await runQuery(
              `INSERT INTO ecac_perdcomp_documentos
                (id_empresa, numero, tipo_documento, tipo_credito, periodo_apuracao, data_entrega, status_ecac, orig_retif)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [req.id_empresa, doc.numero, doc.tipo_documento, doc.tipo_credito, doc.periodo_apuracao, dataEntregaIso, doc.status_ecac, doc.orig_retif]
            );
            importados++;
          }
        }
        etapas.push(`sync_docs: OK (${result.total} processados, ${importados} novos)`);
      } else {
        etapas.push(`sync_docs: ERRO (${result.errors.join('; ').substring(0, 200)})`);
        algumaFalhou = true;
      }
    } catch (e: any) {
      etapas.push(`sync_docs: EXCEPTION (${e.message})`);
      algumaFalhou = true;
    }
    await persistirEstado(req.id_empresa, etapas, '', '');
  }

  // ── ETAPA 2: Baixar recibos pendentes (>= 2018) ──────────────────────────
  if (req.baixar_recibos && !(await checarControle())) {
    try {
      const pendentes = await getAll<{ numero: string }>(
        `SELECT numero FROM ecac_perdcomp_documentos
         WHERE id_empresa = $1
           AND recibo_pdf IS NULL
           AND (data_entrega IS NULL OR data_entrega >= DATE '2018-01-01')`,
        [req.id_empresa]
      );
      if (pendentes.length === 0) {
        etapas.push('recibos: nada pendente');
      } else {
        const ecac = new EcacService((msg) => {
          persistirEstado(req.id_empresa, etapas, 'Recibos PDF', msg);
        });
        const numeros = pendentes.map(p => p.numero);
        const result = await ecac.baixarRecibos(pfxBuffer, passphrase, cert.sessao_cookies, numeros, req.is_batch);
        // Persiste PDFs
        for (const [numero, pdf] of result.recibos.entries()) {
          await runQuery(
            `UPDATE ecac_perdcomp_documentos
             SET recibo_pdf = $1, recibo_baixado_em = NOW(), atualizado_em = NOW()
             WHERE id_empresa = $2 AND numero = $3`,
            [pdf, req.id_empresa, numero]
          ).catch(() => {});
        }
        etapas.push(`recibos: ${result.recibos.size}/${pendentes.length} baixados`);
      }
    } catch (e: any) {
      etapas.push(`recibos: EXCEPTION (${e.message})`);
      algumaFalhou = true;
    }
    await persistirEstado(req.id_empresa, etapas, '', '');
  }

  // ── ETAPA 3: Baixar documentos pendentes (>= 2018) ───────────────────────
  if (req.baixar_documentos && !(await checarControle())) {
    try {
      const pendentes = await getAll<{ numero: string }>(
        `SELECT numero FROM ecac_perdcomp_documentos
         WHERE id_empresa = $1
           AND documento_pdf IS NULL
           AND (data_entrega IS NULL OR data_entrega >= DATE '2018-01-01')`,
        [req.id_empresa]
      );
      if (pendentes.length === 0) {
        etapas.push('documentos: nada pendente');
      } else {
        const ecac = new EcacService((msg) => {
          persistirEstado(req.id_empresa, etapas, 'Documentos completos', msg);
        });
        const numeros = pendentes.map(p => p.numero);
        const result = await ecac.baixarDocumentos(pfxBuffer, passphrase, cert.sessao_cookies, numeros, req.is_batch);
        for (const [numero, pdf] of result.documentos.entries()) {
          await runQuery(
            `UPDATE ecac_perdcomp_documentos
             SET documento_pdf = $1, documento_baixado_em = NOW(), atualizado_em = NOW()
             WHERE id_empresa = $2 AND numero = $3`,
            [pdf, req.id_empresa, numero]
          ).catch(() => {});
        }
        etapas.push(`documentos: ${result.documentos.size}/${pendentes.length} baixados`);
      }
    } catch (e: any) {
      etapas.push(`documentos: EXCEPTION (${e.message})`);
      algumaFalhou = true;
    }
    await persistirEstado(req.id_empresa, etapas, '', '');
  }

  // ── ETAPA 4: Sincronizar saldos ──────────────────────────────────────────
  if (req.sync_saldos && !(await checarControle())) {
    try {
      const r = await sincronizarSaldosFromEcac(req.id_empresa);
      etapas.push(`saldos: ${r.saldos_criados ?? 0} criados, ${r.saldos_atualizados ?? 0} atualizados`);
    } catch (e: any) {
      etapas.push(`saldos: EXCEPTION (${e.message})`);
      algumaFalhou = true;
    }
  }

  if (automacaoControl.isCancelled(req.id_empresa)) {
    etapas.push('CANCELADO pelo usuário');
    algumaFalhou = true;
  }

  log.info(`[automacao] Empresa ${req.id_empresa}: ${etapas.join(' | ')}`);
  return { sucesso: !algumaFalhou, etapas };
}
