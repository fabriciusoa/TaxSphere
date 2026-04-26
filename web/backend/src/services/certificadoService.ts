import crypto from 'crypto';
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

export const certificadoService = {
  encrypt(pfxBuffer: Buffer): { encrypted: Buffer; iv: string } {
    const iv = crypto.randomBytes(16);
    const key = deriveKey();
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(pfxBuffer), cipher.final()]);
    return { encrypted, iv: iv.toString('hex') };
  },

  decrypt(encrypted: Buffer, ivHex: string): Buffer {
    const key = deriveKey();
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  },

  async parsePfx(pfxBuffer: Buffer, passphrase: string): Promise<CertificadoInfo> {
    const { X509Certificate } = crypto;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p12 = crypto.createPrivateKey({
      key: pfxBuffer,
      format: 'der',
      type: 'pkcs12' as any,
      passphrase,
    });

    if (!p12) throw new Error('Não foi possível ler a chave privada do certificado');

    let cn = '';
    let emissor = '';
    let serialNumber = '';
    let validadeDe = '';
    let validadeAte = '';
    let expirado = false;
    let diasRestantes = 0;

    try {
      const pemCert = this.extractCertPem(pfxBuffer, passphrase);
      if (pemCert) {
        const x509 = new X509Certificate(pemCert);
        cn = this.extractCN(x509.subject) || '';
        emissor = this.extractCN(x509.issuer) || x509.issuer;
        serialNumber = x509.serialNumber;
        validadeDe = x509.validFrom;
        validadeAte = x509.validTo;

        const now = new Date();
        const expDate = new Date(validadeAte);
        expirado = expDate < now;
        diasRestantes = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      }
    } catch (err: any) {
      log.warn(`Não foi possível extrair detalhes X509: ${err.message}`);
    }

    return { cn, emissor, serialNumber, validadeDe, validadeAte, expirado, diasRestantes };
  },

  extractCertPem(pfxBuffer: Buffer, passphrase: string): string | null {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pfxAsn1 = crypto.createPrivateKey({
        key: pfxBuffer,
        format: 'der',
        type: 'pkcs12' as any,
        passphrase,
      });

      const tempKeyPem = pfxAsn1.export({ type: 'pkcs8', format: 'pem' });

      const secureContext = require('tls').createSecureContext({
        pfx: pfxBuffer,
        passphrase,
      });

      const socket = secureContext.context;
      if (socket && socket.getCertificate) {
        return socket.getCertificate();
      }

      const p12Der = pfxBuffer;
      const base64 = p12Der.toString('base64');
      const chunks = base64.match(/.{1,64}/g) || [];
      return null;
    } catch {
      return null;
    }
  },

  extractCN(subject: string): string {
    const match = subject.match(/CN=([^,\n]+)/i);
    return match ? match[1].trim() : '';
  },

  async validatePfx(pfxBuffer: Buffer, passphrase: string): Promise<{ valid: boolean; info?: CertificadoInfo; error?: string }> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      crypto.createPrivateKey({
        key: pfxBuffer,
        format: 'der',
        type: 'pkcs12' as any,
        passphrase,
      });

      let info: CertificadoInfo = {
        cn: '', emissor: '', serialNumber: '',
        validadeDe: '', validadeAte: '',
        expirado: false, diasRestantes: 0,
      };

      try {
        const tls = require('tls');
        const ctx = tls.createSecureContext({ pfx: pfxBuffer, passphrase });
        const cert = ctx.context.getCertificate();
        if (cert) {
          const x509 = new crypto.X509Certificate(cert);
          info.cn = this.extractCN(x509.subject);
          info.emissor = this.extractCN(x509.issuer) || x509.issuer;
          info.serialNumber = x509.serialNumber;
          info.validadeDe = x509.validFrom;
          info.validadeAte = x509.validTo;
          const now = new Date();
          const expDate = new Date(x509.validTo);
          info.expirado = expDate < now;
          info.diasRestantes = Math.ceil((expDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        }
      } catch (e: any) {
        log.warn(`Detalhes X509 indisponíveis: ${e.message}`);
      }

      if (info.expirado) {
        return { valid: false, info, error: 'Certificado digital expirado' };
      }

      return { valid: true, info };
    } catch (err: any) {
      const msg = err.message?.includes('mac verify failure')
        ? 'Senha do certificado incorreta'
        : err.message?.includes('unsupported')
          ? 'Formato de certificado não suportado (utilize .pfx A1)'
          : `Certificado inválido: ${err.message}`;
      return { valid: false, error: msg };
    }
  },
};
