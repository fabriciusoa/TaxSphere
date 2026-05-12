import crypto from 'crypto';
import forge from 'node-forge';
import { log } from '../utils/logger';

const ALGORITHM = 'aes-256-cbc';
const SECRET = process.env.CERT_ENCRYPTION_KEY || process.env.JWT_SECRET;
if (!SECRET) {
  log.error('CERT_ENCRYPTION_KEY ou JWT_SECRET deve estar definido para criptografia de certificados');
}

function deriveKey(): Buffer {
  if (!SECRET) throw new Error('CERT_ENCRYPTION_KEY ou JWT_SECRET não configurado');
  return crypto.scryptSync(SECRET, 'taxsphere-salt-cert', 32);
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

export const certificadoService = {
  encrypt(pfxBuffer: Buffer): { encrypted: Buffer; iv: string } {
    const iv = crypto.randomBytes(16);
    const key = deriveKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(pfxBuffer), cipher.final()]);
    return { encrypted, iv: iv.toString('hex') };
  },

  decrypt(encryptedRaw: Buffer | string, ivHex: string): Buffer {
    // pg retorna BYTEA como Buffer; em alguns ambientes pode vir como string '\x...'
    const encrypted = Buffer.isBuffer(encryptedRaw)
      ? encryptedRaw
      : Buffer.from(String(encryptedRaw).replace(/^\\x/, ''), 'hex');
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

  /** Cifra a senha do certificado com AES-256-CBC (recuperável pelo sistema RPA) */
  encryptSenha(senha: string): string {
    const key = deriveKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(senha, 'utf8'), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  },

  /** Decifra a senha do certificado */
  decryptSenha(senhaCifrada: string): string {
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
