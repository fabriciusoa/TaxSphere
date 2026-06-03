// Cria 10 usuários admin1..admin10 com senha "adm" para testes de carga QA.
// Reaproveita perfil admin existente (adm_perfil.adm_system=true) e o cliente_id de
// um admin já cadastrado. Idempotente — se o email já existe, atualiza a senha.
//
// Uso: cd web/backend && npx tsx scripts/seedQAAdmins.ts
import bcrypt from 'bcryptjs';
import { getOne, getAll, runQuery, pool } from '../src/database/connection';
import { log } from '../src/utils/logger';

async function main() {
  const senha = 'adm';
  const hash = await bcrypt.hash(senha, 10);

  // 1. Perfil admin existente
  const perfilAdmin = await getOne<{ id: number; perfil: string }>(
    `SELECT id, perfil FROM adm_perfil WHERE adm_system = true ORDER BY id LIMIT 1`
  );
  if (!perfilAdmin) throw new Error('Nenhum perfil com adm_system=true encontrado em adm_perfil');
  log.info(`[seed-qa] Perfil admin: id=${perfilAdmin.id} (${perfilAdmin.perfil})`);

  // 2. Primeiro cliente_id disponível (qualquer admin pode pertencer a qualquer cliente)
  let clienteRow = await getOne<{ cliente_id: number }>(
    `SELECT cliente_id FROM adm_usuarios WHERE cliente_id IS NOT NULL ORDER BY id LIMIT 1`
  );
  if (!clienteRow) {
    clienteRow = await getOne<{ cliente_id: number }>(
      `SELECT id AS cliente_id FROM adm_clientes ORDER BY id LIMIT 1`
    );
  }
  const clienteId = clienteRow?.cliente_id;
  if (!clienteId) throw new Error('Nenhum cliente_id disponível em adm_usuarios nem adm_clientes');
  log.info(`[seed-qa] Reutilizando cliente_id=${clienteId}`);

  const resultados: Array<{ email: string; id: number; acao: string }> = [];

  for (let i = 1; i <= 10; i++) {
    const email = `admin${i}@qa.local`;
    const nome  = `QA Admin ${i}`;
    const cpf   = `0000000${String(i).padStart(3, '0')}0`.slice(-11); // CPF fake único

    const existe = await getOne<{ id: number }>(
      `SELECT id FROM adm_usuarios WHERE email = $1`,
      [email]
    );

    let id: number;
    let acao: string;

    if (existe) {
      await runQuery(
        `UPDATE adm_usuarios
            SET senha = $1, status = 'Ativo', tentativas_login = 0, dt_bloqueio = NULL
          WHERE id = $2`,
        [hash, existe.id]
      );
      id = existe.id;
      acao = 'senha-reset';
    } else {
      const ins = await runQuery(
        `INSERT INTO adm_usuarios (nome, email, cpf, senha, status, cliente_id)
         VALUES ($1, $2, $3, $4, 'Ativo', $5)
         RETURNING id`,
        [nome, email, cpf, hash, clienteId]
      );
      id = ins.id;
      acao = 'criado';
    }

    // Vincula perfil admin se ainda não estiver
    const vinc = await getOne<{ id: number }>(
      `SELECT id FROM adm_usuarios_perfil WHERE usuario_id = $1 AND perfil_id = $2`,
      [id, perfilAdmin.id]
    );
    if (!vinc) {
      await runQuery(
        `INSERT INTO adm_usuarios_perfil (usuario_id, perfil_id) VALUES ($1, $2)`,
        [id, perfilAdmin.id]
      );
    }

    resultados.push({ email, id, acao });
  }

  log.info('[seed-qa] Resultado:');
  for (const r of resultados) log.info(`  ${r.email} (id=${r.id}) → ${r.acao}`);
  log.info(`[seed-qa] Senha de todos: ${senha}`);

  await pool.end();
}

main().catch((e) => {
  console.error('[seed-qa] Falhou:', e.message);
  process.exit(1);
});
