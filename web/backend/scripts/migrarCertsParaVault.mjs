// Migra certificados existentes (AES local) para HashiCorp Vault Transit.
//
// Para cada row em certificados_digitais:
//   1. Decifra pfx_encrypted + senha_cifrada usando AES local (mesmo algoritmo
//      do certificadoService.ts — derivação via scrypt + JWT_SECRET/CERT_ENCRYPTION_KEY).
//   2. Re-cifra via Vault Transit (POST /v1/<TRANSIT_PATH>/encrypt/<KEY_NAME>).
//   3. UPDATE row com pfx_encrypted=ciphertext, iv='__VAULT__', senha_cifrada=ciphertext.
//
// Comportamento:
//   • Idempotente — pula linhas já migradas (iv='__VAULT__' OU senha começa com vault:).
//   • Dry-run por padrão (mostra o que faria). Use APPLY=true para gravar.
//   • Faz BACKUP do estado anterior em scripts/.cert-backup-<ts>.json antes de UPDATE.
//
// Pré-requisitos no .env do backend:
//   VAULT_ENABLED=true VAULT_ADDR=https://vault.local:8200
//   VAULT_ROLE_ID=... VAULT_SECRET_ID=...
//   VAULT_TRANSIT_KEY=taxsphere-cert
//   (e CERT_ENCRYPTION_KEY/JWT_SECRET para abrir os antigos)
//
// Uso:
//   cd web/backend
//   node scripts/migrarCertsParaVault.mjs            # dry-run (lista)
//   APPLY=true node scripts/migrarCertsParaVault.mjs # aplica
import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';

const APPLY = process.env.APPLY === 'true';
const VAULT_ADDR = (process.env.VAULT_ADDR || '').replace(/\/$/, '');
const ROLE_ID = process.env.VAULT_ROLE_ID || '';
const SECRET_ID = process.env.VAULT_SECRET_ID || '';
const KEY = process.env.VAULT_TRANSIT_KEY || 'taxsphere-cert';
const TRANSIT_PATH = (process.env.VAULT_TRANSIT_PATH || 'transit').replace(/^\/|\/$/g, '');
const SECRET = process.env.CERT_ENCRYPTION_KEY || process.env.JWT_SECRET;
const VAULT_IV_MARKER = '__VAULT__';

if (!SECRET) { console.error('CERT_ENCRYPTION_KEY/JWT_SECRET ausente'); process.exit(1); }
if (!VAULT_ADDR || !ROLE_ID || !SECRET_ID) {
  console.error('Configure VAULT_ADDR, VAULT_ROLE_ID, VAULT_SECRET_ID no .env');
  process.exit(1);
}

const url = process.env.DATABASE_ENV === 'local' ? process.env.DATABASE_URL_LOCAL : process.env.DATABASE_URL;
const client = new pg.Client({ connectionString: url, ssl: process.env.DATABASE_ENV === 'local' ? false : { rejectUnauthorized: false } });
await client.connect();

// ── crypto helpers (espelha certificadoService.ts AES path) ─────────────────────
const deriveKey = () => crypto.scryptSync(SECRET, 'taxsphere-salt-cert', 32);
function aesDecryptPfx(rawBytes, ivHex) {
  const key = deriveKey();
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(rawBytes), decipher.final()]);
}
function aesDecryptSenha(senhaCifrada) {
  const [ivHex, encryptedHex] = senhaCifrada.split(':');
  const key = deriveKey();
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, 'hex')), decipher.final()]).toString('utf8');
}

// ── Vault helpers ───────────────────────────────────────────────────────────────
let vaultToken = null;
async function vaultLogin() {
  if (vaultToken) return vaultToken;
  const r = await fetch(`${VAULT_ADDR}/v1/auth/approle/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ role_id: ROLE_ID, secret_id: SECRET_ID }),
  });
  if (!r.ok) throw new Error(`vault login ${r.status}: ${await r.text()}`);
  const j = await r.json();
  vaultToken = j.auth.client_token;
  return vaultToken;
}
async function vaultEncrypt(plaintext) {
  const token = await vaultLogin();
  const b64 = Buffer.isBuffer(plaintext) ? plaintext.toString('base64') : Buffer.from(plaintext, 'utf8').toString('base64');
  const r = await fetch(`${VAULT_ADDR}/v1/${TRANSIT_PATH}/encrypt/${KEY}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-vault-token': token },
    body: JSON.stringify({ plaintext: b64 }),
  });
  if (!r.ok) throw new Error(`vault encrypt ${r.status}: ${await r.text()}`);
  return (await r.json()).data.ciphertext;
}

// ── Run ─────────────────────────────────────────────────────────────────────────
const rows = await client.query(
  `SELECT id, cn, iv, pfx_encrypted, senha_cifrada FROM certificados_digitais WHERE ativo = 1`
);
console.log(`Encontrados ${rows.rowCount} certificados ativos.`);

const toMigrate = rows.rows.filter(r =>
  r.iv !== VAULT_IV_MARKER &&
  !(r.senha_cifrada && r.senha_cifrada.startsWith('vault:'))
);
const skipped = rows.rowCount - toMigrate.length;
console.log(`A migrar: ${toMigrate.length}  ·  já em Vault: ${skipped}`);
if (!toMigrate.length) { await client.end(); process.exit(0); }

if (APPLY) {
  const backup = toMigrate.map(r => ({
    id: r.id, cn: r.cn, iv: r.iv,
    pfx_b64: r.pfx_encrypted.toString('base64'),
    senha_cifrada: r.senha_cifrada,
  }));
  const file = path.join('scripts', `.cert-backup-${Date.now()}.json`);
  await fs.writeFile(file, JSON.stringify(backup, null, 2));
  console.log(`Backup salvo em ${file}`);
}

let ok = 0, falhou = 0;
for (const r of toMigrate) {
  try {
    const pfx = aesDecryptPfx(r.pfx_encrypted, r.iv);
    const senha = aesDecryptSenha(r.senha_cifrada);
    const pfxCt = await vaultEncrypt(pfx);
    const senhaCt = await vaultEncrypt(senha);
    if (APPLY) {
      await client.query(
        `UPDATE certificados_digitais
            SET pfx_encrypted = $1,
                iv = $2,
                senha_cifrada = $3,
                atualizado_em = NOW()
          WHERE id = $4`,
        [Buffer.from(pfxCt, 'utf8'), VAULT_IV_MARKER, senhaCt, r.id]
      );
      console.log(`  ✓ id=${r.id} ${r.cn} → vault (pfx ${pfx.length}B → ${pfxCt.length}B)`);
    } else {
      console.log(`  · DRY id=${r.id} ${r.cn} (pfx ${pfx.length}B  senha ${senha.length}c)`);
    }
    ok++;
  } catch (e) {
    console.error(`  ✗ id=${r.id} ${r.cn}: ${e.message}`);
    falhou++;
  }
}
console.log(`\n${APPLY ? 'Aplicado' : 'DRY-RUN'}: ${ok} migrados, ${falhou} falharam`);
if (!APPLY) console.log('Para gravar de fato: APPLY=true node scripts/migrarCertsParaVault.mjs');
await client.end();
