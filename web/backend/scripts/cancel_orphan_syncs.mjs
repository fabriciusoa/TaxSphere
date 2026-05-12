import 'dotenv/config';
import pg from 'pg';

const url = process.env.DATABASE_ENV === 'local' ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL;
const c = new pg.Client({ connectionString: url });
await c.connect();

const r = await c.query(`
  UPDATE public.ecac_sincronizacoes
  SET status = 'cancelado',
      concluido_em = NOW(),
      erro_mensagem = COALESCE(erro_mensagem, 'Cancelado: backend reiniciado / processo órfão')
  WHERE status = 'em_andamento'
  RETURNING id, id_empresa, tipo, iniciado_em
`);
console.log(`Sincronizações órfãs canceladas: ${r.rowCount}`);
r.rows.forEach(row => console.log(`  #${row.id} emp=${row.id_empresa} ${row.tipo} iniciada em ${row.iniciado_em}`));

await c.end();
