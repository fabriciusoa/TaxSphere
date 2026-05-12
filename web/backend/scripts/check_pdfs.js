const { Pool } = require('pg');
require('dotenv').config();
const url = process.env.DATABASE_ENV === 'local' ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_ENV === 'local' ? false : { rejectUnauthorized: false } });

(async () => {
  try {
    const totals = await pool.query("SELECT COUNT(*) AS total, COUNT(recibo_pdf) AS com_pdf FROM ecac_perdcomp_documentos");
    console.log('Totais:', totals.rows[0]);

    const distSize = await pool.query(`
      SELECT octet_length(recibo_pdf) AS bytes, COUNT(*) AS docs
      FROM ecac_perdcomp_documentos
      WHERE recibo_pdf IS NOT NULL
      GROUP BY octet_length(recibo_pdf)
      HAVING COUNT(*) > 1
      ORDER BY docs DESC
      LIMIT 5
    `);
    console.log('\nTamanhos com >1 documento (suspeitos de duplicação):');
    if (distSize.rows.length === 0) console.log('  ✓ Nenhum — TODOS os PDFs têm tamanho único');
    else for (const r of distSize.rows) console.log(`  ${r.bytes} bytes → ${r.docs} doc(s)`);

    const distMd5 = await pool.query(`
      SELECT md5(recibo_pdf) AS hash, COUNT(*) AS docs
      FROM ecac_perdcomp_documentos
      WHERE recibo_pdf IS NOT NULL
      GROUP BY md5(recibo_pdf)
      HAVING COUNT(*) > 1
      LIMIT 5
    `);
    console.log('\nDuplicação por HASH MD5 (definitivo):');
    if (distMd5.rows.length === 0) console.log('  ✓ Nenhuma duplicação — cada doc tem PDF único e correto');
    else for (const r of distMd5.rows) console.log(`  ${r.hash} → ${r.docs} doc(s) ✗`);

    const parseStatus = await pool.query(`
      SELECT recibo_parse_status, COUNT(*) AS docs
      FROM ecac_perdcomp_documentos
      WHERE recibo_pdf IS NOT NULL
      GROUP BY recibo_parse_status
    `);
    console.log('\nStatus de parse:');
    for (const r of parseStatus.rows) console.log(`  ${r.recibo_parse_status || 'NULL'}: ${r.docs}`);

    const tipos = await pool.query(`
      SELECT tipo_documento, COUNT(*) AS docs,
             SUM(CASE WHEN recibo_pdf IS NOT NULL THEN 1 ELSE 0 END) AS com_pdf
      FROM ecac_perdcomp_documentos
      GROUP BY tipo_documento
      ORDER BY docs DESC
    `);
    console.log('\nDocs por tipo:');
    for (const r of tipos.rows) console.log(`  ${r.tipo_documento || 'NULL'}: ${r.com_pdf}/${r.docs}`);
  } catch (e) { console.error('ERRO:', e.message); }
  finally { await pool.end(); }
})();
