import { getAll, getOne } from '../src/database/connection';

const STATUS_PERDIDOS_SQL = `('INDEFERIDO', 'NAO_HOMOLOGADO', 'CANCELADO')`;

(async () => {
  const id_empresa = 2;
  const empWhere = `WHERE id_empresa = $1`;
  const params = [id_empresa];

  console.log('--- inicio ---');
  const t0 = Date.now();

  const saldos = await getOne<any>(
    `SELECT COUNT(*)::int as quantidade,
      COALESCE(SUM(credito_atualizado), 0)::float as total_atualizado,
      COALESCE(SUM(total_utilizado), 0)::float as total_utilizado,
      COALESCE(SUM(saldo_disponivel), 0)::float as total_disponivel,
      COUNT(*) FILTER (WHERE saldo_disponivel > 0.01)::int as ativos
     FROM saldos_credito ${empWhere}`, params);
  console.log('1. saldos:', Date.now() - t0, 'ms', saldos);

  const t1 = Date.now();
  const documentosPorStatus = await getAll<any>(
    `SELECT COALESCE(status_normalizado, 'DESCONHECIDO') as status,
      COUNT(*)::int as quantidade,
      COALESCE(SUM(credito_atualizado), 0)::float as valor
     FROM ecac_perdcomp_documentos ${empWhere} GROUP BY status_normalizado ORDER BY quantidade DESC`, params);
  console.log('2. docs:', Date.now() - t1, 'ms', documentosPorStatus.length, 'linhas');

  const t2 = Date.now();
  const prescricao = await getOne<any>(
    `SELECT
      COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 0 AND 30)::int as criticos_30d,
      COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 31 AND 90)::int as urgentes_90d,
      COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 91 AND 365)::int as proximos_365d,
      COUNT(*) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) < 0)::int as prescritos,
      COALESCE(SUM(saldo_disponivel) FILTER (WHERE data_prescricao IS NOT NULL AND (data_prescricao - CURRENT_DATE) BETWEEN 0 AND 90), 0)::float as valor_critico_90d
     FROM saldos_credito WHERE saldo_disponivel > 0.01 AND id_empresa = $1`, params);
  console.log('3. prescricao:', Date.now() - t2, 'ms', prescricao);

  const t3 = Date.now();
  const retrabalho = await getOne<any>(
    `SELECT COUNT(*)::int as total,
      COUNT(*) FILTER (WHERE tipo_documento ILIKE '%retificador%')::int as retificadores
     FROM ecac_perdcomp_documentos ${empWhere}`, params);
  console.log('4. retrabalho:', Date.now() - t3, 'ms', retrabalho);

  const t4 = Date.now();
  const emRisco = await getOne<any>(
    `SELECT COUNT(*)::int as quantidade,
      COALESCE(SUM(credito_original_utilizado), 0)::float as valor
     FROM ecac_perdcomp_documentos
     WHERE status_normalizado IN ${STATUS_PERDIDOS_SQL} AND credito_original_utilizado > 0 AND id_empresa = $1`, params);
  console.log('5. risco:', Date.now() - t4, 'ms', emRisco);

  console.log('TOTAL:', Date.now() - t0, 'ms');
  process.exit(0);
})();
