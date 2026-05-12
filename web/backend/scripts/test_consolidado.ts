import { getAll } from '../src/database/connection';

(async () => {
  const id_empresa = 2;
  const data = await getAll<any>(
    `WITH debitos_por_credito AS (
       SELECT
         COALESCE(d.numero_perdcomp_inicial, d.numero) as chave_credito,
         d.id_empresa,
         SUM(CASE WHEN deb.denominacao_receita ILIKE '%COFINS%' THEN deb.total ELSE 0 END) as deb_cofins,
         SUM(CASE WHEN deb.denominacao_receita ILIKE '%PIS%' OR deb.denominacao_receita ILIKE '%PASEP%' THEN deb.total ELSE 0 END) as deb_pis,
         SUM(deb.total) as deb_total
       FROM ecac_perdcomp_debitos_compensados deb
       JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
       GROUP BY chave_credito, d.id_empresa
     ),
     perdcomps_por_credito AS (
       SELECT COALESCE(numero_perdcomp_inicial, numero) as chave_credito, id_empresa, COUNT(*) as qtd
       FROM ecac_perdcomp_documentos GROUP BY chave_credito, id_empresa
     )
     SELECT
       sc.numero_perdcomp_origem,
       sc.tipo_credito,
       sc.valor_saldo_negativo as inicial,
       sc.total_utilizado,
       sc.saldo_disponivel as saldo,
       sc.credito_atualizado as atualizado,
       sc.data_prescricao,
       (sc.data_prescricao - CURRENT_DATE)::INTEGER as dias,
       CASE
         WHEN sc.data_prescricao < CURRENT_DATE THEN 'PRESCRITO'
         WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '6 months' THEN 'URGENTE_6M'
         WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '12 months' THEN 'ATENCAO_1A'
         WHEN sc.data_prescricao < CURRENT_DATE + INTERVAL '24 months' THEN 'AVISO_2A'
         ELSE 'OK' END as status_atencao,
       COALESCE(dpc.deb_cofins, 0) as cofins,
       COALESCE(dpc.deb_pis, 0) as pis,
       COALESCE(dpc.deb_total, 0) as total_debitos,
       COALESCE(ppc.qtd, 0) as qtd_perdcomps
     FROM saldos_credito sc
     LEFT JOIN debitos_por_credito dpc ON dpc.chave_credito = sc.numero_perdcomp_origem AND dpc.id_empresa = sc.id_empresa
     LEFT JOIN perdcomps_por_credito ppc ON ppc.chave_credito = sc.numero_perdcomp_origem AND ppc.id_empresa = sc.id_empresa
     WHERE sc.id_empresa = $1
     ORDER BY sc.data_prescricao ASC NULLS LAST`,
    [id_empresa]
  );

  const fmt = (n: number) => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  console.log(`\nTabela1 (Controle Consolidado) — ${data.length} crédito(s):\n`);
  console.log('PER/DCOMP Inicial          | Atenção     | Tipo                     | Saldo Atualiz.  | COFINS   | PIS      | Total Déb. | #PerD');
  console.log('---------------------------|-------------|--------------------------|-----------------|----------|----------|------------|------');
  for (const r of data) {
    console.log(
      `${(r.numero_perdcomp_origem || '?').padEnd(26)} | ${(r.status_atencao || '?').padEnd(11)} | ${(r.tipo_credito || '?').slice(0,24).padEnd(24)} | ${fmt(r.atualizado).padStart(15)} | ${fmt(r.cofins).padStart(8)} | ${fmt(r.pis).padStart(8)} | ${fmt(r.total_debitos).padStart(10)} | ${String(r.qtd_perdcomps).padStart(4)}`
    );
  }
  process.exit(0);
})();
