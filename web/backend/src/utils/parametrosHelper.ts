import { getOne, getAll } from '../database/connection';
import { log } from '../utils/logger';

// Interface para o registro de parâmetro
interface ParametroRow {
  id: number;
  chave: string;
  valor: string;
  descricao?: string;
  tipo?: string;
  criado_em?: string;
  atualizado_em?: string;
}

// Cache em memória para parâmetros (opcional, para performance)
const parametrosCache = new Map<string, { valor: string; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutos em milissegundos

/**
 * Busca um parâmetro específico da tabela parametros
 * @param chave - A chave do parâmetro a ser buscado
 * @param useCache - Se deve usar cache (padrão: true)
 * @returns O valor do parâmetro ou null se não encontrado
 */
export async function getParametro(chave: string, useCache: boolean = true): Promise<string | null> {
  try {
    // Verifica cache se habilitado
    if (useCache) {
      const cached = parametrosCache.get(chave);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.valor;
      }
    }

    // Busca no banco de dados
    const row = await getOne<ParametroRow>(
      'SELECT * FROM parametros WHERE chave = $1 LIMIT 1',
      [chave]
    );

    if (!row) {
      return null;
    }

    // Atualiza cache
    if (useCache) {
      parametrosCache.set(chave, {
        valor: row.valor,
        timestamp: Date.now()
      });
    }

    return row.valor;
  } catch (error: any) {
    log.error(`Erro ao buscar parâmetro '${chave}': ${error.message}`);
    throw error;
  }
}

/**
 * Busca múltiplos parâmetros da tabela parametros de uma vez
 * @param chaves - Array com as chaves dos parâmetros a serem buscados
 * @param useCache - Se deve usar cache (padrão: true)
 * @returns Objeto com chave-valor dos parâmetros encontrados
 */
export async function getParametros(chaves: string[], useCache: boolean = true): Promise<Record<string, string>> {
  try {
    const resultado: Record<string, string> = {};
    const chavesParaBuscar: string[] = [];

    // Verifica cache primeiro se habilitado
    if (useCache) {
      for (const chave of chaves) {
        const cached = parametrosCache.get(chave);
        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
          resultado[chave] = cached.valor;
        } else {
          chavesParaBuscar.push(chave);
        }
      }
    } else {
      chavesParaBuscar.push(...chaves);
    }

    // Se encontrou tudo no cache, retorna
    if (chavesParaBuscar.length === 0) {
      return resultado;
    }

    // Busca no banco as chaves que não estavam no cache
    const placeholders = chavesParaBuscar.map((_, i) => `$${i + 1}`).join(',');
    const rows = await getAll<ParametroRow>(
      `SELECT * FROM parametros WHERE chave IN (${placeholders})`,
      chavesParaBuscar
    );

    // Processa resultados
    for (const row of rows) {
      resultado[row.chave] = row.valor;

      // Atualiza cache
      if (useCache) {
        parametrosCache.set(row.chave, {
          valor: row.valor,
          timestamp: Date.now()
        });
      }
    }

    return resultado;
  } catch (error: any) {
    log.error(`Erro ao buscar parâmetros: ${error.message}`);
    throw error;
  }
}

/**
 * Limpa o cache de parâmetros
 * Útil quando parâmetros são atualizados
 */
export function limparCacheParametros(): void {
  parametrosCache.clear();
}

/**
 * Limpa um parâmetro específico do cache
 * @param chave - A chave do parâmetro a ser removida do cache
 */
export function limparParametroCache(chave: string): void {
  parametrosCache.delete(chave);
}

/**
 * Busca parâmetros de configuração SMTP
 * Helper específico para facilitar configuração de email
 */
export async function getSMTPConfig() {
  const config = await getParametros([
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURE',
    'SMTP_USER',
    'SMTP_PASS',
    'EMAIL_FROM'
  ]);

  return {
    host: config.SMTP_HOST,
    port: parseInt(config.SMTP_PORT || '587', 10),
    secure: config.SMTP_SECURE === 'true',
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS
    },
    from: config.EMAIL_FROM
  };
}

/**
 * Busca parâmetros de configuração de Rate Limiting
 * Helper específico para facilitar configuração de limites
 */
export async function getRateLimitConfig() {
  const config = await getParametros([
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'RATE_LIMIT_TOKEN_MAX'
  ]);

  return {
    windowMs: parseInt(config.RATE_LIMIT_WINDOW_MS || '3600000', 10), // 1 hora padrão
    maxRequests: parseInt(config.RATE_LIMIT_MAX_REQUESTS || '10', 10),
    maxTokenRequests: parseInt(config.RATE_LIMIT_TOKEN_MAX || '3', 10)
  };
}

/**
 * Busca a URL base da aplicação
 * Útil para gerar links públicos
 */
export async function getBaseUrl(): Promise<string> {
  const baseUrl = await getParametro('BASE_URL');
  return baseUrl || 'http://localhost:3000/';
}
