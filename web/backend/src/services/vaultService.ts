/**
 * Cliente HashiCorp Vault para envelope encryption dos .pfx e senhas dos certificados.
 *
 * Estratégia: usamos o engine **Transit** do Vault (encryption-as-a-service):
 *   • A chave-mestra fica DENTRO do Vault e nunca sai.
 *   • App envia plaintext via HTTPS → Vault devolve ciphertext (formato `vault:v1:base64...`).
 *   • App armazena o ciphertext no banco normalmente; pra ler, manda de volta pro Vault.
 *   • Cada operação é auditada pelo Vault (audit log).
 *   • Política controla qual cliente pode escrever/ler cada chave.
 *
 * Autenticação: AppRole — combinação `role_id` + `secret_id` que vira um token de TTL curto.
 *
 * Falha-segura: se Vault estiver down e o env `VAULT_FALLBACK_AES=true` estiver setado,
 * caímos pro AES local. Em produção, deixe `false` (preferimos indisponibilidade temporária
 * a comprometimento silencioso da camada de segurança).
 *
 * Variáveis de ambiente:
 *   VAULT_ENABLED          = 'true' para ativar (default false → mantém AES local)
 *   VAULT_ADDR             = ex 'https://vault.local:8200'
 *   VAULT_NAMESPACE        = (opcional) Enterprise/HCP
 *   VAULT_ROLE_ID          = AppRole role_id
 *   VAULT_SECRET_ID        = AppRole secret_id
 *   VAULT_TRANSIT_KEY      = nome da chave Transit (default 'taxsphere-cert')
 *   VAULT_TRANSIT_PATH     = path do engine Transit (default 'transit')
 *   VAULT_TLS_SKIP_VERIFY  = 'true' para dev com self-signed (NUNCA em prod)
 *   VAULT_FALLBACK_AES     = 'true' permite fallback ao AES local em caso de erro
 */
import https from 'node:https';
import { log } from '../utils/logger';

const ADDR = (process.env.VAULT_ADDR || '').replace(/\/$/, '');
const ROLE_ID = process.env.VAULT_ROLE_ID || '';
const SECRET_ID = process.env.VAULT_SECRET_ID || '';
const NAMESPACE = process.env.VAULT_NAMESPACE || '';
const KEY_NAME = process.env.VAULT_TRANSIT_KEY || 'taxsphere-cert';
const TRANSIT_PATH = (process.env.VAULT_TRANSIT_PATH || 'transit').replace(/^\/|\/$/g, '');
const TLS_SKIP = process.env.VAULT_TLS_SKIP_VERIFY === 'true';

export const VAULT_ENABLED = process.env.VAULT_ENABLED === 'true';
export const VAULT_FALLBACK_AES = process.env.VAULT_FALLBACK_AES === 'true';

// Agente HTTPS reutilizável (mantém keep-alive — Vault é hot path para cada decifra de cert).
// `rejectUnauthorized:false` só ativa quando o usuário pede explicitamente (dev).
const agent = new https.Agent({ keepAlive: true, rejectUnauthorized: !TLS_SKIP });

// Cache do token: AppRole devolve um TTL; renovamos quando faltam < 60s.
let cachedToken: string | null = null;
let cachedTokenExpiry = 0;

interface VaultLoginResponse {
  auth: { client_token: string; lease_duration: number; renewable: boolean };
}

async function vaultRequest<T>(path: string, init: { method?: string; body?: any; token?: string }): Promise<T> {
  if (!ADDR) throw new Error('VAULT_ADDR não configurado');
  const url = `${ADDR}${path.startsWith('/') ? path : '/' + path}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (NAMESPACE) headers['x-vault-namespace'] = NAMESPACE;
  if (init.token) headers['x-vault-token'] = init.token;

  const res = await fetch(url, {
    method: init.method || 'POST',
    headers,
    body: init.body ? JSON.stringify(init.body) : undefined,
    // @ts-ignore — undici aceita dispatcher; node-fetch usa agent
    agent: url.startsWith('https://') ? agent : undefined,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Vault ${res.status} ${path}: ${errText.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function login(): Promise<string> {
  if (cachedToken && Date.now() < cachedTokenExpiry - 60_000) return cachedToken;
  if (!ROLE_ID || !SECRET_ID) throw new Error('VAULT_ROLE_ID/VAULT_SECRET_ID não configurados');

  const r = await vaultRequest<VaultLoginResponse>('/v1/auth/approle/login', {
    body: { role_id: ROLE_ID, secret_id: SECRET_ID },
  });
  cachedToken = r.auth.client_token;
  // Renova quando 80% do TTL passar (deixa folga de 1min)
  cachedTokenExpiry = Date.now() + Math.max(60_000, r.auth.lease_duration * 800);
  log.info(`[vault] AppRole logado, token TTL=${r.auth.lease_duration}s, renewable=${r.auth.renewable}`);
  return cachedToken;
}

interface TransitEncryptResponse { data: { ciphertext: string } }
interface TransitDecryptResponse { data: { plaintext: string } }

/**
 * Cifra um Buffer (ex: PFX) ou string via Vault Transit.
 * Devolve string `vault:v1:base64...` — guarde como está no banco.
 */
export async function vaultEncrypt(plaintext: Buffer | string): Promise<string> {
  const token = await login();
  const b64 = Buffer.isBuffer(plaintext) ? plaintext.toString('base64') : Buffer.from(plaintext, 'utf8').toString('base64');
  const r = await vaultRequest<TransitEncryptResponse>(`/v1/${TRANSIT_PATH}/encrypt/${KEY_NAME}`, {
    token,
    body: { plaintext: b64 },
  });
  return r.data.ciphertext; // ex: "vault:v1:AbCdEf..."
}

/**
 * Decifra um ciphertext `vault:v1:...` produzido por vaultEncrypt.
 * Retorna Buffer; o chamador interpreta como bytes ou utf8.
 */
export async function vaultDecrypt(ciphertext: string): Promise<Buffer> {
  const token = await login();
  const r = await vaultRequest<TransitDecryptResponse>(`/v1/${TRANSIT_PATH}/decrypt/${KEY_NAME}`, {
    token,
    body: { ciphertext },
  });
  return Buffer.from(r.data.plaintext, 'base64');
}

/**
 * Health check rápido — útil pro endpoint /api/health para diagnosticar Vault offline.
 */
export async function vaultHealth(): Promise<{ ok: boolean; message: string }> {
  if (!VAULT_ENABLED) return { ok: true, message: 'vault desabilitado (modo AES local)' };
  if (!ADDR) return { ok: false, message: 'VAULT_ADDR ausente' };
  try {
    const r = await fetch(`${ADDR}/v1/sys/health`, {
      // @ts-ignore
      agent,
    });
    if (r.ok) return { ok: true, message: `vault ok (status ${r.status})` };
    if (r.status === 429) return { ok: true, message: 'vault standby (replica HA)' };
    if (r.status === 472 || r.status === 473) return { ok: false, message: 'vault selado — precisa unseal' };
    if (r.status === 503) return { ok: false, message: 'vault em manutenção/sealed' };
    return { ok: false, message: `vault status ${r.status}` };
  } catch (e: any) {
    return { ok: false, message: `vault inalcançável: ${e.message}` };
  }
}

/**
 * Reconhece se uma string já foi cifrada pelo Vault Transit.
 * Útil pra detectar formato no certificadoService e escolher rota de decifra.
 */
export function isVaultCiphertext(s: string): boolean {
  return typeof s === 'string' && /^vault:v\d+:/i.test(s);
}
