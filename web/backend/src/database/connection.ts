import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';
import { log, flushLogsAndExit } from '../utils/logger';

dotenv.config();

const connectionString = process.env.DATABASE_ENV === 'local'
  ? process.env.DATABASE_URL_LOCAL
  : process.env.DATABASE_URL;

if (!connectionString) {
  log.error('Variável de ambiente DATABASE_URL não definida.');
  log.error('Configure DATABASE_URL no arquivo .env com a connection string do Supabase.');
  flushLogsAndExit(1);
}

// Pool de conexões PostgreSQL (Supabase)
// SSL sempre ativado: Supabase exige conexão criptografada
// rejectUnauthorized: false aceita o certificado da infraestrutura do Supabase
let pool: Pool;
if (process.env.DATABASE_ENV === 'local') {
  pool = new Pool({
    connectionString,
    max: 10,                        // máximo de conexões simultâneas no pool
    idleTimeoutMillis: 30_000,      // fecha conexão ociosa após 30s
    connectionTimeoutMillis: 5_000, // erro se não conseguir conexão em 5s
  });
} else {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,                        // máximo de conexões simultâneas no pool
    idleTimeoutMillis: 30_000,      // fecha conexão ociosa após 30s
    connectionTimeoutMillis: 5_000, // erro se não conseguir conexão em 5s
  });
}
export { pool };

pool.on('error', (err: Error) => {
  log.error(`Erro inesperado no pool de conexões PostgreSQL: ${err.message}`);
});

// Teste de conectividade ao iniciar o servidor
pool.query('SELECT 1')
  .then(() => {
    const urlSafe = connectionString!.replace(/:([^:@]+)@/, ':****@');
    log.info(`Conectado ao banco de dados PostgreSQL: ${urlSafe}`);
  })
  .catch((err: Error) => {
    log.error(`Falha ao conectar ao banco de dados: ${err.message}`);
    flushLogsAndExit(1);
  });

// ─── Helpers principais ────────────────────────────────────────────────────────

/**
 * Executa INSERT, UPDATE ou DELETE.
 *
 * Retorna:
 *   - id / lastID : valor de RETURNING id (se a query incluir RETURNING id), senão 0
 *   - changes     : número de linhas afetadas (rowCount)
 *
 * Nas queries INSERT que precisam do ID gerado, inclua RETURNING id no SQL.
 * Exemplo: INSERT INTO tabela (col) VALUES ($1) RETURNING id
 *
 * @param client Opcional — passar quando executando dentro de uma transação
 */
export async function runQuery(
  sql: string,
  params: any[] = [],
  client?: PoolClient
): Promise<{ id: number; lastID: number; changes: number }> {
  const runner = client ?? pool;
  const result = await runner.query(sql, params);
  const id = (result.rows[0]?.id as number) ?? 0;
  return { id, lastID: id, changes: result.rowCount ?? 0 };
}

/**
 * Busca um único registro. Retorna undefined se não encontrar.
 * @param client Opcional — passar quando executando dentro de uma transação
 */
export async function getOne<T>(
  sql: string,
  params: any[] = [],
  client?: PoolClient
): Promise<T | undefined> {
  const runner = client ?? pool;
  const result = await runner.query(sql, params);
  return result.rows[0] as T | undefined;
}

/**
 * Busca múltiplos registros. Retorna array vazio se não encontrar.
 * @param client Opcional — passar quando executando dentro de uma transação
 */
export async function getAll<T>(
  sql: string,
  params: any[] = [],
  client?: PoolClient
): Promise<T[]> {
  const runner = client ?? pool;
  const result = await runner.query(sql, params);
  return result.rows as T[];
}

// ─── Helpers de transação ──────────────────────────────────────────────────────

/**
 * Inicia uma transação e retorna o cliente exclusivo.
 * SEMPRE usar dentro de try/catch e chamar rollbackTransaction no catch.
 *
 * Exemplo de uso:
 *
 *   const client = await beginTransaction();
 *   try {
 *     await runQuery('INSERT ...', [...], client);
 *     await runQuery('UPDATE ...', [...], client);
 *     await commitTransaction(client);
 *   } catch (err) {
 *     await rollbackTransaction(client);
 *     throw err;
 *   }
 */
export async function beginTransaction(): Promise<PoolClient> {
  const client = await pool.connect();
  await client.query('BEGIN');
  return client;
}

/** Confirma a transação e devolve o cliente ao pool. */
export async function commitTransaction(client: PoolClient): Promise<void> {
  await client.query('COMMIT');
  client.release();
}

/** Cancela a transação e devolve o cliente ao pool. */
export async function rollbackTransaction(client: PoolClient): Promise<void> {
  await client.query('ROLLBACK');
  client.release();
}

// ─── Encerramento gracioso ─────────────────────────────────────────────────────

process.on('SIGINT', async () => {
  try {
    await pool.end();
    log.info('Pool de conexões PostgreSQL encerrado.');
    flushLogsAndExit(0);
  } catch (err: any) {
    log.error(`Erro ao encerrar pool: ${err.message}`);
    flushLogsAndExit(1);
  }
});
