import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne } from '../database/connection';
import { log } from '../utils/logger';

/**
 * BI / KPIs do módulo PERDCOMP.
 * Um endpoint único agrega todos os dados necessários para o dashboard,
 * evitando N round-trips do frontend.
 *
 * Query params:
 *   id_empresa? (opcional, restringe ao escopo de uma empresa)
 *   periodo_inicio? / periodo_fim? (YYYY-MM-DD, filtram data_entrega)
 */

const STATUS_BUCKETS = [
  { chave: 'deferido',   labels: ['deferido', 'homologado'] },
  { chave: 'indeferido', labels: ['indeferido', 'cancelado'] },
  { chave: 'analise',    labels: ['análise', 'analise', 'ativo'] },
  { chave: 'retificado', labels: ['retificado'] },
];

function classificaStatus(s: string | null): string {
  if (!s) return 'outros';
  const v = s.toLowerCase();
  for (const b of STATUS_BUCKETS) {
    if (b.labels.some(l => v.includes(l))) return b.chave;
  }
  return 'outros';
}

export const perdcompBIController = {
  dashboard: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, ids_empresas, periodo_inicio, periodo_fim } = req.query as Record<string, string | undefined>;

      const params: any[] = [];
      const whereClauses: string[] = [];
      // Suporta tanto id_empresa único quanto ids_empresas (CSV) — multi-select.
      const idsList = (ids_empresas ? ids_empresas.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0) : [])
        .concat(id_empresa ? [Number(id_empresa)] : []);
      if (idsList.length === 1) {
        params.push(idsList[0]);
        whereClauses.push(`d.id_empresa = $${params.length}`);
      } else if (idsList.length > 1) {
        params.push(idsList);
        whereClauses.push(`d.id_empresa = ANY($${params.length}::int[])`);
      }
      if (periodo_inicio) {
        params.push(periodo_inicio);
        whereClauses.push(`d.data_entrega >= $${params.length}::date`);
      }
      if (periodo_fim) {
        params.push(periodo_fim);
        whereClauses.push(`d.data_entrega <= $${params.length}::date`);
      }
      const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';

      // KPIs agregados — uma única query
      const kpis = await getOne<any>(
        `SELECT
            COUNT(*)::int                                          AS total_documentos,
            COUNT(DISTINCT d.id_empresa)::int                       AS total_empresas,
            COALESCE(SUM(d.valor_pedido), 0)::float                 AS valor_solicitado,
            COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float           AS credito_atualizado,
            COALESCE(SUM(d.saldo_credito_original), 0)::float       AS credito_original,
            COALESCE(SUM(d.credito_original_utilizado), 0)::float   AS credito_utilizado,
            COALESCE(SUM(d.total_debitos_dcomp), 0)::float          AS debitos_compensados,
            COUNT(*) FILTER (WHERE d.recibo_pdf IS NOT NULL)::int   AS docs_com_recibo,
            COUNT(*) FILTER (WHERE d.documento_pdf IS NOT NULL)::int AS docs_com_pdf,
            COUNT(*) FILTER (WHERE d.data_entrega < DATE '2018-01-01')::int AS docs_legados
         FROM ecac_perdcomp_documentos d
         ${where}`,
        params
      );

      // Distribuição por status_ecac
      const statusBruto = await getAll<{ status_ecac: string | null; total: number; valor: number }>(
        `SELECT d.status_ecac,
                COUNT(*)::int AS total,
                COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float AS valor
         FROM ecac_perdcomp_documentos d
         ${where}
         GROUP BY d.status_ecac
         ORDER BY total DESC`,
        params
      );
      // Reclassifica em buckets canônicos
      const statusMap = new Map<string, { total: number; valor: number }>();
      for (const row of statusBruto) {
        const k = classificaStatus(row.status_ecac);
        const cur = statusMap.get(k) || { total: 0, valor: 0 };
        cur.total += row.total;
        cur.valor += Number(row.valor) || 0;
        statusMap.set(k, cur);
      }
      const statusDistribuicao = Array.from(statusMap.entries())
        .map(([chave, v]) => ({ chave, ...v }))
        .sort((a, b) => b.total - a.total);

      // Taxa de deferimento (fechados = deferido + indeferido)
      const deferido = statusMap.get('deferido')?.total || 0;
      const indeferido = statusMap.get('indeferido')?.total || 0;
      const taxaDeferimento = (deferido + indeferido) > 0
        ? (deferido / (deferido + indeferido)) * 100
        : null;

      // Evolução temporal: docs por mês (últimos 36 meses)
      const evolucao = await getAll<{ mes: string; total: number; valor: number }>(
        `SELECT TO_CHAR(DATE_TRUNC('month', d.data_entrega), 'YYYY-MM') AS mes,
                COUNT(*)::int AS total,
                COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float AS valor
         FROM ecac_perdcomp_documentos d
         ${where ? where + ' AND ' : 'WHERE '} d.data_entrega IS NOT NULL
           AND d.data_entrega >= (CURRENT_DATE - INTERVAL '36 months')
         GROUP BY DATE_TRUNC('month', d.data_entrega)
         ORDER BY mes`,
        params
      );

      // Créditos por tipo (de tributo/crédito)
      const creditosPorTipo = await getAll<{ tipo: string; total: number; valor: number }>(
        `SELECT COALESCE(NULLIF(TRIM(d.tipo_credito), ''), 'Não informado') AS tipo,
                COUNT(*)::int AS total,
                COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float AS valor
         FROM ecac_perdcomp_documentos d
         ${where}
         GROUP BY tipo
         ORDER BY valor DESC
         LIMIT 12`,
        params
      );

      // Distribuição por tipo de documento (PER, DCOMP, etc.)
      const documentosPorTipo = await getAll<{ tipo: string; total: number }>(
        `SELECT COALESCE(NULLIF(TRIM(d.tipo_documento), ''), 'Não informado') AS tipo,
                COUNT(*)::int AS total
         FROM ecac_perdcomp_documentos d
         ${where}
         GROUP BY tipo
         ORDER BY total DESC
         LIMIT 8`,
        params
      );

      // Top empresas — só faz sentido quando o filtro abrange mais de uma empresa
      const topEmpresas = idsList.length === 1 ? [] : await getAll<{ id_empresa: number; razao_social: string; total: number; valor: number }>(
        `SELECT d.id_empresa, e.razao_social,
                COUNT(*)::int AS total,
                COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float AS valor
         FROM ecac_perdcomp_documentos d
         JOIN adm_empresas e ON e.id = d.id_empresa
         ${where}
         GROUP BY d.id_empresa, e.razao_social
         ORDER BY valor DESC
         LIMIT 10`,
        params
      );

      // Tempo médio de análise: dias entre data_entrega e atualizado_em (proxy)
      // para docs com status final (deferido/indeferido).
      const tempoAnalise = await getOne<{ media_dias: number | null; mediana_dias: number | null }>(
        `SELECT
            AVG(EXTRACT(EPOCH FROM (d.atualizado_em - d.data_entrega::timestamp)) / 86400)::float AS media_dias,
            PERCENTILE_CONT(0.5) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (d.atualizado_em - d.data_entrega::timestamp)) / 86400
            )::float AS mediana_dias
         FROM ecac_perdcomp_documentos d
         ${where ? where + ' AND ' : 'WHERE '} d.data_entrega IS NOT NULL
           AND d.atualizado_em IS NOT NULL
           AND d.status_ecac IS NOT NULL
           AND (LOWER(d.status_ecac) LIKE '%deferido%'
                OR LOWER(d.status_ecac) LIKE '%homologado%'
                OR LOWER(d.status_ecac) LIKE '%indeferido%')`,
        params
      );

      // Funil de aproveitamento financeiro
      const funil = {
        solicitado:  Number(kpis?.valor_solicitado) || 0,
        atualizado:  Number(kpis?.credito_atualizado) || 0,
        utilizado:   Number(kpis?.credito_utilizado) || 0,
        disponivel:  Math.max(0, (Number(kpis?.credito_original) || 0) - (Number(kpis?.credito_utilizado) || 0)),
      };

      // ─── Breakdown POR EMPRESA (só quando há 2+ empresas filtradas ou nenhuma) ───
      // Permite ao frontend renderizar gráficos comparativos lado-a-lado.
      const multiEmpresa = idsList.length !== 1;
      let porEmpresa: any = null;
      if (multiEmpresa) {
        // KPIs agregados por empresa
        const kpisPorEmpresa = await getAll<any>(
          `SELECT
              d.id_empresa,
              e.razao_social,
              COUNT(*)::int AS total_documentos,
              COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float AS credito_atualizado,
              COALESCE(SUM(d.valor_pedido), 0)::float                  AS valor_solicitado,
              COALESCE(SUM(d.saldo_credito_original), 0)::float        AS credito_original,
              COALESCE(SUM(d.credito_original_utilizado), 0)::float    AS credito_utilizado,
              COALESCE(SUM(d.total_debitos_dcomp), 0)::float           AS debitos_compensados
           FROM ecac_perdcomp_documentos d
           JOIN adm_empresas e ON e.id = d.id_empresa
           ${where}
           GROUP BY d.id_empresa, e.razao_social
           ORDER BY credito_atualizado DESC
           LIMIT 10`,
          params
        );

        // Evolução temporal por empresa (mesmo período de 36 meses)
        const evolucaoPorEmpresa = await getAll<any>(
          `SELECT d.id_empresa, e.razao_social,
                  TO_CHAR(DATE_TRUNC('month', d.data_entrega), 'YYYY-MM') AS mes,
                  COUNT(*)::int AS total,
                  COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float AS valor
           FROM ecac_perdcomp_documentos d
           JOIN adm_empresas e ON e.id = d.id_empresa
           ${where ? where + ' AND ' : 'WHERE '} d.data_entrega IS NOT NULL
             AND d.data_entrega >= (CURRENT_DATE - INTERVAL '36 months')
           GROUP BY d.id_empresa, e.razao_social, DATE_TRUNC('month', d.data_entrega)
           ORDER BY mes, e.razao_social`,
          params
        );

        // Status por empresa (apenas top empresas por volume, para evitar excesso de séries)
        const statusPorEmpresa = await getAll<any>(
          `SELECT d.id_empresa, e.razao_social,
                  d.status_ecac,
                  COUNT(*)::int AS total
           FROM ecac_perdcomp_documentos d
           JOIN adm_empresas e ON e.id = d.id_empresa
           ${where}
           GROUP BY d.id_empresa, e.razao_social, d.status_ecac`,
          params
        );
        // Reclassifica buckets
        const statusMapPorEmpresa = new Map<number, { id_empresa: number; razao_social: string; buckets: Record<string, number> }>();
        for (const row of statusPorEmpresa) {
          const k = classificaStatus(row.status_ecac);
          let e = statusMapPorEmpresa.get(row.id_empresa);
          if (!e) {
            e = { id_empresa: row.id_empresa, razao_social: row.razao_social, buckets: {} };
            statusMapPorEmpresa.set(row.id_empresa, e);
          }
          e.buckets[k] = (e.buckets[k] || 0) + row.total;
        }
        const statusEmpresas = Array.from(statusMapPorEmpresa.values())
          .sort((a, b) => Object.values(b.buckets).reduce((s, v) => s + v, 0) - Object.values(a.buckets).reduce((s, v) => s + v, 0))
          .slice(0, 10);

        // Créditos por tipo, agrupando por empresa
        const creditosTipoPorEmpresa = await getAll<any>(
          `SELECT d.id_empresa, e.razao_social,
                  COALESCE(NULLIF(TRIM(d.tipo_credito), ''), 'Não informado') AS tipo,
                  COALESCE(SUM(COALESCE(d.credito_atualizado, d.valor_pedido, d.valor_saldo_negativo, 0)), 0)::float AS valor
           FROM ecac_perdcomp_documentos d
           JOIN adm_empresas e ON e.id = d.id_empresa
           ${where}
           GROUP BY d.id_empresa, e.razao_social, tipo
           ORDER BY valor DESC`,
          params
        );

        porEmpresa = {
          kpis: kpisPorEmpresa,
          evolucao: evolucaoPorEmpresa,
          status:   statusEmpresas,
          creditos_por_tipo: creditosTipoPorEmpresa,
        };
      }

      // Compliance: documentos sem recibo / sem PDF (excluindo pré-2018 onde não há)
      const totalElegivel = (kpis?.total_documentos || 0) - (kpis?.docs_legados || 0);
      const compliance = {
        total_elegivel: totalElegivel,
        com_recibo:     kpis?.docs_com_recibo || 0,
        com_pdf:        kpis?.docs_com_pdf    || 0,
        sem_recibo:     Math.max(0, totalElegivel - (kpis?.docs_com_recibo || 0)),
        sem_pdf:        Math.max(0, totalElegivel - (kpis?.docs_com_pdf    || 0)),
      };

      res.json({
        kpis: {
          ...kpis,
          taxa_deferimento: taxaDeferimento,
          tempo_medio_dias:   tempoAnalise?.media_dias    || null,
          tempo_mediana_dias: tempoAnalise?.mediana_dias  || null,
          saldo_disponivel:   funil.disponivel,
        },
        status_distribuicao: statusDistribuicao,
        evolucao,
        creditos_por_tipo: creditosPorTipo,
        documentos_por_tipo: documentosPorTipo,
        top_empresas: topEmpresas,
        funil,
        compliance,
        multi_empresa: multiEmpresa,
        por_empresa: porEmpresa,
      });
    } catch (error: any) {
      log.error(`Erro BI dashboard: ${error.message}`);
      res.status(500).json({ error: `Erro ao gerar BI: ${error.message}` });
    }
  },
};
