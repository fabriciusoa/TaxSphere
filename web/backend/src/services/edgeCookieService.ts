import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import { log } from '../utils/logger';

const ECAC_DOMAIN_PATTERNS = [
  'cav.receita.fazenda.gov.br',
  'www3.cav.receita.fazenda.gov.br',
  'sso.acesso.gov.br',
  'acesso.gov.br',
];

function findEdgeUserDataDir(): string {
  const candidates = [
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'Edge', 'User Data'),
    process.env.USERPROFILE && path.join(process.env.USERPROFILE, 'AppData', 'Local', 'Microsoft', 'Edge', 'User Data'),
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'Local State'))) return dir;
  }
  throw new Error('Perfil do Microsoft Edge não encontrado. Certifique-se de que o Edge está instalado e foi aberto ao menos uma vez.');
}

async function decryptEdgeAesKey(edgeBase: string, tempDir: string): Promise<Buffer> {
  const localStatePath = path.join(edgeBase, 'Local State');
  const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf-8'));
  const encKeyB64: string | undefined = localState?.os_crypt?.encrypted_key;
  if (!encKeyB64) throw new Error('Chave de criptografia não encontrada em "Local State" do Edge.');

  // Strip the literal "DPAPI" prefix (5 bytes) that Chrome/Edge prepends
  const encKeyBuf = Buffer.from(encKeyB64, 'base64').slice(5);
  const tempKeyFile = path.join(tempDir, `ek_${Date.now()}.bin`);
  const tempPs1 = path.join(tempDir, `ek_${Date.now()}.ps1`);

  try {
    fs.writeFileSync(tempKeyFile, encKeyBuf);
    const ps1 = [
      `Add-Type -AssemblyName System.Security`,
      `$enc = [System.IO.File]::ReadAllBytes('${tempKeyFile.replace(/\\/g, '\\\\')}')`,
      `$key = [System.Security.Cryptography.ProtectedData]::Unprotect($enc, $null, [System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
      `Write-Output ([Convert]::ToBase64String($key))`,
    ].join('\n');
    fs.writeFileSync(tempPs1, ps1, 'utf-8');
    const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`, { timeout: 12000 }).toString().trim();
    return Buffer.from(out, 'base64');
  } finally {
    try { fs.unlinkSync(tempKeyFile); } catch { /* ignore */ }
    try { fs.unlinkSync(tempPs1); } catch { /* ignore */ }
  }
}

/**
 * Copy a file that is locked by another process (e.g. Edge holding Cookies DB open).
 * Uses PowerShell with FileShare.ReadWrite so we can read it while Edge writes it.
 */
function copyLocked(src: string, dst: string, tempDir: string): void {
  const srcEsc = src.replace(/\\/g, '\\\\').replace(/'/g, "''");
  const dstEsc = dst.replace(/\\/g, '\\\\').replace(/'/g, "''");
  const tempPs1 = path.join(tempDir, `cp_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
  const ps1 = [
    `$fs = [System.IO.File]::Open('${srcEsc}', [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]"ReadWrite,Delete")`,
    `$fw = [System.IO.File]::Create('${dstEsc}')`,
    `$fs.CopyTo($fw)`,
    `$fw.Close(); $fs.Close()`,
  ].join('\n');
  try {
    fs.writeFileSync(tempPs1, ps1, 'utf-8');
    execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1}"`, { timeout: 12000 });
  } finally {
    try { fs.unlinkSync(tempPs1); } catch { /* ignore */ }
  }
}

function decryptCookieValue(enc: Buffer, aesKey: Buffer): string {
  try {
    const version = enc.slice(0, 3).toString('utf-8');
    if (version === 'v10' || version === 'v11') {
      // AES-256-GCM: nonce = bytes[3..14], ciphertext = bytes[15..len-16], authTag = last 16
      const nonce = enc.slice(3, 15);
      const authTag = enc.slice(enc.length - 16);
      const ciphertext = enc.slice(15, enc.length - 16);
      const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, nonce);
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      // Chrome 89+/Edge 89+ on Windows prepends 32 bytes of SHA-256(host_key) to the
      // cookie value before encryption (anti-tampering measure). We must strip those
      // 32 bytes — otherwise the decrypted "value" starts with binary noise and CDP
      // rejects it as "Invalid cookie fields".
      // Detect: if first 32 bytes contain non-ASCII (binary), strip them.
      if (plaintext.length >= 32) {
        const prefix = plaintext.slice(0, 32);
        const looksLikeBinary = prefix.some(b => b < 0x20 || b > 0x7e);
        if (looksLikeBinary) {
          return plaintext.slice(32).toString('utf-8');
        }
      }
      return plaintext.toString('utf-8');
    }
    return '';
  } catch {
    return '';
  }
}

/**
 * Chrome epoch: microseconds since 1601-01-01 → Unix seconds.
 * Returns -1 for session cookies (expires_utc = 0 in Chrome's DB) so that
 * Playwright's addCookies treats them as session-only rather than "expired in 1970".
 */
function chromeTimeToUnix(us: number | bigint | string | null | undefined): number {
  if (us === null || us === undefined || us === '') return -1;
  let big: bigint;
  try {
    big = typeof us === 'bigint' ? us : BigInt(us as any);
  } catch {
    return -1;
  }
  if (big === 0n) return -1; // session cookie sentinel for Playwright
  const unix = (big - 11_644_473_600_000_000n) / 1_000_000n;
  return Number(unix);
}

export interface EdgeCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None';
}

/**
 * Reads Microsoft Edge's cookie database and returns decrypted eCac session cookies.
 *
 * Uses node:sqlite (Node.js 22+ built-in) which opens the file by path and handles
 * WAL mode automatically — unlike sql.js which loads from a buffer and misses WAL pages.
 *
 * @param edgeUserDataDir Optional path to a specific Edge User Data directory.
 *   When omitted, auto-detects the default Edge profile. Pass the temp profile dir
 *   created by instalarCertificado to read cookies from an isolated Edge session.
 */
export async function capturarCookiesEdge(edgeUserDataDir?: string): Promise<EdgeCookie[]> {
  const edgeBase = edgeUserDataDir || findEdgeUserDataDir();
  const cookiesPath = path.join(edgeBase, 'Default', 'Network', 'Cookies');

  if (!fs.existsSync(cookiesPath)) {
    throw new Error('Banco de cookies do Edge não encontrado. Abra o e-CAC no Edge e faça login antes de capturar.');
  }

  const tempDir = path.join(process.cwd(), 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  const tempDb = path.join(tempDir, `ecookies_${Date.now()}.db`);

  try {
    // Copy main DB + WAL with FileShare.ReadWrite (Edge holds these locked).
    // Do NOT copy -shm: the shared-memory file contains process-specific state and
    // corrupts WAL replay when copied. SQLite creates a fresh -shm automatically.
    copyLocked(cookiesPath, tempDb, tempDir);
    const walExists = fs.existsSync(cookiesPath + '-wal');
    if (walExists) copyLocked(cookiesPath + '-wal', tempDb + '-wal', tempDir);
    log.info(`[EdgeCookie] Arquivos copiados — main=${fs.statSync(tempDb).size}b WAL=${walExists}`);

    const aesKey = await decryptEdgeAesKey(edgeBase, tempDir);
    log.info('[EdgeCookie] Chave AES decifrada via DPAPI');

    // node:sqlite opens by file path so WAL replay happens automatically
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(tempDb, { open: true });

    // Log all table names for diagnostics
    const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as any[];
    log.info(`[EdgeCookie] Tabelas no banco: ${tables.map((t: any) => t.name).join(', ') || '(nenhuma)'}`);

    // Diagnostic: total cookies + sample of distinct host_keys present in the DB
    try {
      const totals = db.prepare(`SELECT COUNT(*) AS n FROM cookies`).get() as any;
      log.info(`[EdgeCookie] Total de cookies no banco: ${totals?.n ?? 0}`);
      const hosts = db.prepare(`SELECT DISTINCT host_key FROM cookies ORDER BY host_key`).all() as any[];
      log.info(`[EdgeCookie] host_keys distintos (${hosts.length}): ${hosts.map((h: any) => h.host_key).join(' | ') || '(nenhum)'}`);
    } catch (diagErr: any) {
      log.warn(`[EdgeCookie] Falha em diagnóstico: ${diagErr.message}`);
    }

    const domainWhere = ECAC_DOMAIN_PATTERNS.map(d => `host_key LIKE '%${d}'`).join(' OR ');
    // Cast expires_utc to TEXT: it's a Chrome-epoch microsecond value that can exceed
    // Number.MAX_SAFE_INTEGER (~9e15). node:sqlite throws on such ints unless we either
    // call setReadBigInts(true) or cast to text and parse in JS.
    const rows = db.prepare(`
      SELECT host_key, name, encrypted_value, path,
             CAST(expires_utc AS TEXT) AS expires_utc,
             is_secure, is_httponly, samesite
      FROM cookies
      WHERE ${domainWhere}
    `).all() as any[];
    db.close();

    log.info(`[EdgeCookie] ${rows.length} linha(s) correspondente(s) ao filtro de domínio e-CAC`);

    // Diagnostic: peek at the raw decryption result for the first cookie so we can verify
    // that the 32-byte SHA-256 prefix is being correctly stripped.
    if (rows.length > 0) {
      try {
        const sample = rows[0];
        const enc = sample.encrypted_value instanceof Uint8Array
          ? Buffer.from(sample.encrypted_value)
          : Buffer.from(sample.encrypted_value as string, 'binary');
        const decrypted = decryptCookieValue(enc, aesKey);
        const preview = decrypted.length > 40 ? decrypted.substring(0, 40) + '...' : decrypted;
        log.info(`[EdgeCookie] Amostra valor decifrado (${sample.host_key}:${sample.name}): "${preview}" (len=${decrypted.length})`);
      } catch { /* ignore */ }
    }

    // Chromium's CookieSameSite enum: -1=UNSPECIFIED, 0=NO_RESTRICTION, 1=LAX_MODE, 2=STRICT_MODE
    const sameSiteMap: Record<number, 'Strict' | 'Lax' | 'None'> = { 1: 'Lax', 2: 'Strict' };
    const cookies: EdgeCookie[] = [];

    let skippedV20 = 0;
    let skippedEmpty = 0;
    for (const row of rows) {
      const enc = row.encrypted_value instanceof Uint8Array
        ? Buffer.from(row.encrypted_value)
        : Buffer.from(row.encrypted_value as string, 'binary');

      const version = enc.slice(0, 3).toString('utf-8');
      const value = decryptCookieValue(enc, aesKey);
      if (!value) {
        if (version === 'v20') skippedV20++;
        else skippedEmpty++;
        log.warn(`[EdgeCookie] Cookie ignorado: ${row.host_key}:${row.name} (versão="${version}", len=${enc.length})`);
        continue;
      }

      cookies.push({
        name: String(row.name),
        value,
        domain: String(row.host_key),
        path: String(row.path),
        expires: chromeTimeToUnix(row.expires_utc as string),
        httpOnly: Boolean(row.is_httponly),
        secure: Boolean(row.is_secure),
        sameSite: sameSiteMap[Number(row.samesite)] ?? 'None',
      });
    }

    log.info(`[EdgeCookie] ${cookies.length} cookie(s) decifrados, ignorados: v20=${skippedV20} outros=${skippedEmpty}`);
    return cookies;
  } finally {
    try { fs.unlinkSync(tempDb); } catch { /* ignore */ }
    try { fs.unlinkSync(tempDb + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(tempDb + '-shm'); } catch { /* ignore */ } // created by node:sqlite itself
  }
}
