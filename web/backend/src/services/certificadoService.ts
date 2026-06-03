import crypto from 'crypto';
import forge from 'node-forge';
import { log } from '../utils/logger';
import { VAULT_ENABLED, VAULT_FALLBACK_AES, vaultEncrypt, vaultDecrypt, isVaultCiphertext } from './vaultService';

const ALGORITHM = 'aes-256-cbc';
const SECRET = process.env.CERT_ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!SECRET) {
  log.error('CERT_ENCRYPTION_KEY ou JWT_SECRET deve estar definido para criptografia de certificados');
}

let CACHED_KEY: Buffer | null = null;
function deriveKey(): Buffer {
  if (CACHED_KEY) return CACHED_KEY;
  if (!SECRET) throw new Error('CERT_ENCRYPTION_KEY ou JWT_SECRET não configurado');
  // maxmem alto evita "Deriving bits failed" em execuções concorrentes (2+ empresas em paralelo).
  CACHED_KEY = crypto.scryptSync(SECRET, 'taxsphere-salt-cert', 32, { maxmem: 128 * 1024 * 1024 });
  return CACHED_KEY;
}

/**
 * Tenta uma operação Vault. Se Vault estiver desativado, executa o fallback AES.
 * Se Vault falhar e VAULT_FALLBACK_AES estiver ativo, cai pro AES local.
 * Caso contrário, propaga o erro para o chamador (modo "fail closed").
 */
async function withVault<T>(label: string, vaultOp: () => Promise<T>, fallbackAes: () => T): Promise<T> {
  if (!VAULT_ENABLED) return fallbackAes();
  try {
    return await vaultOp();
  } catch (err: any) {
    if (VAULT_FALLBACK_AES) {
      log.warn(`[certificadoService.${label}] Vault falhou, usando AES local: ${err.message}`);
      return fallbackAes();
    }
    log.error(`[certificadoService.${label}] Vault indisponível e fallback desabilitado: ${err.message}`);
    throw err;
  }
}

export interface CertificadoInfo {
  cn: string;
  emissor: string;
  serialNumber: string;
  validadeDe: string;
  validadeAte: string;
  expirado: boolean;
  diasRestantes: number;
}

/**
 * Carrega e valida um arquivo PFX/PKCS12 usando node-forge.
 *
 * node-forge implementa o parser PKCS#12 em JavaScript puro e suporta
 * algoritmos legados (RC2-40, 3DES) que o OpenSSL 3.x / Node.js v24
 * desabilitou por padrão via tls.createSecureContext.
 */
function loadPkcs12(pfxBuffer: Buffer, passphrase: string): forge.pkcs12.Pkcs12Pfx {
  const p12Der = forge.util.createBuffer(pfxBuffer.toString('binary'));
  const p12Asn1 = forge.asn1.fromDer(p12Der);
  // Lança exceção se a senha estiver errada ou o arquivo for inválido
  return forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);
}

function extractCertInfo(p12: forge.pkcs12.Pkcs12Pfx): CertificadoInfo {
  let cert: forge.pki.Certificate | null = null;

  for (const safeContent of p12.safeContents) {
    for (const safeBag of safeContent.safeBags) {
      if (safeBag.type === forge.pki.oids.certBag && safeBag.cert) {
        cert = safeBag.cert;
        break;
      }
    }
    if (cert) break;
  }

  if (!cert) {
    // Retorna info vazia em vez de falhar — o cert ainda será armazenado
    log.warn('[certificadoService] Certificado encontrado no PFX mas sem bag de certificado explícito');
    return { cn: '', emissor: '', serialNumber: '', validadeDe: '', validadeAte: '', expirado: false, diasRestantes: 0 };
  }

  const getCN = (attrs: forge.pki.CertificateField[]) =>
    String(attrs.find(a => a.shortName === 'CN')?.value ?? '');

  const expDate = cert.validity.notAfter;
  const now = new Date();

  return {
    cn: getCN(cert.subject.attributes),
    emissor: getCN(cert.issuer.attributes) ||
      cert.issuer.attributes.map(a => `${a.shortName}=${a.value}`).join(', '),
    serialNumber: cert.serialNumber,
    validadeDe: cert.validity.notBefore.toISOString(),
    validadeAte: expDate.toISOString(),
    expirado: expDate < now,
    diasRestantes: Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
  };
}

function friendlyError(err: any): string {
  const msg = (err?.message ?? '').toLowerCase();
  if (msg.includes('invalid password') || msg.includes('wrong password') ||
      msg.includes('mac verify') || msg.includes('failed to decrypt') ||
      msg.includes('decryption failed') || msg.includes('bad decrypt')) {
    return 'Senha do certificado incorreta';
  }
  if (msg.includes('asn1') || msg.includes('der') || msg.includes('unexpected')) {
    return 'Arquivo inválido — não é um certificado .pfx/.p12 válido';
  }
  return `Certificado inválido: ${err?.message ?? 'erro desconhecido'}`;
}

// Sentinela usado no campo `iv` para indicar que o PFX foi cifrado pelo Vault Transit
// (cujo blob já carrega sua própria info de chave/versão; iv não se aplica).
export const VAULT_IV_MARKER = '__VAULT__';

export const certificadoService = {
  /**
   * Cifra o PFX. Retorno tem 2 formatos possíveis (transparentes pro chamador):
   *   Vault:  { encrypted: Buffer<"vault:v1:...">, iv: VAULT_IV_MARKER }
   *   AES:    { encrypted: Buffer<bytes>, iv: hex }
   *
   * O `decrypt` abaixo detecta o formato automaticamente; o `iv` salvo no banco
   * é a única fonte de verdade sobre qual rota seguir.
   */
  async encrypt(pfxBuffer: Buffer): Promise<{ encrypted: Buffer; iv: string }> {
    return withVault('encrypt',
      async () => {
        const ct = await vaultEncrypt(pfxBuffer);
        return { encrypted: Buffer.from(ct, 'utf8'), iv: VAULT_IV_MARKER };
      },
      () => {
        const iv = crypto.randomBytes(16);
        const key = deriveKey();
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(pfxBuffer), cipher.final()]);
        return { encrypted, iv: iv.toString('hex') };
      }
    );
  },

  /**
   * Decifra o PFX. Detecta automaticamente AES legado vs. Vault:
   *   - iv === VAULT_IV_MARKER OU bytes começando com "vault:" → Vault
   *   - caso contrário, AES-256-CBC com a chave local
   * Permite migrar certificados gradualmente sem quebrar os antigos.
   */
  async decrypt(encryptedRaw: Buffer | string, ivHex: string): Promise<Buffer> {
    const encrypted = Buffer.isBuffer(encryptedRaw)
      ? encryptedRaw
      : Buffer.from(String(encryptedRaw).replace(/^\\x/, ''), 'hex');

    const headStr = encrypted.slice(0, 16).toString('utf8');
    const isVault = ivHex === VAULT_IV_MARKER || isVaultCiphertext(headStr);

    if (isVault) {
      const ciphertext = encrypted.toString('utf8');
      return withVault('decrypt',
        () => vaultDecrypt(ciphertext),
        () => {
          throw new Error('PFX cifrado pelo Vault, mas Vault está desativado e fallback AES não se aplica');
        }
      );
    }

    const key = deriveKey();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  },

  async validatePfx(
    pfxBuffer: Buffer,
    passphrase: string,
  ): Promise<{ valid: boolean; info?: CertificadoInfo; error?: string }> {
    try {
      const p12 = loadPkcs12(pfxBuffer, passphrase);
      const info = extractCertInfo(p12);

      if (info.expirado) {
        return { valid: false, info, error: 'Certificado digital expirado' };
      }

      return { valid: true, info };
    } catch (err: any) {
      log.warn(`[certificadoService.validatePfx] ${err.message}`);
      return { valid: false, error: friendlyError(err) };
    }
  },

  async parsePfx(pfxBuffer: Buffer, passphrase: string): Promise<CertificadoInfo> {
    const result = await this.validatePfx(pfxBuffer, passphrase);
    if (!result.valid) throw new Error(result.error ?? 'Certificado inválido');
    return result.info!;
  },

  /**
   * Cifra a senha do certificado. Formatos possíveis:
   *   Vault: "vault:v1:..." (literal do Vault)
   *   AES:   "<iv_hex>:<cipher_hex>"
   */
  async encryptSenha(senha: string): Promise<string> {
    return withVault('encryptSenha',
      () => vaultEncrypt(senha),
      () => {
        const key = deriveKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(senha, 'utf8'), cipher.final()]);
        return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
      }
    );
  },

  /**
   * Decifra a senha. Detecta Vault pelo prefixo `vault:v\d:` — caso contrário
   * trata como formato AES legado (`iv:cipher`).
   */
  async decryptSenha(senhaCifrada: string): Promise<string> {
    if (isVaultCiphertext(senhaCifrada)) {
      const buf = await withVault('decryptSenha',
        () => vaultDecrypt(senhaCifrada),
        () => { throw new Error('Senha cifrada pelo Vault, mas Vault está desativado'); }
      );
      return buf.toString('utf8');
    }
    const [ivHex, encryptedHex] = senhaCifrada.split(':');
    const key = deriveKey();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  },
};
