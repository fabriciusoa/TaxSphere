import { getAll, getOne } from '../src/database/connection';

(async () => {
  const id_empresa = 2;
  const empFilter = `AND id_empresa = $1`;
  const empParams = [id_empresa];

  const creds = await getOne<any>(
    `SELECT COUNT(*) as total, COALESCE(SUM(saldo_disponivel), 0) as valor
     FROM saldos_credito WHERE saldo_disponivel > 0 ${empFilter}`, empParams);
  console.log('CRÉDITOS DISPONÍVEIS:', creds);

  const prescricao = await getOne<any>(
    `SELECT
        COUNT(*) FILTER (WHERE data_prescricao < CURRENT_DATE) as prescritos,
        COALESCE(SUM(saldo_disponivel) FILTER (WHERE data_prescricao < CURRENT_DATE), 0) as valor_prescritos,
        COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE AND data_prescricao < CURRENT_DATE + INTERVAL '6 months') as urgente_6m,
        COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE + INTERVAL '6 months' AND data_prescricao < CURRENT_DATE + INTERVAL '12 months') as atencao_1a,
        COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE + INTERVAL '12 months' AND data_prescricao < CURRENT_DATE + INTERVAL '24 months') as aviso_2a,
        COUNT(*) FILTER (WHERE data_prescricao >= CURRENT_DATE + INTERVAL '24 months') as ok
     FROM saldos_credito WHERE saldo_disponivel > 0 ${empFilter}`, empParams);
  console.log('\nPRESCRIÇÃO:', prescricao);

  const creditosPorTipo = await getAll<any>(
    `SELECT tipo_credito as tipo, COUNT(*) as total,
            COALESCE(SUM(saldo_disponivel), 0) as valor
     FROM saldos_credito WHERE saldo_disponivel > 0 ${empFilter}
     GROUP BY tipo_credito ORDER BY valor DESC`, empParams);
  console.log('\nCRÉDITOS POR TIPO:');
  for (const c of creditosPorTipo) console.log(`  ${c.tipo}: ${c.total} créditos, R$ ${c.valor}`);

  const debitos = await getAll<any>(
    `SELECT
        CASE
          WHEN deb.denominacao_receita ILIKE '%COFINS%' THEN 'COFINS'
          WHEN deb.denominacao_receita ILIKE '%PIS%' THEN 'PIS/PASEP'
          WHEN deb.denominacao_receita ILIKE '%IRPJ%' THEN 'IRPJ'
          WHEN deb.denominacao_receita ILIKE '%CSLL%' THEN 'CSLL'
          ELSE COALESCE(deb.denominacao_receita, 'OUTROS')
        END as tributo,
        COUNT(*) as qtd, COALESCE(SUM(deb.total), 0) as valor
     FROM ecac_perdcomp_debitos_compensados deb
     JOIN ecac_perdcomp_documentos d ON d.id = deb.id_documento
     WHERE 1=1 AND d.id_empresa = $1
     GROUP BY tributo ORDER BY valor DESC`, empParams);
  console.log('\nDÉBITOS POR TRIBUTO:');
  for (const d of debitos) console.log(`  ${d.tributo}: ${d.qtd} ocorrências, R$ ${d.valor}`);

  const movs = await getAll<any>(
    `SELECT m.numero_perdcomp, m.tipo, m.valor, m.saldo_apos, m.descricao
     FROM movimentacoes_saldo m
     JOIN saldos_credito sc ON sc.id = m.id_saldo_credito
     WHERE sc.id_empresa = $1
     ORDER BY m.data_movimentacao DESC, m.id DESC LIMIT 5`, empParams);
  console.log('\nÚLTIMAS MOVIMENTAÇÕES:');
  for (const m of movs) console.log(`  ${m.tipo} ${m.numero_perdcomp}: R$ ${m.valor} (saldo após: R$ ${m.saldo_apos})`);

  process.exit(0);
})();
