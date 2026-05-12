const { Pool } = require('pg');
require('dotenv').config();
const url = process.env.DATABASE_ENV === 'local' ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_ENV === 'local' ? false : { rejectUnauthorized: false } });

(async () => {
  try {
    // Pega um DCOMP que tem recibo baixado
    const dcomp = await pool.query(`
      SELECT id, numero, tipo_documento, recibo_pdf, recibo_parse_status,
             octet_length(recibo_pdf) as bytes
      FROM ecac_perdcomp_documentos
      WHERE tipo_documento ILIKE '%compensa%' AND recibo_pdf IS NOT NULL
      ORDER BY id LIMIT 3
    `);
    console.log('DCOMPs com recibo:', dcomp.rows.length);
    for (const d of dcomp.rows) {
      console.log(`  - ${d.numero} (${d.bytes} bytes, parse=${d.recibo_parse_status})`);
    }

    if (dcomp.rows.length === 0) { await pool.end(); return; }

    // Pega o primeiro DCOMP e salva o PDF para inspeção
    const fs = require('fs');
    const first = dcomp.rows[0];
    fs.writeFileSync('/tmp/dcomp_sample.pdf', first.recibo_pdf);
    console.log(`\nPDF salvo em /tmp/dcomp_sample.pdf (${first.bytes} bytes)`);
    console.log(`Doc: ${first.numero}`);

    // Verifica quantos débitos compensados estão na tabela
    const debs = await pool.query(`SELECT COUNT(*) as total FROM ecac_perdcomp_debitos_compensados`);
    console.log(`\nTotal débitos na tabela: ${debs.rows[0].total}`);

    // Por tipo: quantos DCOMPs têm débitos vs não têm
    const distrib = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM ecac_perdcomp_documentos WHERE tipo_documento ILIKE '%compensa%' AND recibo_pdf IS NOT NULL) as dcomps_com_pdf,
        (SELECT COUNT(DISTINCT id_documento) FROM ecac_perdcomp_debitos_compensados) as dcomps_com_debitos
    `);
    console.log(`\nDCOMPs com PDF: ${distrib.rows[0].dcomps_com_pdf}`);
    console.log(`DCOMPs com débitos importados: ${distrib.rows[0].dcomps_com_debitos}`);
  } catch (e) { console.error('ERRO:', e.message, e.stack); }
  finally { await pool.end(); }
})();
