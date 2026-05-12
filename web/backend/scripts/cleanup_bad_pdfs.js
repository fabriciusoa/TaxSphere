const { Pool } = require('pg');
require('dotenv').config();
const url = process.env.DATABASE_ENV === 'local' ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL;
const pool = new Pool({ connectionString: url, ssl: process.env.DATABASE_ENV === 'local' ? false : { rejectUnauthorized: false } });

(async () => {
  try {
    const before = await pool.query("SELECT COUNT(*) AS total, COUNT(recibo_pdf) AS com_pdf FROM ecac_perdcomp_documentos");
    console.log('ANTES:', before.rows[0]);

    // Mostra distribuição de tamanhos para evidenciar duplicação
    const dist = await pool.query(`
      SELECT octet_length(recibo_pdf) AS bytes, COUNT(*) AS docs
      FROM ecac_perdcomp_documentos
      WHERE recibo_pdf IS NOT NULL
      GROUP BY octet_length(recibo_pdf)
      ORDER BY docs DESC
      LIMIT 10
    `);
    console.log('\nDistribuição por tamanho (mostrando duplicação):');
    for (const r of dist.rows) console.log(`  ${r.bytes} bytes → ${r.docs} doc(s)`);

    console.log('\n--- DRY RUN ---');
    console.log('Para limpar TODOS os PDFs e refazer, rode com --confirm');

    if (process.argv.includes('--confirm')) {
      const res = await pool.query(`
        UPDATE ecac_perdcomp_documentos
        SET recibo_pdf = NULL,
            recibo_baixado_em = NULL,
            recibo_parse_status = NULL,
            recibo_parse_erro = NULL,
            atualizado_em = NOW()
        WHERE recibo_pdf IS NOT NULL
      `);
      console.log(`\n✓ ${res.rowCount} documento(s) limpo(s) — agora pode rebaixar com o código corrigido.`);
    }
  } catch (e) {
    console.error('ERRO:', e.message);
  } finally {
    await pool.end();
  }
})();
