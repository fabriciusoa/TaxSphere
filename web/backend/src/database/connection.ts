import { Pool, PoolClient, types as pgTypes } from 'pg';
import dotenv from 'dotenv';
import { log, flushLogsAndExit } from '../utils/logger';

// PostgreSQL retorna NUMERIC/DECIMAL/BIGINT como string por padrão (precisão arbitrária).
// Para nossos casos de uso (créditos/débitos com 2 casas decimais), JavaScript Number
// é suficiente e evita bugs no front (NaN em soma, Zod rejeitando "Dados inválidos").
pgTypes.setTypeParser(1700, (v: string) => v === null ? null : parseFloat(v)); // NUMERIC
pgTypes.setTypeParser(20, (v: string) => v === null ? null : parseInt(v, 10));   // BIGINT
pgTypes.setTypeParser(701, (v: string) => v === null ? null : parseFloat(v));    // FLOAT8

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
// IMPORTANTE: o Supabase session pooler (porta 5432) tem CAP de ~15 conexões.
// Pool > 15 gera erro `EMAXCONNSESSION: max clients reached`. Para suporte a
// alta concorrência, mudar DATABASE_URL para porta 6543 (transaction pooler).
// Default 15 = match com o cap do session pooler — requests enfileiram no app.
// Configurável via DB_POOL_MAX (suba para 50-100 se usar :6543).
const POOL_MAX = Number(process.env.DB_POOL_MAX) || 15;
const CONN_TIMEOUT = Number(process.env.DB_CONN_TIMEOUT_MS) || (process.env.DATABASE_ENV === 'local' ? 10_000 : 20_000);
// Statement_timeout aumentado de 15s para 30s — dashboards/BI fazem agregações
// que tocam ecac_perdcomp_documentos+saldos_credito (>150k linhas em alguns clientes)
// e ficavam no limite. 30s ainda é suficientemente curto pra cortar queries patológicas
// sem deixar a request pendurada eternamente.
const STATEMENT_TIMEOUT_MS = Number(process.env.DB_STATEMENT_TIMEOUT_MS) || 30_000;

let pool: Pool;
if (process.env.DATABASE_ENV === 'local') {
  pool = new Pool({
    connectionString,
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: CONN_TIMEOUT,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  } as any);
} else {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: POOL_MAX,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: CONN_TIMEOUT,
    statement_timeout: STATEMENT_TIMEOUT_MS,
  } as any);
}
export { pool };

pool.on('error', (err: Error) => {
  log.error(`Erro inesperado no pool de conexões PostgreSQL: ${err.message}`);
});

// Teste de conectividade ao iniciar o servidor (não interrompe o boot se falhar)
pool.query('SELECT 1')
  .then(() => {
    const urlSafe = connectionString!.replace(/:([^:@]+)@/, ':****@');
    log.info(`Conectado ao banco de dados PostgreSQL: ${urlSafe}`);
  })
  .catch((err: Error) => {
    log.warn(`Aviso: teste de conexão inicial falhou (${err.message}). O servidor continuará iniciando; as queries vão tentar reconectar automaticamente.`);
  });

// ─── Retry para transient errors (deadlock, serialization failure) ────────────
//
// Postgres usa os SQLSTATEs:
//   40P01 = deadlock_detected         (loops de lock entre transações)
//   40001 = serialization_failure     (SERIALIZABLE / repeatable_read)
//   57P03 = cannot_connect_now        (banco bootando)
// Tentamos novamente com backoff exponencial pequeno (50ms, 150ms, 400ms).
// O retry envolve operações idempotentes — SELECT, INSERT…ON CONFLICT, UPDATE.
// Se chamado dentro de transação manual (com `client`), NÃO faz retry para evitar
// duplicar trabalho dentro da BEGIN do caller.
const RETRYABLE_CODES = new Set(['40P01', '40001', '57P03']);
const RETRY_DELAYS_MS = [50, 150, 400];

async function withRetry<T>(client: PoolClient | undefined, label: string, fn: () => Promise<T>): Promise<T> {
  if (client) return fn(); // não interferir em transações explícitas
  let lastErr: any;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      if (!RETRYABLE_CODES.has(err?.code) || attempt === RETRY_DELAYS_MS.length) throw err;
      const delay = RETRY_DELAYS_MS[attempt];
      log.warn(`[db] ${label} ${err.code}: retry em ${delay}ms (tentativa ${attempt + 1}/${RETRY_DELAYS_MS.length})`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

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
  return withRetry(client, 'runQuery', async () => {
    const runner = client ?? pool;
    const result = await runner.query(sql, params);
    const id = (result.rows[0]?.id as number) ?? 0;
    return { id, lastID: id, changes: result.rowCount ?? 0 };
  });
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
  return withRetry(client, 'getOne', async () => {
    const runner = client ?? pool;
    const result = await runner.query(sql, params);
    return result.rows[0] as T | undefined;
  });
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
  return withRetry(client, 'getAll', async () => {
    const runner = client ?? pool;
    const result = await runner.query(sql, params);
    return result.rows as T[];
  });
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
