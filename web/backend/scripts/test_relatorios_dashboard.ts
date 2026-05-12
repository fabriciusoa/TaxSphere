import { getAll, getOne } from '../src/database/connection';

(async () => {
  const t0 = Date.now();
  // Reproduz o que o controller dashboard() faz
  console.log('Chamando getOne para saldos...');
  const saldos = await getOne<any>(
    `SELECT COUNT(*) as quantidade,
            COUNT(*) FILTER (WHERE saldo_disponivel > 0.01) as ativos,
            COALESCE(SUM(credito_atualizado), 0) as total_atualizado,
            COALESCE(SUM(saldo_disponivel), 0) as total_disponivel
     FROM saldos_credito WHERE id_empresa = $1`,
    [2]
  );
  console.log('Saldos OK:', saldos, '— tempo:', Date.now() - t0, 'ms');

  console.log('Chamando getAll para docs por status...');
  const t1 = Date.now();
  const documentosPorStatus = await getAll<any>(
    `SELECT status_normalizado as status, COUNT(*) as total FROM ecac_perdcomp_documentos WHERE id_empresa = $1 GROUP BY status_normalizado`,
    [2]
  );
  console.log('Docs OK — tempo:', Date.now() - t1, 'ms');

  console.log('Chamando getOne para prescricao...');
  const t2 = Date.now();
  const prescricao = await getOne<any>(
    `SELECT
       COUNT(*) FILTER (WHERE (data_prescricao - CURRENT_DATE) <= 30) as criticos_30d,
       COUNT(*) FILTER (WHERE (data_prescricao - CURRENT_DATE) BETWEEN 31 AND 90) as urgentes_90d,
       COALESCE(SUM(saldo_disponivel) FILTER (WHERE (data_prescricao - CURRENT_DATE) <= 90), 0) as valor_critico_90d
     FROM saldos_credito WHERE id_empresa = $1 AND saldo_disponivel > 0.01 AND data_prescricao IS NOT NULL`,
    [2]
  );
  console.log('Presc OK:', prescricao, '— tempo:', Date.now() - t2, 'ms');

  console.log('TOTAL:', Date.now() - t0, 'ms');
  process.exit(0);
})();
