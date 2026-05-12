/**
 * Serviço que materializa créditos e movimentações em `saldos_credito` /
 * `movimentacoes_saldo` a partir dos dados extraídos do e-CAC.
 *
 * Regras de negócio (conforme reunião com a área usuária):
 *
 * 1. Cada conjunto de PER/DCOMPs que compartilham o mesmo `numero_perdcomp_inicial`
 *    pertence ao mesmo CRÉDITO-MÃE.
 *    - O documento "fonte" do grupo é aquele que tem `valor_saldo_negativo` ou
 *      `valor_pedido` (geralmente é o primeiro DComp ou o Pedido de Restituição).
 *    - Documentos sem `numero_perdcomp_inicial` são tratados como auto-fonte
 *      (chave = `numero`).
 *
 * 2. RETIFICADORES substituem o original:
 *    - `tipo_documento = 'Retificador'` + `numero_perdcomp_inicial` apontando para
 *      o número do documento original.
 *    - O original é marcado como `status_normalizado = 'RETIFICADO'` e
 *      `retificado_por_id` aponta para o retificador.
 *    - O retificador toma o lugar do original no fluxo de saldo.
 *
 * 3. Crédito é CONSUMIDO na transmissão (mesmo se depois indeferido):
 *    - Toda DComp com `credito_original_utilizado > 0` gera 1 movimentação de
 *      SAÍDA, independentemente do status final.
 *    - O risco fica visível pelo `status_normalizado` (relatórios separam
 *      compensações em risco).
 *
 * 4. PRESCRIÇÃO: 5 anos a contar da data de entrega do pedido (`data_entrega`).
 *
 * 5. MATCH SISTEMA↔E-CAC (Etapa E): se já existe um registro em `perdcomps` com
 *    o mesmo número, vincula via `id_perdcomp_sistema`.
 */

import { getAll, getOne, runQuery, beginTransaction, commitTransaction, rollbackTransaction } from '../database/connection';
import { log } from '../utils/logger';
import { normalizarStatusEcac, STATUS_LABELS, STATUS_CREDITO_PERDIDO } from './ecacStatusNormalizer';

export interface SincronizacaoCreditoResult {
  documentos_processados: number;
  documentos_sem_recibo: number;
  retificadores_aplicados: number;
  saldos_criados: number;
  saldos_atualizados: number;
  movimentacoes_geradas: number;
  vinculacoes_sistema: number;
  alertas: string[];
}

interface EcacDoc {
  id: number;
  id_empresa: number;
  numero: string;
  numero_perdcomp_inicial: string | null;
  tipo_documento: string | null;
  tipo_credito: string | null;
  orig_retif: string | null;   // "O" (Original) ou "R" (Retificador) — vindo da listagem do e-CAC
  status_ecac: string | null;
  status_normalizado: string | null;
  data_entrega: string | null;
  exercicio: string | null;
  valor_pedido: number | null;
  valor_saldo_negativo: number | null;
  selic_acumulada: number | null;
  credito_atualizado: number | null;
  credito_original_data_entrega: number | null;
  saldo_credito_original: number | null;
  credito_original_utilizado: number | null;
  total_debitos_dcomp: number | null;
  recibo_parse_status: string | null;
  retificado_por_id: number | null;
  id_documento_retificado: number | null;
}

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().substring(0, 10);
}

function toNum(v: any): number {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Normaliza qualquer valor de data (Date object do node-postgres, string ISO,
 * string yyyy-mm-dd, ou null) para uma string "yyyy-mm-dd" comparável lexicograficamente.
 */
function toIsoDate(v: any): string {
  if (!v) return '';
  if (v instanceof Date) return v.toISOString().substring(0, 10);
  if (typeof v === 'string') {
    // Já em formato ISO ou yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.substring(0, 10);
    // Outro formato — tenta parsear
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10);
  }
  return '';
}

/**
 * Identifica se o documento é um retificador.
 *
 * A coluna `orig_retif` vem da listagem do e-CAC ("O" = Original, "R" = Retificador).
 * Como fallback, alguns recibos antigos colocavam "Retificador" no campo tipo_documento.
 * Após o ajuste do parser (que classifica tipo_documento por padrão do número:
 * Decl. Compensação / Pedido Restituição / etc), o `orig_retif` é a fonte autoritativa.
 */
function isRetificador(doc: EcacDoc): boolean {
  if (doc.orig_retif && /^r/i.test(doc.orig_retif.trim())) return true;
  if (doc.tipo_documento && /retificador/i.test(doc.tipo_documento)) return true;
  return false;
}

/**
 * Sincroniza saldos_credito + movimentações a partir dos documentos e-CAC parseados.
 * Idempotente: pode ser executado múltiplas vezes sem duplicar dados.
 *
 * @param idEmpresa  id da empresa em adm_empresas
 * @param onProgress callback opcional para reportar progresso (etapa atual + %)
 */
export async function sincronizarSaldosFromEcac(
  idEmpresa: number,
  onProgress?: (mensagem: string, progresso: number, atual?: number, total?: number) => void | Promise<void>,
): Promise<SincronizacaoCreditoResult> {
  const result: SincronizacaoCreditoResult = {
    documentos_processados: 0,
    documentos_sem_recibo: 0,
    retificadores_aplicados: 0,
    saldos_criados: 0,
    saldos_atualizados: 0,
    movimentacoes_geradas: 0,
    vinculacoes_sistema: 0,
    alertas: [],
  };

  await onProgress?.('Carregando documentos da empresa...', 5);

  // 1. Carregar todos os documentos da empresa, em ordem cronológica
  const docs = await getAll<EcacDoc>(
    `SELECT id, id_empresa, numero, numero_perdcomp_inicial, tipo_documento, tipo_credito,
            orig_retif, status_ecac, status_normalizado, data_entrega, exercicio,
            valor_pedido, valor_saldo_negativo, selic_acumulada,
            credito_atualizado, credito_original_data_entrega, saldo_credito_original,
            credito_original_utilizado, total_debitos_dcomp,
            recibo_parse_status, retificado_por_id, id_documento_retificado
     FROM ecac_perdcomp_documentos
     WHERE id_empresa = $1
     ORDER BY COALESCE(data_entrega, '9999-12-31') ASC, numero ASC`,
    [idEmpresa]
  );

  if (docs.length === 0) {
    result.alertas.push('Nenhum documento e-CAC encontrado para a empresa.');
    return result;
  }

  await onProgress?.(`Normalizando status de ${docs.length} documento(s)...`, 15);

  // 2. Normalizar status de TODOS os documentos
  for (const doc of docs) {
    const norm = normalizarStatusEcac(doc.status_ecac);
    if (doc.status_normalizado !== norm) {
      await runQuery(
        `UPDATE ecac_perdcomp_documentos SET status_normalizado = $1, atualizado_em = NOW() WHERE id = $2`,
        [norm, doc.id]
      );
      doc.status_normalizado = norm;
    }
  }

  await onProgress?.('Resolvendo vínculos de retificação...', 30);

  // 3. Resolver vínculos de retificação
  //    Quando tipo_documento='Retificador', `numero_perdcomp_inicial` aponta para o documento original.
  const docsByNumero = new Map<string, EcacDoc>(docs.map(d => [d.numero, d]));
  for (const doc of docs) {
    if (!isRetificador(doc) || !doc.numero_perdcomp_inicial) continue;
    if (doc.id_documento_retificado) continue; // já vinculado
    const original = docsByNumero.get(doc.numero_perdcomp_inicial);
    if (original && original.id !== doc.id) {
      await runQuery(
        `UPDATE ecac_perdcomp_documentos SET id_documento_retificado = $1 WHERE id = $2`,
        [original.id, doc.id]
      );
      await runQuery(
        `UPDATE ecac_perdcomp_documentos
         SET retificado_por_id = $1, status_normalizado = 'RETIFICADO', atualizado_em = NOW()
         WHERE id = $2`,
        [doc.id, original.id]
      );
      doc.id_documento_retificado = original.id;
      original.retificado_por_id = doc.id;
      original.status_normalizado = 'RETIFICADO';
      result.retificadores_aplicados++;
    } else {
      result.alertas.push(`Retificador ${doc.numero} aponta para documento inexistente (${doc.numero_perdcomp_inicial}).`);
    }
  }

  await onProgress?.('Vinculando com PER/DCOMPs do sistema...', 45);

  // 4. Match com sistema (Etapa E): vincular id_perdcomp_sistema quando existir
  for (const doc of docs) {
    const sistemaDoc = await getOne<{ id: number }>(
      `SELECT p.id FROM perdcomps p
       JOIN perdcomp_empresas pe ON pe.id = p.id_empresa
       JOIN adm_empresas ae ON ae.cnpj = pe.cnpj
       WHERE ae.id = $1 AND p.numero = $2
       LIMIT 1`,
      [idEmpresa, doc.numero]
    );
    if (sistemaDoc) {
      await runQuery(
        `UPDATE ecac_perdcomp_documentos SET id_perdcomp_sistema = $1 WHERE id = $2 AND (id_perdcomp_sistema IS DISTINCT FROM $1)`,
        [sistemaDoc.id, doc.id]
      );
      result.vinculacoes_sistema++;
    }
  }

  // 5. Filtrar apenas documentos com recibo parseado para gerar saldos/movimentações
  const docsParseados = docs.filter(d => d.recibo_parse_status === 'OK');
  result.documentos_sem_recibo = docs.length - docsParseados.length;

  if (docsParseados.length === 0) {
    result.alertas.push('Nenhum documento com recibo PDF parseado. Baixe os recibos antes de sincronizar saldos.');
    return result;
  }

  // 6. Agrupar documentos por crédito-mãe (numero_perdcomp_inicial OU numero quando é a fonte)
  //    Documentos retificados (que foram substituídos) são excluídos do agrupamento — usamos o retificador.
  const grupos = new Map<string, EcacDoc[]>();

  for (const doc of docsParseados) {
    if (doc.retificado_por_id) continue; // pular originais que foram retificados
    // Chave do crédito = numero_perdcomp_inicial (se houver) ou o próprio número
    const chave = doc.numero_perdcomp_inicial || doc.numero;
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave)!.push(doc);
  }

  log.info(`[ecacCredito] ${grupos.size} grupos de crédito identificados para empresa ${idEmpresa}`);
  await onProgress?.(`${grupos.size} grupo(s) de crédito identificado(s)`, 55, 0, grupos.size);

  // 7. Para cada grupo: criar/atualizar saldo + recriar movimentações
  let processados = 0;
  const totalGrupos = grupos.size;
  for (const [chaveCredito, items] of grupos) {
    processados++;
    const pct = 55 + Math.floor((processados / totalGrupos) * 40); // 55→95%
    await onProgress?.(
      `Processando crédito ${processados}/${totalGrupos}: ${chaveCredito}`,
      pct,
      processados,
      totalGrupos,
    );
    try {
      const r = await processarGrupoCredito(idEmpresa, chaveCredito, items);
      if (r.criado) result.saldos_criados++;
      else result.saldos_atualizados++;
      result.movimentacoes_geradas += r.movimentacoes;
      result.documentos_processados += items.length;
    } catch (err: any) {
      log.error(`[ecacCredito] Erro ao processar grupo ${chaveCredito}: ${err.message}`);
      result.alertas.push(`Grupo ${chaveCredito}: ${err.message}`);
    }
  }

  await onProgress?.('Finalizando...', 95);
  return result;
}

interface GrupoResult {
  criado: boolean;
  movimentacoes: number;
}

async function processarGrupoCredito(
  idEmpresa: number,
  chaveCredito: string,
  items: EcacDoc[],
): Promise<GrupoResult> {
  // 1. Identificar a "fonte" do crédito — documento que tem o saldo negativo / valor do pedido
  const fonte =
    items.find(d => toNum(d.valor_saldo_negativo) > 0)
    || items.find(d => toNum(d.valor_pedido) > 0)
    || items.find(d => toNum(d.credito_atualizado) > 0)
    || items[0];

  const valorOriginal = toNum(fonte.valor_saldo_negativo) || toNum(fonte.valor_pedido) || toNum(fonte.credito_original_data_entrega) || 0;
  const creditoAtualizado = toNum(fonte.credito_atualizado) || valorOriginal;

  if (valorOriginal <= 0 && creditoAtualizado <= 0) {
    // Conforme regra de negócio (conversa com Ataíde Marcelo): o crédito é cadastrado
    // MANUALMENTE no sistema. As DCOMPs apenas consomem crédito existente. Quando uma
    // DCOMP referencia um PER/DCOMP inicial (numero_perdcomp_inicial) que não está em
    // nossa base, significa que o crédito-mãe precisa ser cadastrado manualmente.
    log.info(
      `[ecacCredito] Grupo ${chaveCredito} sem valor de crédito identificável no PDF. ` +
      `Esses documentos provavelmente referenciam um crédito que precisa ser cadastrado ` +
      `manualmente (PER/DCOMP inicial não importado ou crédito de origem judicial/manual).`
    );
    return { criado: false, movimentacoes: 0 };
  }

  const tipoCredito = fonte.tipo_credito || 'Não Especificado';
  const dataEntrega = toIsoDate(fonte.data_entrega) || null;
  const dataPrescricao = dataEntrega ? addYears(dataEntrega, 5) : null;
  const exercicio = fonte.exercicio || (dataEntrega ? dataEntrega.substring(0, 4) : '—');
  const periodoApur = exercicio;
  const selic = toNum(fonte.selic_acumulada);

  // 2. Determinar status_normalizado do crédito como um todo
  //    - Se todos itens vivos OK → o do mais recente
  //    - Se qualquer um indeferido/cancelado → 'EM_RISCO_PARCIAL' (refletido em alerta)
  const statusVivos = items.filter(d => d.status_normalizado && !STATUS_CREDITO_PERDIDO.includes(d.status_normalizado as any));
  const statusGrupo = statusVivos.length > 0
    ? (statusVivos[statusVivos.length - 1].status_normalizado || 'EM_ANALISE')
    : (items[items.length - 1].status_normalizado || 'DESCONHECIDO');

  // 3. Upsert em saldos_credito (chave = id_documento_ecac da fonte)
  const trx = await beginTransaction();
  let saldoId: number;
  let criado = false;
  let movimentacoesGeradas = 0;

  try {
    const existing = await trx.query(
      `SELECT id FROM saldos_credito WHERE id_documento_ecac = $1 LIMIT 1`,
      [fonte.id]
    );

    if (existing.rows.length > 0) {
      saldoId = existing.rows[0].id;
      await trx.query(
        `UPDATE saldos_credito SET
           tipo_credito = $1, exercicio = $2, periodo_apuracao = $3,
           valor_saldo_negativo = $4, selic_acumulada = $5, credito_atualizado = $6,
           data_entrega_pedido = $7, data_prescricao = $8, status_normalizado = $9,
           numero_perdcomp_origem = $10, atualizado_em = NOW()
         WHERE id = $11`,
        [tipoCredito, exercicio, periodoApur, valorOriginal, selic, creditoAtualizado,
         dataEntrega, dataPrescricao, statusGrupo, chaveCredito, saldoId]
      );
    } else {
      const ins = await trx.query(
        `INSERT INTO saldos_credito
          (id_empresa, numero_perdcomp_origem, id_documento_ecac, tipo_credito, exercicio,
           periodo_apuracao, valor_saldo_negativo, selic_acumulada, credito_atualizado,
           total_utilizado, saldo_disponivel, data_referencia, origem,
           data_entrega_pedido, data_prescricao, status_normalizado, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $9, NOW(), 'ECAC', $10, $11, $12, $13)
         RETURNING id`,
        [
          idEmpresa, chaveCredito, fonte.id, tipoCredito, exercicio,
          periodoApur, valorOriginal, selic, creditoAtualizado,
          dataEntrega, dataPrescricao, statusGrupo,
          `Crédito sincronizado automaticamente do e-CAC. Documento fonte: ${fonte.numero}`,
        ]
      );
      saldoId = ins.rows[0].id;
      criado = true;
    }

    // Mas saldos_credito requer que numero_perdcomp_origem seja a empresa de perdcomp_empresas
    // Atenção: a tabela referencia perdcomp_empresas mas na nossa importação id_empresa = adm_empresas.id
    // Ah não, olhando o schema: saldos_credito.id_empresa REFERENCES perdcomp_empresas(id) — temos um mismatch!

    // 4. Limpar movimentações antigas vindas do e-CAC desse saldo (idempotência)
    await trx.query(
      `DELETE FROM movimentacoes_saldo WHERE id_saldo_credito = $1 AND id_documento_ecac IS NOT NULL`,
      [saldoId]
    );

    // 5. Recriar movimentações: 1 entrada inicial + saídas conforme uso
    let saldoCorrente = creditoAtualizado;
    await trx.query(
      `INSERT INTO movimentacoes_saldo
        (id_saldo_credito, id_documento_ecac, numero_perdcomp, tipo, valor, saldo_apos, descricao, data_movimentacao)
       VALUES ($1, $2, $3, 'entrada', $4, $5, $6, $7)`,
      [
        saldoId, fonte.id, fonte.numero, creditoAtualizado, saldoCorrente,
        `Entrada de crédito (${fonte.tipo_documento || 'PER/DCOMP'} ${fonte.numero})`,
        dataEntrega || new Date().toISOString().substring(0, 10),
      ]
    );
    movimentacoesGeradas++;

    // Saídas: ordenar por data_entrega (normalizada para string ISO)
    const consumidores = items
      .filter(d => toNum(d.credito_original_utilizado) > 0)
      .sort((a, b) => toIsoDate(a.data_entrega).localeCompare(toIsoDate(b.data_entrega)));

    for (const cons of consumidores) {
      const utilizado = toNum(cons.credito_original_utilizado);
      saldoCorrente -= utilizado;
      const isRisco = STATUS_CREDITO_PERDIDO.includes((cons.status_normalizado || 'DESCONHECIDO') as any);
      await trx.query(
        `INSERT INTO movimentacoes_saldo
          (id_saldo_credito, id_documento_ecac, numero_perdcomp, tipo, valor, saldo_apos, descricao, data_movimentacao)
         VALUES ($1, $2, $3, 'saida', $4, $5, $6, $7)`,
        [
          saldoId, cons.id, cons.numero, utilizado, saldoCorrente,
          `Compensação ${cons.numero}${isRisco ? ' [RISCO: ' + STATUS_LABELS[(cons.status_normalizado || 'DESCONHECIDO') as keyof typeof STATUS_LABELS] + ']' : ''}`,
          toIsoDate(cons.data_entrega) || new Date().toISOString().substring(0, 10),
        ]
      );
      movimentacoesGeradas++;
    }

    // 6. Atualizar totais do saldo
    const totalUtilizado = creditoAtualizado - saldoCorrente;
    await trx.query(
      `UPDATE saldos_credito SET total_utilizado = $1, saldo_disponivel = $2, atualizado_em = NOW() WHERE id = $3`,
      [totalUtilizado, saldoCorrente, saldoId]
    );

    await commitTransaction(trx);
    return { criado, movimentacoes: movimentacoesGeradas };
  } catch (err) {
    await rollbackTransaction(trx);
    throw err;
  }
}
