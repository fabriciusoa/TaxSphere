/**
 * Normalização do status retornado pelo e-CAC para um enum interno controlado.
 *
 * Estados internos (status_normalizado):
 *   - EM_ANALISE                 — Documento aguardando análise da RFB
 *   - DEFERIDO                   — Crédito reconhecido integralmente
 *   - PARCIALMENTE_DEFERIDO      — Crédito reconhecido parcialmente
 *   - INDEFERIDO                 — Crédito não reconhecido
 *   - HOMOLOGADO                 — Compensação homologada (DComp)
 *   - NAO_HOMOLOGADO             — Compensação não homologada
 *   - PARCIALMENTE_HOMOLOGADO    — Homologada em parte
 *   - CANCELADO                  — PER/DCOMP cancelado
 *   - RETIFICADO                 — Substituído por retificador
 *   - PENDENTE_DECISAO           — Aguardando decisão administrativa
 *   - DESCONHECIDO               — Status não reconhecido (fallback)
 */

export type StatusNormalizado =
  | 'EM_ANALISE'
  | 'DEFERIDO'
  | 'PARCIALMENTE_DEFERIDO'
  | 'INDEFERIDO'
  | 'HOMOLOGADO'
  | 'NAO_HOMOLOGADO'
  | 'PARCIALMENTE_HOMOLOGADO'
  | 'CANCELADO'
  | 'RETIFICADO'
  | 'PENDENTE_DECISAO'
  | 'DESCONHECIDO';

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const RULES: Array<{ match: RegExp; status: StatusNormalizado }> = [
  // Substituídos por retificador
  { match: /retificad[oa]s?(?!\s+(?:em|-))/i, status: 'RETIFICADO' },

  // Compensações
  { match: /parcialmente.*homologad/i, status: 'PARCIALMENTE_HOMOLOGADO' },
  { match: /n[aã]o.*homologad/i, status: 'NAO_HOMOLOGADO' },
  { match: /homologad/i, status: 'HOMOLOGADO' },

  // Restituições / Ressarcimentos
  { match: /parcialmente.*deferid/i, status: 'PARCIALMENTE_DEFERIDO' },
  { match: /indeferid/i, status: 'INDEFERIDO' },
  { match: /deferid/i, status: 'DEFERIDO' },

  // Cancelamento
  { match: /cancelad/i, status: 'CANCELADO' },

  // Análise / pendentes
  { match: /em.*an[aá]lise|aguardando.*an[aá]lise|em.*processamento/i, status: 'EM_ANALISE' },
  { match: /aguardando.*decis[aã]o|pendente.*decis[aã]o/i, status: 'PENDENTE_DECISAO' },

  // Estados genéricos do e-CAC
  { match: /ativo|recebid|transmitid/i, status: 'EM_ANALISE' },
];

export function normalizarStatusEcac(statusEcac: string | null | undefined): StatusNormalizado {
  if (!statusEcac) return 'DESCONHECIDO';
  const txt = stripAccents(statusEcac.trim().toLowerCase());
  for (const rule of RULES) {
    if (rule.match.test(txt) || rule.match.test(statusEcac)) {
      return rule.status;
    }
  }
  return 'DESCONHECIDO';
}

export const STATUS_LABELS: Record<StatusNormalizado, string> = {
  EM_ANALISE: 'Em Análise',
  DEFERIDO: 'Deferido',
  PARCIALMENTE_DEFERIDO: 'Parcialmente Deferido',
  INDEFERIDO: 'Indeferido',
  HOMOLOGADO: 'Homologado',
  NAO_HOMOLOGADO: 'Não Homologado',
  PARCIALMENTE_HOMOLOGADO: 'Parcialmente Homologado',
  CANCELADO: 'Cancelado',
  RETIFICADO: 'Retificado',
  PENDENTE_DECISAO: 'Pendente de Decisão',
  DESCONHECIDO: 'Desconhecido',
};

/**
 * Status que representam crédito ainda "vivo" (saldo continua disponível para uso futuro
 * caso restem créditos remanescentes). Usado para cálculos de saldo disponível.
 */
export const STATUS_CREDITO_VIVO: StatusNormalizado[] = [
  'EM_ANALISE',
  'DEFERIDO',
  'PARCIALMENTE_DEFERIDO',
  'HOMOLOGADO',
  'PARCIALMENTE_HOMOLOGADO',
  'PENDENTE_DECISAO',
];

/**
 * Status que invalidam o crédito.
 */
export const STATUS_CREDITO_PERDIDO: StatusNormalizado[] = [
  'INDEFERIDO',
  'NAO_HOMOLOGADO',
  'CANCELADO',
];

/**
 * Determina se um status normalizado conta como "consumo confirmado".
 * Conforme conversa com o cliente: o crédito é consumido na transmissão da DComp,
 * mesmo que o status posterior seja indeferido. Por isso TODOS os status fazem com
 * que a movimentação de saída seja registrada — esta função existe apenas para
 * relatórios de "compensações em risco".
 */
export function statusEhRisco(status: StatusNormalizado): boolean {
  return STATUS_CREDITO_PERDIDO.includes(status);
}
