// Cria 10 usuários admin1..admin10 com senha "adm" para load tests.
// Idempotente — UPSERT por email; atribui perfil_id=1 (Administrador do Sistema) se ainda não tem.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import pg from 'pg';

const PASSWORD = 'adm';
const PERFIL_ID = 1; // ADMIN (confirmado: adm_perfil.id=1 = Administrador do Sistema)

const url = process.env.DATABASE_ENV === 'local'
  ? process.env.DATABASE_URL_LOCAL
  : process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL não definido'); process.exit(1); }

const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_ENV === 'local' ? false : { rejectUnauthorized: false } });
await client.connect();

const hash = await bcrypt.hash(PASSWORD, 10);
const created = [];

const COUNT = Number(process.env.QA_USERS) || 10;
const START = Number(process.env.QA_USER_START) || 1;
for (let i = START; i < START + COUNT; i++) {
  const email = `admin${i}@qa.local`;
  const nome  = `QA Admin ${i}`;

  const r = await client.query(
    `INSERT INTO public.adm_usuarios (email, nome, senha, status, tentativas_login)
     VALUES ($1, $2, $3, true, 0)
     ON CONFLICT (email) DO UPDATE
       SET senha = EXCLUDED.senha, status = true, tentativas_login = 0,
           dt_bloqueio = NULL, dt_inativacao = NULL
     RETURNING id, email`,
    [email, nome, hash]
  );
  const userId = r.rows[0].id;

  await client.query(
    `INSERT INTO public.adm_usuarios_perfil (usuario_id, perfil_id, created_by, updated_by)
     SELECT $1, $2, $1, $1
      WHERE NOT EXISTS (
        SELECT 1 FROM public.adm_usuarios_perfil
         WHERE usuario_id = $1 AND perfil_id = $2 AND dt_inativacao IS NULL
      )`,
    [userId, PERFIL_ID]
  );

  created.push({ id: userId, email });
}

console.log('\n══════════════ QA Admins criados ══════════════');
for (const u of created) console.log(`  id=${u.id.toString().padStart(4)}  ${u.email}`);
console.log(`══════════════════════════════════════════════════`);
console.log(`Senha (todos): ${PASSWORD}`);
console.log(`Perfil       : ${PERFIL_ID} (Administrador do Sistema)`);

await client.end();
