import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_ENV === 'local' ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url });
await c.connect();

const total = await c.query(`SELECT COUNT(*)::int AS n FROM public.ecac_perdcomp_documentos`);
const comRecibo = await c.query(`SELECT COUNT(*)::int AS n FROM public.ecac_perdcomp_documentos WHERE recibo_pdf IS NOT NULL`);
const recentes = await c.query(`
  SELECT id, numero, recibo_baixado_em, recibo_parse_status, octet_length(recibo_pdf) AS bytes
  FROM public.ecac_perdcomp_documentos
  WHERE recibo_pdf IS NOT NULL
  ORDER BY recibo_baixado_em DESC NULLS LAST
  LIMIT 10
`);
const syncs = await c.query(`
  SELECT id, id_empresa, tipo, status, iniciado_em, concluido_em,
         (detalhes::jsonb->>'progresso')::int AS pct,
         detalhes::jsonb->>'mensagem' AS msg
  FROM public.ecac_sincronizacoes
  WHERE tipo = 'recibos'
  ORDER BY iniciado_em DESC
  LIMIT 5
`);

console.log(`Total docs e-CAC: ${total.rows[0].n}`);
console.log(`Com recibo PDF persistido: ${comRecibo.rows[0].n}`);
console.log('\nÚltimos recibos baixados:');
recentes.rows.forEach(r => console.log(`  #${r.id} ${r.numero} | ${r.bytes} bytes | ${r.recibo_baixado_em} | parse=${r.recibo_parse_status}`));
console.log('\nÚltimas sincronizações de recibos:');
syncs.rows.forEach(s => console.log(`  sync ${s.id} emp=${s.id_empresa} ${s.status} ${s.pct}% "${s.msg}" iniciado=${s.iniciado_em} concluido=${s.concluido_em}`));

await c.end();
