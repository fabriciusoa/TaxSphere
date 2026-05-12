import 'dotenv/config';
import pg from 'pg';

const url =
  process.env.DATABASE_ENV === 'local'
    ? process.env.DATABASE_URL_LOCAL
    : process.env.DATABASE_URL;

const c = new pg.Client({ connectionString: url });
await c.connect();

await c.query(
  `ALTER TABLE public.adm_perfil
   ADD COLUMN IF NOT EXISTS adm_mindtax boolean NOT NULL DEFAULT false`,
);
console.log('Coluna adm_mindtax garantida.');

const r = await c.query(
  `UPDATE public.adm_perfil SET adm_mindtax = true
   WHERE id = 1 OR perfil ILIKE 'AdministradorSistema'
   RETURNING id, perfil, adm_mindtax`,
);
console.log('Perfis atualizados:', r.rows);

await c.end();
