import { chromium, Browser, BrowserContext, Page } from 'playwright';
import crypto from 'crypto';
import forge from 'node-forge';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { log } from '../utils/logger';

const ECAC_LOGIN_URL = 'https://cav.receita.fazenda.gov.br/autenticacao/Login';
const ECAC_CONSULTA_URL = 'https://www3.cav.receita.fazenda.gov.br/consprocperdcomp/consulta/processamento';

// e-CAC time policy:
// - Before 08h: maintenance window (unavailable)
// - 08h–18h: individual operations allowed
// - After 18h: batch operations allowed
const ECAC_BUSINESS_START_HOUR = 8;
const ECAC_RESTRICTED_END_HOUR = 18;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EcacPerdcompDocumento {
  numero: string;
  tipo_documento: string;
  tipo_credito: string;
  periodo_apuracao: string;
  data_entrega: string;
  status_ecac: string;
  orig_retif: string;
}

export interface EcacConsultaResult {
  success: boolean;
  documentos: EcacPerdcompDocumento[];
  total: number;
  paginas: number;
  errors: string[];
  sessaoExpirada?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Número PER/DCOMP (portal pode omitir zeros à esquerda ou colar texto extra na célula)
// ─────────────────────────────────────────────────────────────────────────────

const PERDCOMP_NUMERO_FLEX_RE = /(\d{1,5})\.(\d{1,5})\.(\d{6})\.(\d{1,2})\.(\d{1,2})\.(\d{1,3})-(\d{4})/;

/** Normaliza para o formato canônico 5.5.6.n.n.02-1234 usado no banco após importação. */
export function normalizePerdcompNumero(input: string): string | null {
  const t = (input || '').replace(/\u00a0/g, ' ').trim();
  if (!t) return null;
  const m = t.match(PERDCOMP_NUMERO_FLEX_RE);
  if (!m) return null;
  const a = m[1].padStart(5, '0');
  const b = m[2].padStart(5, '0');
  const f = m[6].padStart(2, '0');
  return `${a}.${b}.${m[3]}.${m[4]}.${m[5]}.${f}-${m[7]}`;
}

function locatorHintsForPerdcomp(canonical: string, rawFromDom?: string): string[] {
  const hints: string[] = [];
  const add = (s?: string) => {
    const x = (s || '').trim();
    if (x && !hints.includes(x)) hints.push(x);
  };
  add(rawFromDom);
  add(canonical);
  const parts = canonical.match(/^(\d{5})\.(\d{5})\.(\d{6})\.(\d{1,2})\.(\d{1,2})\.(\d{2})-(\d{4})$/);
  if (parts) {
    const [, a, b, c, d, e, f, g] = parts;
    add(`${parseInt(a, 10)}.${parseInt(b, 10)}.${c}.${d}.${e}.${f}-${g}`);
  }
  return hints;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cookie encryption helpers
// ─────────────────────────────────────────────────────────────────────────────

function getCookieKey(): Buffer {
  const secret = process.env.CERT_ENCRYPTION_KEY || process.env.JWT_SECRET || 'fallback-key-32c';
  return Buffer.from(secret.padEnd(32, '0').substring(0, 32));
}

export function decryptSessaoCookies(sessaoCookies: string): any[] {
  const [ivHex, authTagHex, encHex] = sessaoCookies.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const enc = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', getCookieKey(), iv);
  decipher.setAuthTag(authTag);
  const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf-8');
  return JSON.parse(json);
}

export function encryptSessaoCookies(cookies: any[]): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getCookieKey(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(cookies), 'utf-8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${enc.toString('hex')}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual authentication
// Opens a visible browser for the user to log in, captures session cookies.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Extrai cert + chave (PEM) de um PKCS#12 ICP-Brasil usando node-forge — que lida
 * com a cifra legada (RC2/3DES) que BoringSSL/OpenSSL rejeitam. A chave sai em
 * formato PKCS#1 ("BEGIN RSA PRIVATE KEY"), que o `security import` do macOS aceita.
 */
function extrairPemDoP12(pfxBuffer: Buffer, passphrase: string): { certPem: string; keyPem: string } {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(pfxBuffer.toString('binary')), passphrase);
  const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
  const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
  return {
    certPem: certBag?.cert ? forge.pki.certificateToPem(certBag.cert) : '',
    keyPem: keyBag?.key ? forge.pki.privateKeyToPem(keyBag.key) : '',
  };
}

/**
 * macOS: importa cert+chave numa Keychain temporária adicionada à search list, para
 * que um navegador real (Chrome/Edge) apresente o certificado via TLS nativo no login
 * gov.br. NÃO usamos `clientCertificates` do Playwright no macOS porque o WAF (F5) do
 * e-CAC derruba a conexão do proxy TLS interno do Playwright (ERR_CONNECTION_CLOSED).
 * Retorna uma função de limpeza que restaura a search list e remove a keychain.
 */
function instalarCertNoKeychainMac(
  certPem: string, keyPem: string, tempDir: string, ts: number, progress: (m: string) => void,
): () => void {
  const cPath = path.join(tempDir, `mac_cert_${ts}.pem`);
  const kPath = path.join(tempDir, `mac_key_${ts}.pem`);
  const kcPath = path.join(tempDir, `ecac_${ts}.keychain`);
  const kcPass = 'taxsphere-ecac';
  fs.writeFileSync(cPath, certPem, { mode: 0o600 });
  fs.writeFileSync(kPath, keyPem, { mode: 0o600 });

  // Search list atual (para restaurar na limpeza).
  const orig = execSync('security list-keychains -d user', { timeout: 8000 })
    .toString().split('\n').map((s) => s.replace(/["\s]/g, '')).filter(Boolean);
  const origArgs = orig.map((o) => `"${o}"`).join(' ');

  execSync(`security create-keychain -p "${kcPass}" "${kcPath}"`, { timeout: 8000 });
  execSync(`security unlock-keychain -p "${kcPass}" "${kcPath}"`, { timeout: 8000 });
  execSync(`security set-keychain-settings "${kcPath}"`, { timeout: 8000 }); // sem auto-lock por timeout
  execSync(`security list-keychains -d user -s "${kcPath}" ${origArgs}`, { timeout: 8000 });
  // -A: ACL aberta (sem prompt "permitir acesso") · -f openssl: PEM. Chave antes do cert.
  execSync(`security import "${kPath}" -k "${kcPath}" -A -f openssl`, { timeout: 10000 });
  execSync(`security import "${cPath}" -k "${kcPath}" -A -f openssl`, { timeout: 10000 });
  progress('Certificado disponibilizado no Keychain do macOS (selecione-o no navegador)');

  return () => {
    try { execSync(`security list-keychains -d user -s ${origArgs}`, { timeout: 8000 }); } catch { /* ignore */ }
    try { execSync(`security delete-keychain "${kcPath}"`, { timeout: 8000 }); } catch { /* ignore */ }
    try { fs.unlinkSync(cPath); } catch { /* ignore */ }
    try { fs.unlinkSync(kPath); } catch { /* ignore */ }
  };
}

export async function autenticarManualmente(
  pfxBuffer: Buffer,
  passphrase: string,
  timeoutMs = 5 * 60 * 1000,
  onProgress?: (msg: string) => void,
  afterAuth?: (context: BrowserContext, page: Page) => Promise<void>,
): Promise<{ sessaoCookies: string; cookiesCount: number; url: string }> {
  const progress = (msg: string) => { log.info(`[Auth] ${msg}`); onProgress?.(msg); };

  const tempDir = path.join(process.cwd(), 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  const ts = Date.now();
  const tempPfxPath = path.join(tempDir, `auth_${ts}.pfx`);
  const tempPs1Path = path.join(tempDir, `install_cert_${ts}.ps1`);
  fs.writeFileSync(tempPfxPath, pfxBuffer, { mode: 0o600 });

  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  // ── Estratégia de certificado de cliente, multi-plataforma ─────────────────
  // Windows : PFX → Windows Cert Store (PowerShell); Chrome/Edge real apresenta.
  // macOS   : PFX → Keychain temporária na search list; Chrome/Edge real apresenta
  //           via TLS nativo. (clientCertificates do Playwright NÃO serve: o WAF
  //           F5 do e-CAC derruba o proxy TLS interno — ERR_CONNECTION_CLOSED.)
  // Linux   : sem store de SO acessível ao browser — clientCertificates (melhor
  //           esforço; pode ser bloqueado pelo mesmo WAF).
  let thumbprint = '';                                  // Windows
  let certPemPath = '';                                  // Linux (clientCertificates)
  let keyPemPath = '';
  let macKeychainCleanup: (() => void) | null = null;    // macOS

  if (isWindows) {
    try {
      const safePass = passphrase.replace(/"/g, '`"');
      const pfxPathFwd = tempPfxPath.replace(/\\/g, '/');
      const ps1 = [
        `$pass = ConvertTo-SecureString -String "${safePass}" -Force -AsPlainText`,
        `$cert = Import-PfxCertificate -FilePath "${pfxPathFwd}" -CertStoreLocation Cert:\\CurrentUser\\My -Password $pass`,
        `Write-Output $cert.Thumbprint`,
      ].join('\r\n');
      fs.writeFileSync(tempPs1Path, ps1, 'utf-8');
      const out = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tempPs1Path}"`, { timeout: 15000 }).toString().trim();
      thumbprint = out.split('\n').pop()?.trim() ?? '';
      progress(`Certificado instalado no Windows Store (${thumbprint.substring(0, 8)}...)`);
    } catch (e: any) {
      log.warn(`[Auth] Falha ao instalar cert no Windows store: ${e.message}`);
    }
  } else if (isMac) {
    try {
      const { certPem, keyPem } = extrairPemDoP12(pfxBuffer, passphrase);
      if (certPem && keyPem) {
        macKeychainCleanup = instalarCertNoKeychainMac(certPem, keyPem, tempDir, ts, progress);
      } else {
        log.warn('[Auth] PEM incompleto extraído do PFX — não foi possível preparar o Keychain');
      }
    } catch (e: any) {
      log.warn(`[Auth] Falha ao preparar Keychain do macOS: ${e.message}`);
    }
  } else {
    // Linux: clientCertificates (Playwright lê os PEM lazily no handshake TLS).
    try {
      const { certPem, keyPem } = extrairPemDoP12(pfxBuffer, passphrase);
      if (certPem && keyPem) {
        certPemPath = path.join(tempDir, `auth_cert_${ts}.pem`);
        keyPemPath = path.join(tempDir, `auth_key_${ts}.pem`);
        fs.writeFileSync(certPemPath, certPem, { mode: 0o600 });
        fs.writeFileSync(keyPemPath, keyPem, { mode: 0o600 });
        progress('Certificado digital carregado (clientCertificates)');
      } else {
        log.warn('[Auth] PEM incompleto extraído do PFX — o login pode não conseguir apresentar o certificado');
      }
    } catch (e: any) {
      log.warn(`[Auth] Falha ao extrair PEM do PFX: ${e.message}`);
    }
  }

  let browser: Browser | undefined;
  let usandoChrome = false;

  // Onde o navegador real lê o certificado: Keychain no macOS, Cert Store no Windows.
  const storeNome = isMac ? 'Keychain do macOS' : isWindows ? 'Windows Certificate Store' : 'store do SO';
  try {
    // Preferimos o Chrome/Edge real porque lê o certificado do store do SO nativamente
    // (sem o proxy TLS do Playwright, que o WAF do e-CAC derruba).
    try {
      browser = await chromium.launch({
        channel: 'chrome',
        headless: false,
        args: ['--no-sandbox', '--ignore-certificate-errors', '--start-maximized', '--disable-blink-features=AutomationControlled'],
      });
      usandoChrome = true;
      progress(`Browser: Google Chrome (usa ${storeNome})`);
    } catch {
      log.warn('[Auth] Google Chrome não encontrado — usando Playwright Chromium');
      browser = await chromium.launch({
        headless: false,
        args: ['--no-sandbox', '--ignore-certificate-errors', '--start-maximized', '--disable-blink-features=AutomationControlled'],
      });
    }

    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: null,
      locale: 'pt-BR',
      timezoneId: 'America/Sao_Paulo',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      // Mac/Linux: o certificado é apresentado pelo próprio Playwright (não há
      // Windows Store). gov.br pede o certificado em certificado.sso.acesso.gov.br;
      // incluímos também os domínios e-CAC para o mTLS subsequente.
      ...(certPemPath && keyPemPath ? {
        clientCertificates: [
          { origin: 'https://certificado.sso.acesso.gov.br', certPath: certPemPath, keyPath: keyPemPath },
          { origin: 'https://sso.acesso.gov.br',             certPath: certPemPath, keyPath: keyPemPath },
          { origin: 'https://cav.receita.fazenda.gov.br',    certPath: certPemPath, keyPath: keyPemPath },
          { origin: 'https://www3.cav.receita.fazenda.gov.br', certPath: certPemPath, keyPath: keyPemPath },
        ],
      } : {}),
    });

    // Polyfill do helper __name injetado pelo esbuild/tsx — necessário para que
    // funções passadas a page.evaluate() não quebrem com "ReferenceError: __name is not defined".
    await context.addInitScript('globalThis.__name = globalThis.__name || function(fn){return fn;};');
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => Array.from({ length: 5 }, () => ({})) });
      Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
      (window as any).chrome = { runtime: {} };
    });

    const page = await context.newPage();
    await page.goto(ECAC_LOGIN_URL, { waitUntil: 'load', timeout: 30000 });
    await page.bringToFront();

    // Instruction banner visible to the user
    await page.evaluate((usingChrome: boolean) => {
      const b = document.createElement('div');
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#1565c0;color:#fff;padding:14px 20px;font:bold 16px/1.4 sans-serif;text-align:center;box-shadow:0 3px 10px rgba(0,0,0,.5)';
      b.innerHTML = usingChrome
        ? 'PERDCOMP — Faça login no e-CAC. Clique em <b>Gov.BR → Certificado Digital</b> e selecione o certificado quando solicitado.'
        : 'PERDCOMP — Faça login no e-CAC com seu certificado digital. Esta janela fecha automaticamente após o login.';
      document.body.style.setProperty('margin-top', '56px', 'important');
      document.body.prepend(b);
    }, usandoChrome).catch(() => {});

    progress('Browser aberto — aguardando login do usuário (5 min)...');

    const deadline = Date.now() + timeoutMs;
    let authenticated = false;
    let finalUrl = '';

    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      const url = page.url();
      const isAtEcac = (url.includes('cav.receita.fazenda.gov.br') || url.includes('www3.cav.receita.fazenda.gov.br'));
      const isAuthPage = url.includes('autenticacao') || url.includes('login') || url.includes('Login') ||
        url.includes('sso.acesso.gov.br') || url.includes('acesso.gov.br') || url.includes('serpro.gov.br');

      if (isAtEcac && !isAuthPage) {
        authenticated = true;
        finalUrl = url;
        break;
      }
    }

    if (!authenticated) throw new Error('Timeout: usuário não completou o login no prazo de 5 minutos.');

    progress(`Login detectado: ${finalUrl}`);

    const cookies = await context.cookies([
      'https://cav.receita.fazenda.gov.br',
      'https://www3.cav.receita.fazenda.gov.br',
      'https://sso.acesso.gov.br',
    ]);
    progress(`${cookies.length} cookie(s) de sessão capturado(s)`);

    // Run any post-auth work in the same browser session (avoids bot detection on new sessions)
    if (afterAuth) {
      try {
        await afterAuth(context, page);
      } catch (e: any) {
        log.warn(`[Auth] afterAuth falhou: ${e.message}`);
      }
    }

    return { sessaoCookies: encryptSessaoCookies(cookies), cookiesCount: cookies.length, url: finalUrl };

  } finally {
    await browser?.close().catch(() => {});

    if (thumbprint) {
      try {
        execSync(
          `powershell -NoProfile -Command "Remove-Item 'Cert:\\CurrentUser\\My\\${thumbprint}' -Force -ErrorAction SilentlyContinue"`,
          { timeout: 5000 }
        );
        log.info('[Auth] Certificado removido do Windows Store');
      } catch (e: any) {
        log.warn(`[Auth] Falha ao remover cert: ${e.message}`);
      }
    }

    macKeychainCleanup?.();

    try { fs.unlinkSync(tempPfxPath); } catch { /* ignore */ }
    try { fs.unlinkSync(tempPs1Path); } catch { /* ignore */ }
    if (certPemPath) { try { fs.unlinkSync(certPemPath); } catch { /* ignore */ } }
    if (keyPemPath) { try { fs.unlinkSync(keyPemPath); } catch { /* ignore */ } }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EcacService — automated PER/DCOMP document consultation via Playwright
// ─────────────────────────────────────────────────────────────────────────────

export class EcacService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private sessaoInjetada = false;
  // Temp PEM files for clientCertificates — Playwright reads these LAZILY during the TLS
  // handshake, so we cannot delete them in initBrowser. Track and clean up on fechar().
  private tempPemFiles: string[] = [];
  private onProgress?: (msg: string, pct: number) => void;
  // Loga o HTML da primeira linha que falhar (uma vez por execução) para
  // diagnosticar seletores quando o e-CAC mudar a estrutura do botão.
  private static _htmlLogged = false;

  constructor(onProgress?: (msg: string, pct: number) => void) {
    this.onProgress = onProgress;
  }

  private progress(msg: string, pct: number) {
    log.info(`[eCAC] ${msg} (${pct}%)`);
    this.onProgress?.(msg, pct);
  }

  /**
   * Reuse an already-authenticated browser context (from the manual login session).
   * Calling this before consultarPerdcompDocumentos/baixarRecibos skips initBrowser,
   * so the same browser session that passed human login is used for automation —
   * bypassing bot detection that triggers on new Playwright-driven sessions.
   */
  usarContextoExistente(context: BrowserContext, page: Page): void {
    this.browser = null; // not owned by us — caller owns the browser lifecycle
    this.context = context;
    this.page = page;
    this.sessaoInjetada = true;
  }

  /**
   * API pública para outros módulos (DCTFweb, eventualmente outros) reutilizarem
   * a infraestrutura mTLS + injeção de cookies + estabelecimento de sessão e-CAC
   * que já temos pronta. Retorna a Page autenticada navegada até o portal e-CAC,
   * pronta para o crawler do módulo invocar `goto(<URL específica>)`.
   *
   * Se a sessão estiver expirada, lança erro com `sessaoExpirada=true` no objeto
   * para o caller orientar o usuário a re-autenticar pelo fluxo de certificados.
   */
  async prepararSessaoAutenticada(pfxBuffer: Buffer, passphrase: string, sessaoCookies: string | null): Promise<Page> {
    if (!this.context) {
      this.progress('Inicializando navegador com certificado digital...', 5);
      await this.initBrowser(pfxBuffer, passphrase, sessaoCookies);
    }
    if (!this.page) throw new Error('Página não inicializada após initBrowser');

    this.progress('Estabelecendo sessão no portal e-CAC...', 20);
    await this.page.goto('https://cav.receita.fazenda.gov.br/ecac/', { waitUntil: 'load', timeout: 60000 });
    await this.page.waitForTimeout(2000);

    const url = this.page.url().toLowerCase();
    if (url.includes('autenticacao') || url.includes('login') || url.includes('sso.acesso.gov.br')) {
      const err: any = new Error('Sessão e-CAC expirada. Re-autentique o certificado na aba Certificados.');
      err.sessaoExpirada = true;
      throw err;
    }
    await this.waitForLoading();
    return this.page;
  }

  /** Wait helper exposto para módulos reutilizarem o spinner aware do e-CAC. */
  async aguardarCarregamento(): Promise<void> {
    return this.waitForLoading();
  }

  /**
   * Abre o e-CAC em modo NÃO-headless para que um humano resolva manualmente
   * eventual hCaptcha / desafio anti-bot e estabeleça a sessão. Após N minutos
   * (ou quando a página estiver autenticada no e-CAC) captura `storageState`
   * — cookies + localStorage — e retorna para persistência em adm_certificados.sessao_cookies.
   *
   * Uso: chamado por um endpoint admin quando o pipeline detecta captchaBloqueio.
   */
  async abrirParaLoginManual(
    pfxBuffer: Buffer,
    passphrase: string,
    opts: { timeoutMin?: number; onProgress?: (msg: string) => void } = {}
  ): Promise<string> {
    const timeoutMin = opts.timeoutMin ?? 5;
    const log2 = (m: string) => { opts.onProgress?.(m); log.info(`[eCAC-manual] ${m}`); };

    // Reinicia browser sempre em modo visível
    await this.encerrar();
    log2(`Abrindo navegador (visível) — você tem ${timeoutMin} min para resolver o captcha`);
    await this.initBrowserVisivel(pfxBuffer, passphrase);
    if (!this.page) throw new Error('Página não inicializada');

    await this.page.goto('https://cav.receita.fazenda.gov.br/ecac/', { waitUntil: 'load', timeout: 60_000 });

    const limite = Date.now() + timeoutMin * 60_000;
    log2('Aguardando autenticação manual…');

    while (Date.now() < limite) {
      await new Promise(r => setTimeout(r, 3_000));
      try {
        const status = await this.page.evaluate(() => {
          const url = location.href.toLowerCase();
          const title = (document.title || '').toLowerCase();
          const isCaptcha = title.includes('hcaptcha') || url.includes('hcaptcha') || url.includes('challenge');
          const isLogin = url.includes('autenticacao') || url.includes('login') || url.includes('sso.acesso.gov.br');
          const isEcac = url.includes('cav.receita.fazenda.gov.br/ecac') && !isCaptcha && !isLogin;
          return { isCaptcha, isLogin, isEcac, url };
        });
        if (status.isEcac) {
          log2('Sessão estabelecida — capturando cookies…');
          const state = await this.context!.storageState();
          await this.encerrar();
          return JSON.stringify(state);
        }
      } catch { /* page pode ter navegado */ }
    }
    await this.encerrar();
    throw new Error(`Tempo esgotado (${timeoutMin} min) — sessão não foi estabelecida`);
  }

  /** Igual ao initBrowser mas headless:false para login manual. */
  private async initBrowserVisivel(pfxBuffer: Buffer, passphrase: string): Promise<void> {
    let certPem = '', keyPem = '';
    if (passphrase) {
      try {
        const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);
        const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
        if (certBag?.cert) certPem = forge.pki.certificateToPem(certBag.cert);
        const keyBag = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
        if (keyBag?.key) keyPem = forge.pki.privateKeyToPem(keyBag.key);
      } catch (e) { log.warn(`[eCAC-manual] PEM extract: ${e}`); }
    }
    const tempDir = path.join(process.cwd(), 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    const ts = Date.now();
    const certPath = path.join(tempDir, `cert_manual_${ts}.pem`);
    const keyPath = path.join(tempDir, `key_manual_${ts}.pem`);
    fs.writeFileSync(certPath, certPem || '', { mode: 0o600 });
    fs.writeFileSync(keyPath, keyPem || '', { mode: 0o600 });
    this.tempPemFiles.push(certPath, keyPath);

    try {
      this.browser = await chromium.launch({ channel: 'msedge', headless: false,
        args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-blink-features=AutomationControlled'] });
    } catch {
      this.browser = await chromium.launch({ headless: false,
        args: ['--no-sandbox', '--ignore-certificate-errors', '--disable-blink-features=AutomationControlled'] });
    }
    this.context = await this.browser.newContext({
      ignoreHTTPSErrors: true,
      clientCertificates: certPem && keyPem
        ? [{ origin: 'https://cav.receita.fazenda.gov.br', certPath, keyPath }]
        : undefined,
    });
    this.page = await this.context.newPage();
  }

  /** Encerra browser de forma segura — chamável pelos consumidores externos. */
  async encerrar(): Promise<void> {
    try { await this.browser?.close(); } catch { /* ignore */ }
    this.browser = null; this.context = null; this.page = null;
    for (const f of this.tempPemFiles) { try { fs.unlinkSync(f); } catch { /* ignore */ } }
    this.tempPemFiles = [];
  }

  private assertTimeWindow(isBatch: boolean) {
    const hora = new Date().getHours();
    if (hora < ECAC_BUSINESS_START_HOUR) {
      throw new Error(`e-CAC indisponível antes das ${ECAC_BUSINESS_START_HOUR}h (janela de manutenção).`);
    }
    if (isBatch && hora < ECAC_RESTRICTED_END_HOUR) {
      throw new Error(
        `Operações em lote no e-CAC só são permitidas após as ${ECAC_RESTRICTED_END_HOUR}h. ` +
        `Horário atual: ${hora}h. Tente novamente após as 18h.`
      );
    }
  }

  private async initBrowser(pfxBuffer: Buffer, passphrase: string, sessaoCookies?: string | null): Promise<void> {
    // Extract PEM from PFX via node-forge.
    // Playwright/BoringSSL rejects ICP-Brasil PKCS#12 with legacy RC2/3DES encryption,
    // but node-forge handles it in pure JavaScript.
    let certPem = '';
    let keyPem = '';

    if (passphrase) {
      try {
        const p12Asn1 = forge.asn1.fromDer(pfxBuffer.toString('binary'));
        const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, passphrase);

        const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
        const certBag = certBags[forge.pki.oids.certBag]?.[0];
        if (certBag?.cert) certPem = forge.pki.certificateToPem(certBag.cert);

        const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
        const keyBag = keyBags[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0];
        if (keyBag?.key) keyPem = forge.pki.privateKeyToPem(keyBag.key);
      } catch (e) {
        log.warn(`[eCAC] Falha ao extrair PEM: ${e} — prosseguindo sem clientCertificates`);
      }
    }

    const tempDir = path.join(process.cwd(), 'temp');
    fs.mkdirSync(tempDir, { recursive: true });
    const ts = Date.now();
    const certPemPath = path.join(tempDir, `cert_${ts}.pem`);
    const keyPemPath = path.join(tempDir, `key_${ts}.pem`);

    try {
      fs.writeFileSync(certPemPath, certPem || '', { mode: 0o600 });
      fs.writeFileSync(keyPemPath, keyPem || '', { mode: 0o600 });
      log.info(`[eCAC] PEM extraído — cert=${certPem.length}b key=${keyPem.length}b — clientCertificates ${certPem && keyPem ? 'CONFIGURADO' : 'NÃO configurado (faltando cert ou key)'}`);

      // Use Microsoft Edge (channel:'msedge') because the captured cookies came
      // from real Edge — using Chrome here causes a UA/fingerprint mismatch that
      // e-CAC's anti-fraud detects, redirecting to login on first navigation.
      // Fall back to Chrome → Chromium if Edge isn't available.
      try {
        this.browser = await chromium.launch({
          channel: 'msedge',
          headless: true,
          args: [
            '--no-sandbox',
            '--ignore-certificate-errors',
            '--disable-blink-features=AutomationControlled',
          ],
        });
      } catch {
        log.warn('[eCAC] Microsoft Edge não encontrado — tentando Chrome');
        try {
          this.browser = await chromium.launch({
            channel: 'chrome',
            headless: true,
            args: [
              '--no-sandbox',
              '--ignore-certificate-errors',
              '--disable-blink-features=AutomationControlled',
            ],
          });
        } catch {
          log.warn('[eCAC] Chrome também não encontrado — usando Playwright Chromium (pode ser detectado como bot)');
          this.browser = await chromium.launch({
            headless: true,
            args: [
              '--no-sandbox',
              '--ignore-certificate-errors',
              '--disable-blink-features=AutomationControlled',
            ],
          });
        }
      }

      this.context = await this.browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: { width: 1920, height: 1080 },
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
        // Match Edge's UA — the captured cookies are bound to an Edge session;
        // a Chrome UA here triggers e-CAC anti-fraud (UA != session origin).
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
        ...(certPem && keyPem ? {
          clientCertificates: [
            { origin: 'https://cav.receita.fazenda.gov.br', certPath: certPemPath, keyPath: keyPemPath },
            { origin: 'https://www3.cav.receita.fazenda.gov.br', certPath: certPemPath, keyPath: keyPemPath },
            { origin: 'https://sso.acesso.gov.br', certPath: certPemPath, keyPath: keyPemPath },
          ],
        } : {}),
      });

      this.context.setDefaultTimeout(60000);

      // Polyfill do helper __name injetado pelo esbuild/tsx (evita
      // "ReferenceError: __name is not defined" em page.evaluate).
      await this.context.addInitScript('globalThis.__name = globalThis.__name || function(fn){return fn;};');

      // Patch automation fingerprints detected by eCac's bot scorer
      await this.context.addInitScript(() => {
        // webdriver flag
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // Realistic plugin list (mimics Chrome with common plugins)
        const mockPlugins: any = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 2 },
        ];
        Object.defineProperty(navigator, 'plugins', { get: () => Object.assign(mockPlugins, { item: (i: number) => mockPlugins[i], namedItem: (n: string) => mockPlugins.find((p: any) => p.name === n) }) });
        Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
        // chrome runtime
        (window as any).chrome = {
          app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
          runtime: { OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {}, PlatformNaclArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {} },
          loadTimes: () => ({}),
          csi: () => ({}),
        };
        // Permissions API — avoid 'denied' for notifications (bot signal)
        const origQuery = window.navigator.permissions?.query?.bind(window.navigator.permissions);
        if (origQuery) {
          (window.navigator.permissions as any).query = (params: any) =>
            params.name === 'notifications'
              ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
              : origQuery(params);
        }
        // Realistic screen props
        Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
        Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
        // Remove Playwright-specific globals that leak automation
        delete (window as any).__playwright;
        delete (window as any).__pw_manual;
        delete (window as any)._playwrightWorkerIndex;
      });

      if (sessaoCookies) {
        try {
          const rawCookies = decryptSessaoCookies(sessaoCookies);
          if (rawCookies.length > 0) {
            // Inject one-by-one with normalization. Chromium silently drops cookies that
            // pass addCookies' surface validation but violate stricter rules (e.g. SameSite=None
            // requires Secure). We diff before/after to detect silent drops.
            const beforeCount = (await this.context.cookies()).length;
            let injected = 0;
            const failures: string[] = [];
            const droppedSilently: string[] = [];
            for (const c of rawCookies) {
              const cookieDomain = String(c.domain || '');
              const hostname = cookieDomain.replace(/^\./, '');
              const originalPath = c.path ? String(c.path) : '/';
              // Chromium rule: SameSite=None cookies MUST be Secure. Force it.
              const sameSite = ['Strict', 'Lax', 'None'].includes(c.sameSite) ? c.sameSite : 'Lax';
              const secure = sameSite === 'None' ? true : Boolean(c.secure);
              // Force path='/' so the cookie is sent on EVERY URL of the host. The original
              // path (e.g. '/autenticacao') would prevent the cookie from being included
              // when navigating to '/ecac/' — server would then redirect to login.
              const path = '/';
              const url = `https://${hostname}${path}`;
              const pwCookie: any = {
                name: String(c.name),
                value: String(c.value ?? ''),
                domain: cookieDomain,
                path,
                httpOnly: Boolean(c.httpOnly),
                secure,
                sameSite,
                expires: typeof c.expires === 'number' && c.expires > 0 ? c.expires : -1,
              };
              if (originalPath !== '/') {
                log.info(`[eCAC] Cookie ${cookieDomain}:${c.name} path original="${originalPath}" forçado para "/"`);
              }
              try {
                const before = await this.context.cookies(url);
                await this.context.addCookies([pwCookie]);
                const after = await this.context.cookies(url);
                if (after.length > before.length || after.some(x => x.name === pwCookie.name && x.value === pwCookie.value)) {
                  injected++;
                } else {
                  // addCookies didn't throw but Chromium silently dropped it — try fallback with url-only
                  try {
                    const fallback = { ...pwCookie };
                    delete fallback.domain;
                    fallback.url = url;
                    await this.context.addCookies([fallback]);
                    const after2 = await this.context.cookies(url);
                    if (after2.some(x => x.name === pwCookie.name)) {
                      injected++;
                      log.info(`[eCAC] Cookie ${cookieDomain}:${c.name} aceito via fallback url-only`);
                    } else {
                      droppedSilently.push(`${cookieDomain}:${c.name} (sameSite=${sameSite},secure=${secure},httpOnly=${pwCookie.httpOnly},len=${pwCookie.value.length})`);
                    }
                  } catch {
                    droppedSilently.push(`${cookieDomain}:${c.name} (sameSite=${sameSite},secure=${secure})`);
                  }
                }
              } catch (err: any) {
                failures.push(`${cookieDomain}:${c.name} → ${err.message}`);
              }
            }
            this.sessaoInjetada = injected > 0;
            const afterCount = (await this.context.cookies()).length;
            log.info(`[eCAC] ${injected}/${rawCookies.length} cookie(s) injetados (contexto: ${beforeCount} → ${afterCount})`);
            if (failures.length > 0) log.warn(`[eCAC] Cookies que lançaram erro: ${failures.join(' | ')}`);
            if (droppedSilently.length > 0) log.warn(`[eCAC] Cookies silenciosamente descartados pelo Chromium: ${droppedSilently.join(' | ')}`);
            // Dump EVERY cookie in context with full attrs so we can see why some don't match URL filters
            const all = await this.context.cookies();
            log.info(`[eCAC] Todos os cookies no contexto (${all.length}):`);
            for (const c of all) {
              log.info(`  → ${c.domain} | name=${c.name} | path=${c.path} | secure=${c.secure} | httpOnly=${c.httpOnly} | sameSite=${c.sameSite} | expires=${c.expires}`);
            }
            const confirmed = await this.context.cookies([
              'https://cav.receita.fazenda.gov.br',
              'https://www3.cav.receita.fazenda.gov.br',
              'https://sso.acesso.gov.br',
            ]);
            log.info(`[eCAC] Cookies que casam com URLs e-CAC: ${confirmed.length} → ${confirmed.map(c => `${c.domain}${c.path}:${c.name}`).join(', ')}`);
          }
        } catch (e: any) {
          log.warn(`[eCAC] Falha geral ao injetar cookies: ${e.message ?? e}`);
        }
      }

      this.page = await this.context.newPage();
      // Track PEM files for cleanup in fechar() — Playwright reads them lazily during
      // TLS handshake, so deleting them now would cause client cert auth to fail and
      // the server would redirect every request to login.
      this.tempPemFiles.push(certPemPath, keyPemPath);

      // Log all main-frame navigations and their responses for e-CAC domains so we can
      // see the actual HTTP redirect chain that produces "session expired".
      this.page.on('response', (response) => {
        const url = response.url();
        if (/cav\.receita|sso\.acesso|gov\.br/.test(url)) {
          const status = response.status();
          const location = response.headers()['location'];
          log.info(`[eCAC/net] ${status} ${url}${location ? ' → ' + location : ''}`);
        }
      });
      this.page.on('requestfailed', (request) => {
        const url = request.url();
        if (/cav\.receita|sso\.acesso|gov\.br/.test(url)) {
          log.warn(`[eCAC/net] FAILED ${request.method()} ${url} — ${request.failure()?.errorText}`);
        }
      });
    } catch (err) {
      // Only delete on init failure — if init succeeded, files must persist.
      try { fs.unlinkSync(certPemPath); } catch { /* ignore */ }
      try { fs.unlinkSync(keyPemPath); } catch { /* ignore */ }
      throw err;
    }
  }

  private async waitForLoading(): Promise<void> {
    if (!this.page) return;
    // Wait for the br-loading component to hide
    try {
      await this.page.waitForSelector('br-loading', { state: 'hidden', timeout: 30000 });
    } catch { /* spinner may not appear for fast operations */ }
    // Also wait for any backdrop div inside it to stop intercepting pointer events
    await this.page.waitForSelector('br-loading .backdrop', { state: 'hidden', timeout: 8000 }).catch(() => {});
    await this.page.waitForTimeout(400); // brief settle time after CSS transition
  }

  /**
   * Parse the ngx-datatable (or regular HTML table) on the current page.
   * Identifies columns dynamically by header text.
   */
  private async parseResultTable(): Promise<EcacPerdcompDocumento[]> {
    if (!this.page) return [];

    const tableData = await this.page.evaluate(() => {
      // Strategy 1: Angular ngx-datatable
      const ngxRows = document.querySelectorAll('datatable-body-row');
      if (ngxRows.length > 0) {
        const headerCells = document.querySelectorAll('datatable-header-cell');
        const headers = Array.from(headerCells).map(h => (h.textContent || '').trim().toLowerCase());

        return Array.from(ngxRows).map(row => {
          const cells = row.querySelectorAll('datatable-body-cell');
          const values = Array.from(cells).map(c => (c.textContent || '').trim());
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = values[i] || ''; });
          return obj;
        });
      }

      // Strategy 2: standard HTML table
      const tables = document.querySelectorAll('table');
      for (const table of Array.from(tables)) {
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (!headerRow) continue;
        const headers = Array.from(headerRow.querySelectorAll('th, td'))
          .map(h => (h.textContent || '').trim().toLowerCase());
        if (!headers.some(h =>
          h.includes('per') || h.includes('dcomp') || h.includes('número') || h.includes('numero')
        )) continue;

        const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
        return Array.from(bodyRows).map(row => {
          const cells = row.querySelectorAll('td');
          const values = Array.from(cells).map(c => (c.textContent || '').trim());
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = values[i] || ''; });
          return obj;
        }).filter(r => Object.values(r).some(v => v));
      }

      return [];
    });

    if (!tableData || tableData.length === 0) {
      log.warn('[eCAC] Nenhum dado encontrado na tabela de resultados');
      return [];
    }

    log.info(`[eCAC] Tabela: ${tableData.length} linha(s). Headers: ${Object.keys(tableData[0]).join(', ')}`);

    return tableData.map(row => {
      const keys = Object.keys(row);
      const find = (patterns: string[]) =>
        row[keys.find(k => patterns.some(p => k.includes(p))) || ''] || '';

      const rawNumero = find(['número', 'numero', 'per/dcomp', 'perdcomp', 'nro']);
      return {
        numero: normalizePerdcompNumero(rawNumero) || rawNumero,
        tipo_documento: find(['documento', 'tipo doc', 'tipo de doc']),
        tipo_credito: find(['crédito', 'credito', 'tipo cred']),
        periodo_apuracao: find(['período', 'periodo', 'apuração', 'apuracao']),
        data_entrega: find(['data', 'entrega', 'transmis', 'envio']),
        status_ecac: find(['situação', 'situacao', 'status', 'estado']),
        orig_retif: find(['orig', 'retif', 'cancelador']),
      };
    }).filter(r => r.numero);
  }

  /**
   * Try to maximize items per page (Angular Material mat-paginator or native select).
   */
  private async tryIncreasePageSize(): Promise<void> {
    if (!this.page) return;
    try {
      const matSelectSelectors = [
        'mat-select.mat-paginator-page-size-select',
        'mat-select.mat-mdc-paginator-page-size-select',
        '.mat-paginator-page-size mat-select',
        '.mat-mdc-paginator-page-size mat-select',
        '[class*="page-size"] mat-select',
        'mat-select',
      ];

      for (const sel of matSelectSelectors) {
        const loc = this.page.locator(sel).first();
        if (await loc.count() === 0) continue;

        await loc.click({ timeout: 5000 });
        await this.page.waitForTimeout(800);

        const optionSel = 'mat-option, .mat-option, .mat-mdc-option';
        await this.page.waitForSelector(optionSel, { timeout: 3000 }).catch(() => null);
        const options = this.page.locator(optionSel);
        if (await options.count() === 0) { await this.page.keyboard.press('Escape'); continue; }

        const textos = await options.allInnerTexts();
        const nums = textos.map(t => parseInt(t.trim())).filter(n => !isNaN(n) && n > 0).sort((a, b) => b - a);
        if (nums.length > 0 && nums[0] > 10) {
          await options.filter({ hasText: String(nums[0]) }).first().click({ timeout: 5000 });
          await this.page.waitForTimeout(2000);
          await this.waitForLoading();
          log.info(`[eCAC] Itens/pág aumentado para ${nums[0]}`);
          return;
        }
        await this.page.keyboard.press('Escape');
        break;
      }

      // Fallback: native HTML select
      const selects = this.page.locator('select');
      const selectCount = await selects.count();
      for (let i = 0; i < selectCount; i++) {
        const sel = selects.nth(i);
        const opts = await sel.locator('option').allInnerTexts().catch(() => [] as string[]);
        const nums = opts.map(t => parseInt(t.trim())).filter(n => !isNaN(n) && n > 10);
        if (nums.length > 0) {
          await sel.selectOption(String(Math.max(...nums)));
          await this.page.waitForTimeout(2000);
          await this.waitForLoading();
          log.info(`[eCAC] Itens/pág aumentado para ${Math.max(...nums)} (select nativo)`);
          return;
        }
      }
    } catch (e: any) {
      log.warn(`[eCAC] tryIncreasePageSize: ${e.message}`);
    }
  }

  /**
   * Navigate to next results page.
   * Returns false when on the last page.
   */
  private async goNextPage(currentPage: number): Promise<boolean> {
    if (!this.page) return false;

    // Strategy 1: Angular Material mat-paginator navigation-next button
    const matNextSelectors = [
      'button.mat-mdc-paginator-navigation-next',
      'button.mat-paginator-navigation-next',
      '[class*="paginator-navigation-next"]',
      'button[aria-label="Next page"]',
      'button[aria-label="Próxima página"]',
      'button[aria-label="Próxima"]',
    ];

    for (const sel of matNextSelectors) {
      try {
        const loc = this.page.locator(sel).first();
        if (await loc.count() === 0) continue;

        const isDisabled = await loc.evaluate((el: Element) =>
          el.hasAttribute('disabled') ||
          (el as HTMLButtonElement).disabled ||
          el.getAttribute('aria-disabled') === 'true' ||
          el.classList.contains('mat-button-disabled')
        ).catch(() => true);

        if (isDisabled) {
          log.info(`[eCAC] Botão próxima desabilitado (${sel}) — última página`);
          return false;
        }

        await loc.click({ timeout: 8000 });
        log.info(`[eCAC] Clicou próxima via "${sel}"`);
        return true;
      } catch { /* try next selector */ }
    }

    // Strategy 2: Click the next page number directly
    const nextNum = currentPage + 1;
    const clicked = await this.page.evaluate((n: number) => {
      const btns = Array.from(document.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not(.mat-button-disabled), a:not(.disabled)'
      ));
      const btn = btns.find(b => {
        const txt = (b.textContent || '').trim();
        if (txt !== String(n)) return false;
        if (b.getAttribute('aria-current') === 'page') return false;
        if (b.classList.contains('active') || b.classList.contains('selected')) return false;
        return true;
      });
      if (btn) { btn.click(); return true; }
      return false;
    }, nextNum);

    if (clicked) {
      log.info(`[eCAC] Clicou no número de página ${nextNum}`);
      return true;
    }

    // Strategy 3: Read pager label "N – M de Total"
    const info = await this.page.evaluate(() => {
      const match = document.body.innerText.match(/(\d[\d.,]*)\s*[-–]\s*(\d[\d.,]*)\s+de\s+(\d[\d.,]*)/i);
      if (!match) return null;
      return {
        fim: parseInt(match[2].replace(/\D/g, '')),
        total: parseInt(match[3].replace(/\D/g, '')),
      };
    });

    if (info && info.fim >= info.total) {
      log.info(`[eCAC] Última página confirmada pelo pager: ${info.fim}/${info.total}`);
      return false;
    }

    // Strategy 4: Last enabled button inside any pagination container
    const clickedLast = await this.page.evaluate(() => {
      const containers = Array.from(document.querySelectorAll<HTMLElement>(
        'mat-paginator, .mat-paginator, .mat-mdc-paginator, [class*="paginator"], [class*="pagination"]'
      ));
      for (const container of containers) {
        const btns = Array.from(container.querySelectorAll<HTMLButtonElement>('button'));
        const enabled = btns.filter(b => !b.disabled && !b.classList.contains('mat-button-disabled'));
        if (enabled.length >= 2) {
          enabled[enabled.length - 1].click();
          return true;
        }
      }
      return false;
    });

    if (clickedLast) {
      log.info('[eCAC] Clicou no último botão habilitado da paginação');
      return true;
    }

    log.warn('[eCAC] Não foi possível avançar para próxima página');
    return false;
  }

  /**
   * Click the "Consultar" button on the consultation page.
   */
  private async clickConsultar(): Promise<void> {
    if (!this.page) return;
    try {
      // Ensure backdrop is gone before attempting click
      await this.page.waitForSelector('br-loading .backdrop', { state: 'hidden', timeout: 15000 }).catch(() => {});
      await this.page.waitForTimeout(500);

      // Try known selector first
      const btn = this.page.locator('button:has-text("Consultar")').first();
      if (await btn.count() > 0) {
        // Standard click with generous timeout; fall back to force click if still intercepted
        try {
          await btn.click({ timeout: 15000 });
          log.info('[eCAC] Botão Consultar clicado com sucesso');
          return;
        } catch {
          log.warn('[eCAC] Click padrão interceptado — tentando click forçado via JavaScript');
          await btn.evaluate((el: HTMLElement) => el.click());
          return;
        }
      }

      // Fallback: scan all buttons for consultation keywords via JS
      await this.page.evaluate(() => {
        const els = Array.from(document.querySelectorAll<HTMLElement>('button, [role="button"], input[type="submit"]'));
        const el = els.find(e => {
          const t = (e.textContent || '').toLowerCase().trim();
          return t === 'consultar' || t === 'pesquisar' || t === 'buscar';
        });
        if (el) el.click();
        else throw new Error('Botão Consultar não encontrado na página');
      });
    } catch (e: any) {
      log.warn(`[eCAC] clickConsultar: ${e.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Consult all PER/DCOMP documents at e-CAC for the authenticated company.
   *
   * @param pfxBuffer  - raw (decrypted) PFX bytes
   * @param passphrase - certificate password
   * @param sessaoCookies - encrypted session cookies stored in certificados_digitais.sessao_cookies
   * @param isBatch    - enforces after-18h time window when true
   */
  async consultarPerdcompDocumentos(
    pfxBuffer: Buffer,
    passphrase: string,
    sessaoCookies: string | null,
    isBatch = true,
  ): Promise<EcacConsultaResult> {
    const result: EcacConsultaResult = { success: false, documentos: [], total: 0, paginas: 0, errors: [] };

    try {
      this.assertTimeWindow(isBatch);
    } catch (e: any) {
      result.errors.push(e.message);
      return result;
    }

    try {
      if (!this.context) {
        this.progress('Inicializando navegador com certificado digital...', 5);
        await this.initBrowser(pfxBuffer, passphrase, sessaoCookies);
      } else {
        this.progress('Reutilizando sessão autenticada...', 5);
      }

      if (!this.page) throw new Error('Página não inicializada');

      // If no session cookies, attempt automated login flow
      if (!this.sessaoInjetada) {
        this.progress('Iniciando fluxo de autenticação no e-CAC...', 10);
        await this.page.goto(ECAC_LOGIN_URL, { waitUntil: 'load', timeout: 60000 });

        const alreadyIn = this.page.url().includes('ecac/Default')
          || this.page.url().includes('ecac/Aplicacao')
          || (await this.page.locator('text=Sair').count()) > 0;

        if (!alreadyIn) {
          // Click Gov.BR button
          await this.page.evaluate(() => {
            const els = Array.from(document.querySelectorAll<HTMLElement>(
              'a, button, input[type="button"], input[type="submit"], input[type="image"], [role="button"]'
            ));
            const el = els.find(e => {
              const text = (e.textContent || '').toLowerCase();
              const alt = ((e as HTMLImageElement).alt || '').toLowerCase();
              const src = ((e as HTMLImageElement).src || '').toLowerCase();
              return text.includes('gov.br') || text.includes('govbr') || alt.includes('gov') || src.includes('govbr');
            });
            if (el) el.click();
          });

          await this.page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }).catch(() => null);
          await this.page.waitForTimeout(3000);

          // If redirected to SSO, click "Certificado Digital"
          if (this.page.url().includes('sso.acesso.gov.br') || this.page.url().includes('acesso.gov.br')) {
            await this.page.evaluate(() => {
              const els = Array.from(document.querySelectorAll<HTMLElement>('a, button, [role="button"]'));
              const el = els.find(e => {
                const t = (e.textContent || '').toLowerCase();
                return t.includes('certificado digital') || t.includes('certificate');
              });
              if (el) el.click();
            });
            await this.page.waitForNavigation({ waitUntil: 'load', timeout: 45000 }).catch(() => null);
            await this.page.waitForTimeout(5000);
          }
        }
      }

      // Step 1: Land on the main e-CAC portal so the session is established for ALL subdomains.
      // Navigating directly to www3.cav.receita.fazenda.gov.br without coming through the portal
      // leaves Angular waiting for an auth handshake, causing an infinite loading overlay.
      this.progress('Estabelecendo sessão no portal e-CAC...', 20);
      await this.page.goto('https://cav.receita.fazenda.gov.br/ecac/', { waitUntil: 'load', timeout: 60000 });
      await this.page.waitForTimeout(3000);

      // Verify we're authenticated (not redirected to login)
      const portalUrl = this.page.url().toLowerCase();
      log.info(`[eCAC/consulta] URL após navegação portal: ${portalUrl}`);
      if (portalUrl.includes('autenticacao') || portalUrl.includes('login') || portalUrl.includes('sso.acesso.gov.br')) {
        result.sessaoExpirada = true;
        throw new Error('Sessão e-CAC expirada. Acesse a aba Certificados e clique em "Autenticar no e-CAC" para renovar a sessão.');
      }
      await this.waitForLoading();

      // Step 2: Navigate to the PER/DCOMP consultation page now that the session is active.
      this.progress('Navegando para consulta de processamento PER/DCOMP...', 30);
      await this.page.goto(ECAC_CONSULTA_URL, { waitUntil: 'load', timeout: 90000 });
      await this.page.waitForTimeout(4000); // Allow Angular SPA to bootstrap

      // Detect session expiry: check URL (case-insensitive) and whether we landed on the right domain
      const detectSessionExpiry = async (context: string) => {
        if (!this.page) return false;
        const url = this.page.url().toLowerCase();
        const onWrongDomain = !url.includes('consprocperdcomp') && !url.includes('www3.cav.receita.fazenda.gov.br');
        const isLoginPage = url.includes('autenticacao') || url.includes('login') || url.includes('sso.acesso.gov.br') || url.includes('acesso.gov.br');
        if (onWrongDomain || isLoginPage) {
          log.warn(`[eCAC] Sessão expirada detectada em ${context}: URL=${this.page.url()}`);
          return true;
        }
        // Also check page body for session expiry indicators
        const hasLoginIndicator = await this.page.evaluate(() => {
          const text = (document.body?.textContent || '').toLowerCase();
          return text.includes('sessão expirada') || text.includes('sessao expirada') ||
                 text.includes('efetue o login') || text.includes('fazer login') ||
                 text.includes('acesso não autorizado') || text.includes('acesso nao autorizado') ||
                 (text.includes('entrar') && text.includes('cpf'));
        }).catch(() => false);
        if (hasLoginIndicator) {
          log.warn(`[eCAC] Sessão expirada detectada por conteúdo de página em ${context}`);
          return true;
        }
        return false;
      };

      if (await detectSessionExpiry('após navegação inicial')) {
        result.sessaoExpirada = true;
        throw new Error('Sessão e-CAC expirada. Acesse a aba Certificados e clique em "Autenticar no e-CAC" para renovar a sessão.');
      }

      await this.waitForLoading();
      this.progress('Página de consulta carregada. Iniciando busca...', 40);

      // Click "Consultar" to load all documents
      await this.clickConsultar();
      await this.page.waitForTimeout(3000); // wait for Angular to start the request
      await this.waitForLoading();

      // Check session expiry again after clicking Consultar (some SPAs redirect lazily)
      if (await detectSessionExpiry('após Consultar')) {
        result.sessaoExpirada = true;
        throw new Error('Sessão e-CAC expirada ao executar consulta. Acesse a aba Certificados e clique em "Autenticar no e-CAC" para renovar a sessão.');
      }

      // Try to increase items per page to reduce the number of pages
      await this.tryIncreasePageSize();

      // Collect all pages
      const allDocumentos: EcacPerdcompDocumento[] = [];
      let pageNum = 1;
      const MAX_PAGES = 50;

      while (pageNum <= MAX_PAGES) {
        const pageResults = await this.parseResultTable();
        log.info(`[eCAC] Página ${pageNum}: ${pageResults.length} registro(s)`);

        if (pageResults.length === 0 && pageNum === 1) {
          // On page 1, extra check: verify we're still on the right page before giving up
          if (await detectSessionExpiry('página 1 vazia')) {
            result.sessaoExpirada = true;
            throw new Error('Sessão e-CAC expirada (resultado vazio na primeira página). Acesse a aba Certificados e clique em "Autenticar no e-CAC" para renovar a sessão.');
          }
          log.warn('[eCAC] Página 1 retornou 0 resultados — assumindo lista vazia');
          break;
        }

        if (pageResults.length === 0 && pageNum > 1) {
          log.warn(`[eCAC] Página ${pageNum} retornou 0 resultados — encerrando`);
          break;
        }

        allDocumentos.push(...pageResults);
        this.progress(
          `Página ${pageNum} coletada (${allDocumentos.length} documentos acumulados)`,
          40 + Math.min(50, pageNum * 3),
        );

        const hasNext = await this.goNextPage(pageNum);
        if (!hasNext) {
          log.info(`[eCAC] Última página atingida (${pageNum})`);
          break;
        }

        await this.page.waitForTimeout(2500);
        await this.waitForLoading();
        pageNum++;
      }

      result.documentos = allDocumentos;
      result.total = allDocumentos.length;
      result.paginas = pageNum;
      result.success = true;
      this.progress(`Consulta concluída: ${allDocumentos.length} documentos em ${pageNum} página(s)`, 95);

    } catch (err: any) {
      log.error(`[eCAC] Erro na consulta: ${err.message}`);
      result.errors.push(err.message);
    } finally {
      await this.fechar();
      this.progress('Processo finalizado', 100);
    }

    return result;
  }

  async fechar(): Promise<void> {
    // Only close context/browser when we own them (browser !== null means we created it).
    // When usarContextoExistente was called, browser is null and the caller owns the lifecycle.
    if (this.browser !== null) {
      try { if (this.context) await this.context.close(); } catch { /* ignore */ }
      try { await this.browser.close(); } catch { /* ignore */ }
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    // Now safe to delete PEM files — browser is closed, no more TLS handshakes pending
    for (const f of this.tempPemFiles) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
    this.tempPemFiles = [];
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Recibo PDF download
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Baixa o PDF do recibo (Imprimir Recibo) para uma lista de números de PER/DCOMP.
   * Mantém uma única sessão de browser para a operação inteira (eficiente para batches grandes).
   *
   * Estratégia de captura — qualquer um destes eventos pode disparar quando o usuário
   * clica em "Imprimir":
   *   1. download event — download direto do PDF
   *   2. response — XHR retornando application/pdf (SPA Angular)
   *   3. popup/page — abertura em nova aba com URL .pdf ou blob:
   */
  async baixarRecibos(
    pfxBuffer: Buffer,
    passphrase: string,
    sessaoCookies: string | null,
    numeros: string[],
    isBatch = false,
    onProgress?: (numero: string, idx: number, total: number, ok: boolean) => void,
    control?: { cancel: boolean; pause: boolean },
    onRecibo?: (numero: string, pdfBuffer: Buffer) => Promise<void>,
  ): Promise<{ recibos: Map<string, Buffer>; sessaoExpirada?: boolean; errors: string[]; cancelado?: boolean }> {
    const result = {
      recibos: new Map<string, Buffer>(),
      sessaoExpirada: false,
      errors: [] as string[],
    };

    try {
      this.assertTimeWindow(isBatch);
    } catch (e: any) {
      result.errors.push(e.message);
      return result;
    }

    // Reseta flag de diagnóstico para que cada execução logue o HTML da primeira linha
    EcacService._htmlLogged = false;

    try {
      if (!this.context) {
        this.progress('Inicializando navegador para baixar recibos...', 5);
        await this.initBrowser(pfxBuffer, passphrase, sessaoCookies);
      } else {
        this.progress('Reutilizando sessão autenticada para baixar recibos...', 5);
      }
      if (!this.page || !this.context) throw new Error('Página não inicializada');

      // 1. Estabelecer sessão no portal e-CAC (cross-subdomain)
      await this.page.goto('https://cav.receita.fazenda.gov.br/ecac/', { waitUntil: 'load', timeout: 60000 });
      await this.page.waitForTimeout(3000);
      const portalUrl = this.page.url().toLowerCase();
      log.info(`[eCAC/recibos] URL após navegação portal: ${portalUrl}`);
      if (portalUrl.includes('autenticacao') || portalUrl.includes('login') || portalUrl.includes('sso.acesso.gov.br')) {
        result.sessaoExpirada = true;
        throw new Error('Sessão e-CAC expirada. Renove a autenticação.');
      }
      await this.waitForLoading();

      // 2. Navegar para o app PER/DCOMP Web dentro do e-CAC.
      // O perdcomp-web é carregado num <iframe> na página do e-CAC. Para automação via
      // Playwright navegamos diretamente para a URL do iframe, que é um Angular SPA.
      this.progress('Carregando PER/DCOMP Web...', 15);

      const PERDCOMP_WEB_BASE = 'https://www3.cav.receita.fazenda.gov.br/perdcomp-web/';

      // Tenta navegar para a URL com hash de rota Angular conhecida (Documentos Entregues).
      // Se o app redirecionar para outra rota, ao menos já partimos do ponto certo.
      await this.page.goto(PERDCOMP_WEB_BASE, { waitUntil: 'load', timeout: 90000 });
      await this.page.waitForTimeout(5000);
      await this.waitForLoading();
      log.info(`[eCAC/Recibo] URL após goto perdcomp-web: ${this.page.url()}`);

      // Diagnóstico inicial: o que está na página logo após carregar?
      const snapInicial = await this.page.evaluate(() => ({
        url: location.href,
        title: document.title,
        bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 600),
        links: Array.from(document.querySelectorAll('a, button')).slice(0, 30).map((e: any) => ({
          tag: e.tagName,
          text: (e.textContent || '').trim().slice(0, 60),
          href: e.getAttribute('href') || '',
          title: e.getAttribute('title') || '',
        })).filter((l: any) => l.text || l.href),
      })).catch(() => null);
      if (snapInicial) {
        log.info(`[eCAC/Recibo] Snap inicial — title="${snapInicial.title}" url="${snapInicial.url}"`);
        log.info(`[eCAC/Recibo] Snap body: ${snapInicial.bodyText}`);
        log.info(`[eCAC/Recibo] Snap links (${snapInicial.links.length}): ${JSON.stringify(snapInicial.links).slice(0, 1500)}`);
      }

      // 2a. Clicar em "Visualizar Documentos" no menu lateral
      // O sidebar da perdcomp-web tem dois itens: "Novo Documento" e "Visualizar Documentos".
      // Precisamos clicar em "Visualizar Documentos" para acessar a lista de documentos.
      let clickedVisualizarDocs = false;
      const vizSelectors = [
        'a:has-text("Visualizar Documentos")',
        'button:has-text("Visualizar Documentos")',
        '[class*="menu"] a:has-text("Visualizar")',
        '[class*="sidebar"] a:has-text("Visualizar")',
        '[class*="nav"] a:has-text("Visualizar")',
        'li a:has-text("Visualizar")',
      ];
      for (const sel of vizSelectors) {
        try {
          const loc = this.page.locator(sel).first();
          if (await loc.count() > 0) {
            await loc.click({ timeout: 6000 });
            log.info(`[eCAC/Recibo] Clicou "Visualizar Documentos" via: ${sel}`);
            clickedVisualizarDocs = true;
            break;
          }
        } catch { /* try next */ }
      }
      if (!clickedVisualizarDocs) {
        // Fallback via getByRole
        try {
          await this.page.getByRole('link', { name: /visualizar/i }).first().click({ timeout: 5000 });
          log.info(`[eCAC/Recibo] Clicou "Visualizar Documentos" via getByRole`);
          clickedVisualizarDocs = true;
        } catch { /* not found */ }
      }
      if (clickedVisualizarDocs) {
        await this.page.waitForTimeout(3000);
        await this.waitForLoading();
        log.info(`[eCAC/Recibo] URL após Visualizar Documentos: ${this.page.url()}`);
      } else {
        log.warn('[eCAC/Recibo] Não foi possível clicar em "Visualizar Documentos"');
      }

      // 2b. Clicar na aba "Documentos Entregues"
      // A página tem duas abas: "Rascunhos" e "Documentos Entregues".
      // O botão de imprimir só existe na aba Documentos Entregues.
      let clickedEntregues = false;
      const entregueSelectors = [
        'a:has-text("Documentos Entregues")',
        'button:has-text("Documentos Entregues")',
        '[role="tab"]:has-text("Documentos Entregues")',
        '[class*="tab"]:has-text("Entregues")',
        'a:has-text("Entregues")',
        'button:has-text("Entregues")',
      ];
      for (const sel of entregueSelectors) {
        try {
          const loc = this.page.locator(sel).first();
          if (await loc.count() > 0) {
            await loc.click({ timeout: 6000 });
            log.info(`[eCAC/Recibo] Clicou "Documentos Entregues" via: ${sel}`);
            clickedEntregues = true;
            break;
          }
        } catch { /* try next */ }
      }
      if (clickedEntregues) {
        await this.page.waitForTimeout(3000);
        await this.waitForLoading();
        log.info(`[eCAC/Recibo] URL após Documentos Entregues: ${this.page.url()}`);
      } else {
        log.warn('[eCAC/Recibo] Não foi possível clicar na aba "Documentos Entregues"');
      }

      // Aguarda a tabela aparecer — em vez de <table>, a perdcomp-web v2.1.0 usa
      // componentes Angular (mat-table/p-table). Aguarda por número PER/DCOMP no body.
      try {
        await this.page.waitForFunction(() => {
          return /\d{1,5}\.\d{1,5}\.\d{6}\.\d{1,2}\.\d{1,2}\.\d{1,3}-\d{4}/.test(document.body.innerText);
        }, { timeout: 20000 });
        log.info('[eCAC/Recibo] Conteúdo de Documentos Entregues carregado (números PER/DCOMP detectados no body)');
      } catch {
        log.warn('[eCAC/Recibo] Timeout aguardando dados de Documentos Entregues — prosseguindo');
      }

      // Diagnóstico pós-navegação
      const snapPos = await this.page.evaluate(() => ({
        url: location.href,
        bodyText: document.body.innerText.replace(/\s+/g, ' ').slice(0, 800),
        tableRows: document.querySelectorAll('table tbody tr, datatable-body-row').length,
        tables: Array.from(document.querySelectorAll('table')).map((t: any) => ({
          id: t.id, cls: (t.getAttribute('class') || '').slice(0, 80),
          ths: Array.from(t.querySelectorAll('th')).map((h: any) => (h.textContent || '').trim()).join(' | '),
          rows: t.querySelectorAll('tbody tr').length,
        })),
      })).catch(() => null);
      if (snapPos) {
        log.info(`[eCAC/Recibo] Snap pós-nav — url="${snapPos.url}" tableRows=${snapPos.tableRows}`);
        log.info(`[eCAC/Recibo] Snap pós-nav body: ${snapPos.bodyText}`);
        if (snapPos.tables.length > 0) {
          log.info(`[eCAC/Recibo] Tabelas: ${JSON.stringify(snapPos.tables).slice(0, 1500)}`);
        }
      }

      await this.tryIncreasePageSize();

      // 3. Para cada linha da grade, cruza com pendentes (chave normalizada) e baixa o PDF
      let pageNum = 1;
      const MAX_PAGES = 50;
      const pendentesPorNorm = new Map<string, string>();
      for (const n of numeros) {
        const norm = normalizePerdcompNumero(n) || n;
        pendentesPorNorm.set(norm, n);
      }
      const totalPendentesIni = pendentesPorNorm.size;

      while (pageNum <= MAX_PAGES && pendentesPorNorm.size > 0) {
        const rowInfos = await this.page.evaluate(() => {
          const flexRe = /(\d{1,5})\.(\d{1,5})\.(\d{6})\.(\d{1,2})\.(\d{1,2})\.(\d{1,3})-(\d{4})/;
          const norm = (m: RegExpMatchArray) => {
            const a = m[1].padStart(5, '0');
            const b = m[2].padStart(5, '0');
            const f = m[6].padStart(2, '0');
            return `${a}.${b}.${m[3]}.${m[4]}.${m[5]}.${f}-${m[7]}`;
          };
          const scan = (text: string) => {
            const t = text.replace(/\u00a0/g, ' ');
            const m = t.match(flexRe);
            if (!m) return null;
            return { normalized: norm(m), rawSubstring: m[0] };
          };
          const out: { normalized: string; rawSubstring: string }[] = [];

          // Priority 1: Angular ngx-datatable rows
          const ngxRows = document.querySelectorAll('datatable-body-row');
          if (ngxRows.length > 0) {
            for (const row of Array.from(ngxRows)) {
              const text = (row as HTMLElement).innerText || '';
              const hit = scan(text);
              if (hit) out.push(hit);
            }
            return out;
          }

          // Priority 2: Standard HTML table rows (any table)
          const tableRows = document.querySelectorAll('table tbody tr');
          if (tableRows.length > 0) {
            for (const row of Array.from(tableRows)) {
              const text = (row as HTMLElement).innerText || '';
              const hit = scan(text);
              if (hit) out.push(hit);
            }
            if (out.length > 0) return out;
          }

          // Priority 3: Any element that might be a repeatable row (div/li with the PER/DCOMP pattern)
          const allEls = document.querySelectorAll('[class*="row" i], li, .item, .record');
          for (const el of Array.from(allEls)) {
            const text = (el as HTMLElement).innerText || '';
            const hit = scan(text);
            if (hit) {
              // Avoid duplicates from nested elements
              if (!out.some(o => o.normalized === hit.normalized)) {
                out.push(hit);
              }
            }
          }

          // Priority 4: Scan entire page body (last resort \u2014 catches any structure)
          if (out.length === 0) {
            const pageText = document.body.innerText || '';
            const allMatches = [...pageText.matchAll(/(\d{1,5})\.(\d{1,5})\.(\d{6})\.(\d{1,2})\.(\d{1,2})\.(\d{1,3})-(\d{4})/g)];
            for (const m of allMatches) {
              const normalized = norm(m as unknown as RegExpMatchArray);
              if (!out.some(o => o.normalized === normalized)) {
                out.push({ normalized, rawSubstring: m[0] });
              }
            }
          }

          return out;
        });

        log.info(`[eCAC/Recibo] Página ${pageNum}: ${rowInfos.length} linha(s) com número PER/DCOMP`);

        if (rowInfos.length === 0) {
          // Diagnóstico abrangente: mostra URL atual + primeiros elementos com conteúdo
          const diagInfo = await this.page.evaluate(() => {
            const url = location.href;
            const bodyText = document.body.innerText.replace(/\s+/g, ' ').slice(0, 500);
            const allRows = document.querySelectorAll('datatable-body-row, table tbody tr, [class*="row" i]:not(body):not(div.row)');
            const firstRowHtml = allRows[0] ? (allRows[0] as HTMLElement).outerHTML.replace(/\s+/g, ' ').slice(0, 400) : '';
            const firstRowText = allRows[0] ? (allRows[0] as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 300) : '';
            const tableHeaders = Array.from(document.querySelectorAll('th, datatable-header-cell')).map(h => (h.textContent || '').trim()).filter(Boolean);
            return { url, bodyText, rowCount: allRows.length, firstRowHtml, firstRowText, tableHeaders };
          }).catch(() => null);
          if (diagInfo) {
            log.warn(`[eCAC/Recibo] Pág ${pageNum} ZERO linhas detectadas. URL=${diagInfo.url} rowCount=${diagInfo.rowCount}`);
            log.warn(`[eCAC/Recibo] Body: ${diagInfo.bodyText}`);
            if (diagInfo.tableHeaders.length > 0) log.warn(`[eCAC/Recibo] Headers da tabela: ${diagInfo.tableHeaders.join(' | ')}`);
            if (diagInfo.firstRowText) log.warn(`[eCAC/Recibo] Primeira linha texto: ${diagInfo.firstRowText}`);
            if (diagInfo.firstRowHtml) log.warn(`[eCAC/Recibo] Primeira linha HTML: ${diagInfo.firstRowHtml}`);
          }
        }

        for (const { normalized, rawSubstring } of rowInfos) {
          // Cancel: encerra imediatamente
          if (control?.cancel) {
            log.info('[eCAC/Recibo] Cancelamento solicitado pelo usuário');
            (result as any).cancelado = true;
            return result;
          }
          // Pause: aguarda em loop até retomar ou cancelar
          if (control?.pause) {
            const pctAtual = 15 + Math.floor(((totalPendentesIni - pendentesPorNorm.size) / numeros.length) * 80);
            this.progress('Pausado pelo usuário', pctAtual);
            while (control?.pause && !control?.cancel) {
              await this.page.waitForTimeout(1000);
            }
          }
          if (control?.cancel) {
            (result as any).cancelado = true;
            return result;
          }

          const original = pendentesPorNorm.get(normalized);
          if (!original) continue;

          const hints = locatorHintsForPerdcomp(normalized, rawSubstring);
          const ok = await this.baixarReciboParaNumero(original, result.recibos, hints);
          pendentesPorNorm.delete(normalized);
          const done = totalPendentesIni - pendentesPorNorm.size;
          onProgress?.(original, done, numeros.length, ok);
          this.progress(
            `Recibo ${done}/${numeros.length} (${original})`,
            15 + Math.floor((done / numeros.length) * 80),
          );
          if (ok && onRecibo) {
            // Progressive persistence — fire callback so the controller can save the PDF
            // to the DB immediately, making it available for download in the UI without
            // waiting for the entire batch to finish.
            const pdf = result.recibos.get(original);
            if (pdf) {
              try {
                await onRecibo(original, pdf);
              } catch (e: any) {
                log.warn(`[eCAC/Recibo] onRecibo callback falhou para ${original}: ${e.message}`);
              }
            }
          }
          if (!ok) result.errors.push(`Falha ao baixar recibo de ${original}`);
        }

        if (pendentesPorNorm.size === 0) break;
        if (control?.cancel) { (result as any).cancelado = true; return result; }
        const hasNext = await this.goNextPage(pageNum);
        if (!hasNext) {
          log.info(`[eCAC/Recibo] Última página atingida (${pageNum}); ${pendentesPorNorm.size} pendente(s) não encontrado(s)`);
          break;
        }
        await this.page.waitForTimeout(2500);
        await this.waitForLoading();
        pageNum++;
      }

      if (pendentesPorNorm.size > 0) {
        const amostra = Array.from(pendentesPorNorm.values()).slice(0, 5).join(', ');
        // Esses documentos foram importados anteriormente (provavelmente via programa
        // desktop antigo da Receita, pré-2015) mas não estão mais visíveis no PERDCOMP
        // Web atual. Não é erro — apenas informativo: o recibo PDF não pode ser baixado
        // automaticamente. Conforme negócio: docs antigos do programa desktop não têm
        // necessidade de baixa via crawler.
        result.errors.push(
          `${pendentesPorNorm.size} documento(s) só existem no programa antigo da Receita ` +
          `(pré-PERDCOMP Web), recibos não disponíveis para download automático. ` +
          `Amostra: ${amostra}${pendentesPorNorm.size > 5 ? '...' : ''}`,
        );
      }

      this.progress(`Concluído: ${result.recibos.size} recibo(s) baixado(s)`, 95);
    } catch (err: any) {
      log.error(`[eCAC/Recibo] Erro: ${err.message}`);
      result.errors.push(err.message);
    } finally {
      await this.fechar();
      this.progress('Processo finalizado', 100);
    }

    return result;
  }

  /**
   * Baixa o PDF completo do DOCUMENTO PER/DCOMP (não o recibo) clicando no
   * ícone "Imprimir" da última coluna da lista de Documentos Entregues.
   *
   * Diferença pro recibo:
   *   • Recibo  → expandir linha (+) → "Imprimir Recibo" no painel
   *   • Documento → click direto no ícone de impressora na coluna "Imprimir"
   * O PDF é maior (~5 páginas com todos os dados do PER/DCOMP).
   */
  async baixarDocumentos(
    pfxBuffer: Buffer,
    passphrase: string,
    sessaoCookies: string | null,
    numeros: string[],
    isBatch = false,
    onProgress?: (numero: string, idx: number, total: number, ok: boolean) => void,
    control?: { cancel: boolean; pause: boolean },
    onDocumento?: (numero: string, pdfBuffer: Buffer) => Promise<void>,
  ): Promise<{ documentos: Map<string, Buffer>; sessaoExpirada?: boolean; errors: string[]; cancelado?: boolean }> {
    const result = {
      documentos: new Map<string, Buffer>(),
      sessaoExpirada: false,
      errors: [] as string[],
    };

    try { this.assertTimeWindow(isBatch); }
    catch (e: any) { result.errors.push(e.message); return result; }

    try {
      if (!this.context) {
        this.progress('Inicializando navegador para baixar documentos...', 5);
        await this.initBrowser(pfxBuffer, passphrase, sessaoCookies);
      } else {
        this.progress('Reutilizando sessão autenticada para baixar documentos...', 5);
      }
      if (!this.page || !this.context) throw new Error('Página não inicializada');

      await this.page.goto('https://cav.receita.fazenda.gov.br/ecac/', { waitUntil: 'load', timeout: 60000 });
      await this.page.waitForTimeout(3000);
      const portalUrl = this.page.url().toLowerCase();
      if (portalUrl.includes('autenticacao') || portalUrl.includes('login') || portalUrl.includes('sso.acesso.gov.br')) {
        result.sessaoExpirada = true;
        throw new Error('Sessão e-CAC expirada. Renove a autenticação.');
      }
      await this.waitForLoading();

      this.progress('Carregando PER/DCOMP Web...', 15);
      const PERDCOMP_WEB_BASE = 'https://www3.cav.receita.fazenda.gov.br/perdcomp-web/';
      await this.page.goto(PERDCOMP_WEB_BASE, { waitUntil: 'load', timeout: 90000 });
      await this.page.waitForTimeout(5000);
      await this.waitForLoading();

      // Clicar em "Visualizar Documentos" (sidebar)
      const vizSelectors = [
        'a:has-text("Visualizar Documentos")', 'button:has-text("Visualizar Documentos")',
        '[class*="menu"] a:has-text("Visualizar")', '[class*="sidebar"] a:has-text("Visualizar")',
        '[class*="nav"] a:has-text("Visualizar")', 'li a:has-text("Visualizar")',
      ];
      for (const sel of vizSelectors) {
        try {
          const loc = this.page.locator(sel).first();
          if (await loc.count() > 0) {
            await loc.click({ timeout: 6000 });
            await this.page.waitForTimeout(3000);
            await this.waitForLoading();
            break;
          }
        } catch { /* try next */ }
      }

      // Clicar na aba "Documentos Entregues"
      const entregueSelectors = [
        'a:has-text("Documentos Entregues")', 'button:has-text("Documentos Entregues")',
        '[role="tab"]:has-text("Documentos Entregues")', '[class*="tab"]:has-text("Entregues")',
      ];
      for (const sel of entregueSelectors) {
        try {
          const loc = this.page.locator(sel).first();
          if (await loc.count() > 0) {
            await loc.click({ timeout: 6000 });
            await this.page.waitForTimeout(3000);
            await this.waitForLoading();
            break;
          }
        } catch { /* try next */ }
      }

      // Aguarda tabela ter números PER/DCOMP visíveis
      try {
        await this.page.waitForFunction(() => {
          return /\d{1,5}\.\d{1,5}\.\d{6}\.\d{1,2}\.\d{1,2}\.\d{1,3}-\d{4}/.test(document.body.innerText);
        }, { timeout: 20000 });
      } catch {
        log.warn('[eCAC/Documento] Timeout aguardando lista — prosseguindo');
      }

      await this.tryIncreasePageSize();

      // Cruza linhas da grade com pendentes (mesma lógica do baixarRecibos)
      let pageNum = 1;
      const MAX_PAGES = 50;
      const pendentesPorNorm = new Map<string, string>();
      for (const n of numeros) {
        const norm = normalizePerdcompNumero(n) || n;
        pendentesPorNorm.set(norm, n);
      }
      const totalPendentesIni = pendentesPorNorm.size;

      while (pageNum <= MAX_PAGES && pendentesPorNorm.size > 0) {
        const rowInfos = await this.page.evaluate(() => {
          const flexRe = /(\d{1,5})\.(\d{1,5})\.(\d{6})\.(\d{1,2})\.(\d{1,2})\.(\d{1,3})-(\d{4})/;
          const norm = (m: RegExpMatchArray) => {
            const a = m[1].padStart(5, '0');
            const b = m[2].padStart(5, '0');
            const f = m[6].padStart(2, '0');
            return `${a}.${b}.${m[3]}.${m[4]}.${m[5]}.${f}-${m[7]}`;
          };
          const out: { normalized: string; rawSubstring: string }[] = [];
          const rows = document.querySelectorAll('datatable-body-row, table tbody tr, [class*="row" i]:not(body):not(div.row)');
          for (const row of Array.from(rows)) {
            const text = (row as HTMLElement).innerText || '';
            const m = text.replace(/ /g, ' ').match(flexRe);
            if (m) out.push({ normalized: norm(m), rawSubstring: m[0] });
          }
          return out;
        });

        log.info(`[eCAC/Documento] Página ${pageNum}: ${rowInfos.length} linha(s)`);

        for (const { normalized, rawSubstring } of rowInfos) {
          if (control?.cancel) { (result as any).cancelado = true; return result; }
          if (control?.pause) {
            const pctAtual = 15 + Math.floor(((totalPendentesIni - pendentesPorNorm.size) / numeros.length) * 80);
            this.progress('Pausado pelo usuário', pctAtual);
            while (control?.pause && !control?.cancel) {
              await this.page.waitForTimeout(1000);
            }
          }
          if (control?.cancel) { (result as any).cancelado = true; return result; }

          const original = pendentesPorNorm.get(normalized);
          if (!original) continue;

          const ok = await this.baixarDocumentoParaNumero(original, result.documentos, rawSubstring);
          pendentesPorNorm.delete(normalized);
          const done = totalPendentesIni - pendentesPorNorm.size;
          onProgress?.(original, done, numeros.length, ok);
          this.progress(
            `Documento ${done}/${numeros.length} (${original})`,
            15 + Math.floor((done / numeros.length) * 80),
          );
          if (ok && onDocumento) {
            const pdf = result.documentos.get(original);
            if (pdf) {
              try { await onDocumento(original, pdf); }
              catch (e: any) { log.warn(`[eCAC/Documento] onDocumento callback falhou para ${original}: ${e.message}`); }
            }
          }
          if (!ok) result.errors.push(`Falha ao baixar documento de ${original}`);
        }

        if (pendentesPorNorm.size === 0) break;
        if (control?.cancel) { (result as any).cancelado = true; return result; }
        const hasNext = await this.goNextPage(pageNum);
        if (!hasNext) {
          log.info(`[eCAC/Documento] Última página atingida (${pageNum}); ${pendentesPorNorm.size} pendente(s)`);
          break;
        }
        await this.page.waitForTimeout(2500);
        await this.waitForLoading();
        pageNum++;
      }

      if (pendentesPorNorm.size > 0) {
        const amostra = Array.from(pendentesPorNorm.values()).slice(0, 5).join(', ');
        result.errors.push(
          `${pendentesPorNorm.size} documento(s) só existem no programa antigo da Receita ` +
          `(pré-PERDCOMP Web), PDFs não disponíveis para download automático. Amostra: ${amostra}`,
        );
      }

      this.progress(`Concluído: ${result.documentos.size} documento(s) baixado(s)`, 95);
    } catch (err: any) {
      log.error(`[eCAC/Documento] Erro: ${err.message}`);
      result.errors.push(err.message);
    } finally {
      await this.fechar();
      this.progress('Processo finalizado', 100);
    }

    return result;
  }

  /**
   * Baixa o PDF completo de UM documento clicando no ícone "Imprimir" da
   * última coluna da linha correspondente ao `numero` na grade atual.
   *
   * O ícone fica na coluna "Imprimir" (última coluna visível); a página dispara
   * um download/response application/pdf via SERPRO ao clicar.
   */
  private async baixarDocumentoParaNumero(
    numero: string,
    out: Map<string, Buffer>,
    rawSubstring: string,
  ): Promise<boolean> {
    if (!this.page || !this.context) return false;

    let captured: Buffer | null = null;

    const onDownload = async (download: any) => {
      if (captured) return;
      try {
        const p = await download.path();
        if (p) {
          const buf = fs.readFileSync(p);
          if (buf && buf.length > 100) captured = buf;
        }
      } catch { /* ignore */ }
    };

    const onResponse = async (response: any) => {
      if (captured) return;
      try {
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        if (ct.includes('application/pdf')) {
          const buf = await response.body();
          if (buf && buf.length > 100) captured = buf;
        }
      } catch { /* ignore */ }
    };

    const onPopup = async (popup: any) => {
      if (captured) return;
      try {
        await popup.waitForLoadState('load', { timeout: 15000 }).catch(() => null);
        // Se o popup é PDF direto
        const popupUrl = popup.url();
        if (popupUrl.endsWith('.pdf') || popupUrl.startsWith('blob:')) {
          const buf = await popup.evaluate(async () => {
            const r = await fetch(location.href);
            const b = await r.arrayBuffer();
            return Array.from(new Uint8Array(b));
          }).catch(() => null);
          if (buf) captured = Buffer.from(buf);
        }
      } catch { /* ignore */ }
    };

    this.page.on('download', onDownload);
    this.page.on('response', onResponse);
    this.context.on('page', onPopup);
    const onContextResponse = (resp: any) => { void onResponse(resp); };
    this.context.on('response', onContextResponse);

    try {
      // Marca a linha pelo número no DOM, então acha o botão/ícone "Imprimir" mais próximo
      // dela e clica. A coluna "Imprimir" é a última, e o elemento clicável é uma
      // <a>/<button> com class contendo "imprimir" ou um <img> com src de impressora.
      const clicked = await this.page.evaluate((numStr: string) => {
        // Encontra a linha que contém o número
        const rows = document.querySelectorAll('datatable-body-row, table tbody tr, [class*="row" i]:not(body):not(div.row)');
        let targetRow: HTMLElement | null = null;
        for (const row of Array.from(rows)) {
          if ((row as HTMLElement).innerText.includes(numStr)) {
            targetRow = row as HTMLElement;
            break;
          }
        }
        if (!targetRow) return false;

        // Procura na linha pelo ícone/link de "Imprimir" — geralmente é o último elemento
        // clicável e tem cor laranja (printer icon).
        const candidatos = targetRow.querySelectorAll('a, button, [role="button"], img[src*="print" i], [class*="print" i], [class*="imprimir" i], i.fa-print, [title*="Imprimir" i], [aria-label*="Imprimir" i]');
        // Filtra: pega o último elemento que parece "imprimir" (mais à direita visualmente)
        let alvo: HTMLElement | null = null;
        for (const el of Array.from(candidatos)) {
          const e = el as HTMLElement;
          const txt = (e.textContent || '').toLowerCase();
          const title = (e.getAttribute('title') || '').toLowerCase();
          const aria = (e.getAttribute('aria-label') || '').toLowerCase();
          const cls = (e.className || '').toString().toLowerCase();
          const src = ((e as HTMLImageElement).src || '').toLowerCase();
          if (txt.includes('imprimir') || title.includes('imprimir') || aria.includes('imprimir') ||
              cls.includes('print') || cls.includes('imprimir') || src.includes('print')) {
            alvo = e;
          }
        }
        if (!alvo) {
          // Fallback: o último elemento clicável da linha (geralmente é o printer icon)
          const all = targetRow.querySelectorAll('a, button, [role="button"]');
          if (all.length > 0) alvo = all[all.length - 1] as HTMLElement;
        }
        if (!alvo) return false;
        alvo.scrollIntoView({ block: 'center' });
        alvo.click();
        return true;
      }, rawSubstring);

      if (!clicked) {
        log.warn(`[eCAC/Documento] Botão Imprimir não encontrado para ${numero}`);
        return false;
      }

      // Aguarda captura (max 25s — Documento maior que recibo, demora um pouco mais)
      for (let i = 0; i < 50 && !captured; i++) {
        await this.page.waitForTimeout(500);
      }

      if (captured) {
        out.set(numero, captured);
        log.info(`[eCAC/Documento] PDF capturado para ${numero} (${(captured as Buffer).length} bytes)`);
        return true;
      }
      log.warn(`[eCAC/Documento] Timeout aguardando PDF para ${numero}`);
      return false;
    } finally {
      this.page.off('download', onDownload);
      this.page.off('response', onResponse);
      this.context.off('page', onPopup);
      this.context.off('response', onContextResponse);
    }
  }

  /**
   * Baixa o PDF de UM documento específico, identificado pelo número, na página corrente.
   *
   * FLUXO CORRETO (confirmado pelo usuário em como_baixaR_recibo.png):
   *   1. Clicar no "+" na primeira coluna para EXPANDIR a linha
   *   2. No painel "Informações da Declaração" que aparece, clicar em "Imprimir Recibo"
   *      (texto laranja, ou no ícone de impressora abaixo dele)
   *   3. Uma nova aba/popup abre com o PDF (response application/pdf vindo do SERPRO)
   *
   * @param matchHints textos que aparecem na linha (ex.: número como no portal + forma canônica).
   */
  private async baixarReciboParaNumero(
    numero: string,
    out: Map<string, Buffer>,
    matchHints?: string[],
  ): Promise<boolean> {
    if (!this.page || !this.context) return false;

    const canon = normalizePerdcompNumero(numero) || numero;
    const hintList = [...new Set([
      ...(matchHints || []),
      ...locatorHintsForPerdcomp(canon, (matchHints && matchHints[0]) || undefined),
    ])].filter((h): h is string => typeof h === 'string' && h.trim().length > 0);

    let captured: Buffer | null = null;
    let capturedSource = '';

    // Captura PDFs vindos como download (Content-Disposition: attachment)
    const onDownload = async (download: any) => {
      if (captured) return;
      try {
        const p = await download.path();
        if (p) {
          const buf = fs.readFileSync(p);
          if (buf && buf.length > 100) {
            captured = buf;
            capturedSource = 'main.download';
            log.info(`[eCAC/Recibo] PDF capturado via main download (${buf.length} bytes)`);
          }
        }
      } catch (e: any) {
        log.warn(`[eCAC/Recibo] onDownload erro: ${e.message}`);
      }
    };

    // Captura PDFs vindos como response application/pdf na página principal
    const onResponse = async (response: any) => {
      if (captured) return;
      try {
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        const cd = (response.headers()['content-disposition'] || '').toLowerCase();
        if (ct.includes('application/pdf') || cd.includes('.pdf')) {
          const body = await response.body();
          if (body && body.length > 100) {
            captured = body;
            capturedSource = 'main.response';
            log.info(`[eCAC/Recibo] PDF capturado via main response: ${response.url()} (${body.length} bytes)`);
          }
        }
      } catch { /* ignore */ }
    };

    // Popup/nova aba: a perdcomp-web abre o recibo numa nova janela. A URL pode ser
    // direta (PDF response) ou pode ser uma página que renderiza o PDF via PDF.js.
    // Atacamos listeners ANTES de qualquer await — o response inicial pode chegar muito rápido.
    const onPopup = async (popup: any) => {
      if (captured) return;
      try {
        // 1. Listener de download na popup (caso o PDF venha como download forçado)
        popup.on('download', async (dl: any) => {
          if (captured) return;
          try {
            const p = await dl.path();
            if (p) {
              const buf = fs.readFileSync(p);
              if (buf && buf.length > 100) {
                captured = buf;
                capturedSource = 'popup.download';
                log.info(`[eCAC/Recibo] PDF capturado via popup download (${buf.length} bytes)`);
              }
            }
          } catch { /* ignore */ }
        });

        // 2. Listener de response — captura QUALQUER response application/pdf na popup
        popup.on('response', async (resp: any) => {
          if (captured) return;
          try {
            const ct = (resp.headers()['content-type'] || '').toLowerCase();
            const cd = (resp.headers()['content-disposition'] || '').toLowerCase();
            if (ct.includes('application/pdf') || cd.includes('.pdf')) {
              const body = await resp.body();
              if (body && body.length > 100) {
                captured = body;
                capturedSource = 'popup.response';
                log.info(`[eCAC/Recibo] PDF capturado via popup response: ${resp.url()} (${body.length} bytes)`);
              }
            }
          } catch { /* ignore */ }
        });

        // 3. Aguarda a popup carregar o conteúdo
        await popup.waitForLoadState('domcontentloaded', { timeout: 15000 }).catch(() => {});
        const url = popup.url();
        log.info(`[eCAC/Recibo] Popup aberto: ${url}`);

        // 4. Se já temos PDF capturado (via response/download), beleza
        if (captured) {
          await popup.close().catch(() => {});
          return;
        }

        // 5. Aguarda mais um pouco — alguns PDFs são carregados via XHR após domcontentloaded
        for (let i = 0; i < 16 && !captured; i++) {
          await popup.waitForTimeout(500);
        }

        // 6. Se ainda não capturou e a URL é navegável, tenta HTTP GET com cookies
        if (!captured && url && url !== 'about:blank' && !url.startsWith('chrome-extension://')) {
          try {
            const resp = await this.context!.request.get(url, { timeout: 15000 });
            const ct = (resp.headers()['content-type'] || '').toLowerCase();
            const body = await resp.body();
            if (body && body.length > 100 && (ct.includes('pdf') || body.slice(0, 5).toString() === '%PDF-')) {
              captured = Buffer.from(body);
              capturedSource = 'popup.http_get';
              log.info(`[eCAC/Recibo] PDF capturado via HTTP GET da popup: ${url} (${captured.length} bytes)`);
            }
          } catch (e: any) {
            log.warn(`[eCAC/Recibo] HTTP GET popup falhou: ${e.message}`);
          }
        }

        await popup.close().catch(() => {});
      } catch (e: any) {
        log.warn(`[eCAC/Recibo] onPopup erro: ${e.message}`);
      }
    };

    // Listener context-level: captura responses application/pdf em QUALQUER page
    // do contexto (incluindo popups que abram após este ponto). É a rede de segurança
    // mais ampla — se nenhum dos outros listeners pegar, este pega.
    const onContextResponse = async (response: any) => {
      if (captured) return;
      try {
        const ct = (response.headers()['content-type'] || '').toLowerCase();
        const cd = (response.headers()['content-disposition'] || '').toLowerCase();
        if (ct.includes('application/pdf') || cd.includes('.pdf')) {
          const body = await response.body();
          if (body && body.length > 100) {
            captured = body;
            capturedSource = 'context.response';
            log.info(`[eCAC/Recibo] PDF capturado via context response: ${response.url()} (${body.length} bytes)`);
          }
        }
      } catch { /* ignore */ }
    };

    this.page.on('download', onDownload);
    this.page.on('response', onResponse);
    this.context.on('page', onPopup);
    this.context.on('response', onContextResponse);

    try {
      // ─────────────────────────────────────────────────────────────────────────
      // LOCALIZAÇÃO DA LINHA — estrutura-agnóstica via JS evaluate.
      //
      // O perdcomp-web v2.1.0 NÃO usa <table>/<tr> padrão (provavelmente Angular
      // Material <mat-table> ou PrimeNG com componentes customizados). Por isso
      // o seletor `tr:has-text()` falha mesmo quando o número está na página.
      //
      // Estratégia: encontra o elemento que contém o número como texto, sobe na
      // árvore DOM até encontrar um "row-like" container (irmãos com mesma tag),
      // e marca esse elemento com data-ts-row="<numero>" para que o Playwright
      // possa interagir com ele via seletor estável.
      // ─────────────────────────────────────────────────────────────────────────
      let rowMarker: string | null = null;
      for (const hint of hintList) {
        const found = await this.page.evaluate((targetNumero: string) => {
          // Procura QUALQUER elemento que tenha o número como parte do seu texto
          const allEls = Array.from(document.querySelectorAll('*')) as HTMLElement[];
          let target: HTMLElement | null = null;
          for (const el of allEls) {
            // Pega só o texto direto deste nó (text nodes filhos), não dos descendentes
            const ownText = Array.from(el.childNodes)
              .filter(n => n.nodeType === 3)
              .map(n => (n.textContent || '').trim())
              .join(' ');
            if (ownText.includes(targetNumero)) {
              target = el;
              break;
            }
          }
          if (!target) {
            // Fallback: procura o número em qualquer elemento que contenha o texto
            // (incluindo via descendentes) mas com o menor número de descendentes
            // (i.e., o mais "folha" possível)
            let best: HTMLElement | null = null;
            let bestSize = Infinity;
            for (const el of allEls) {
              if ((el.textContent || '').includes(targetNumero)) {
                const size = el.querySelectorAll('*').length;
                if (size < bestSize) {
                  best = el;
                  bestSize = size;
                }
              }
            }
            target = best;
          }
          if (!target) return null;

          // Sobe na árvore até encontrar um "row" — elemento cujo pai tem
          // múltiplos filhos com a mesma tag (indicando linhas irmãs)
          let p: HTMLElement = target;
          let rowEl: HTMLElement | null = null;
          for (let i = 0; i < 15 && p.parentElement; i++) {
            const parent = p.parentElement;
            const sameTagSiblings = Array.from(parent.children).filter(c => c.tagName === p.tagName);
            // Critérios para ser linha: pelo menos 2 irmãos com mesma tag,
            // e o elemento parece ter "células" (filhos diretos múltiplos)
            if (sameTagSiblings.length >= 2 && p.children.length >= 2 && p.tagName !== 'BODY' && p.tagName !== 'HTML') {
              rowEl = p;
              break;
            }
            p = parent;
          }
          // Fallback: usa o pai imediato do elemento de texto
          if (!rowEl && target.parentElement && target.parentElement.tagName !== 'BODY') {
            rowEl = target.parentElement;
          }
          if (!rowEl) rowEl = target;

          // Marca o elemento com data-ts-row para Playwright localizá-lo
          const marker = 'ts-row-' + Math.random().toString(36).slice(2, 10);
          rowEl.setAttribute('data-ts-row', marker);
          return {
            marker,
            tag: rowEl.tagName,
            cls: (rowEl.getAttribute('class') || '').slice(0, 80),
            childCount: rowEl.children.length,
            text: (rowEl.textContent || '').replace(/\s+/g, ' ').slice(0, 200),
          };
        }, hint);
        if (found) {
          rowMarker = found.marker;
          log.info(`[eCAC/Recibo] Linha localizada para ${numero}: tag=${found.tag} cls="${found.cls}" filhos=${found.childCount}`);
          if (!EcacService._htmlLogged) {
            log.warn(`[eCAC/Recibo] Texto da linha: ${found.text}`);
          }
          break;
        }
      }

      if (!rowMarker) {
        log.warn(`[eCAC/Recibo] Linha não encontrada para ${numero} (dicas: ${hintList.slice(0, 3).join(' | ')})`);
        return false;
      }

      const row = this.page.locator(`[data-ts-row="${rowMarker}"]`);

      const urlAntes = this.page.url();
      let clicked = false;

      // ─────────────────────────────────────────────────────────────────────────
      // DIAGNÓSTICO (apenas na primeira linha): captura HTML completo da linha
      // e elementos relacionados a "imprimir" para identificar seletores reais.
      // ─────────────────────────────────────────────────────────────────────────
      if (!EcacService._htmlLogged) {
        try {
          const fullRow = await row.evaluate((el: any) => el.outerHTML).catch(() => '');
          if (fullRow) {
            const compact = String(fullRow).replace(/\s+/g, ' ');
            const chunkSize = 2000;
            for (let i = 0; i < compact.length && i < 10000; i += chunkSize) {
              log.warn(`[eCAC/Recibo] HTML linha (parte ${Math.floor(i/chunkSize)+1}): ${compact.slice(i, i + chunkSize)}`);
            }
          }
        } catch { /* ignore */ }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // ESTRATÉGIA 1 (PRIMÁRIA — confirmada pelo usuário em como_baixaR_recibo.png):
      // 1a. Clicar no "+" da primeira coluna para expandir a linha
      // 1b. No painel expandido "Informações da Declaração", clicar em "Imprimir Recibo"
      //     ou no ícone de impressora abaixo do texto
      // ─────────────────────────────────────────────────────────────────────────

      // 1a. Expandir a linha clicando no "+" (estrutura-agnóstico via JS)
      let expanded = false;
      try {
        const expandResult = await this.page.evaluate((marker: string) => {
          const rowEl = document.querySelector(`[data-ts-row="${marker}"]`) as HTMLElement | null;
          if (!rowEl) return { clicked: false, reason: 'row marker not found' };

          // A primeira "célula" é o primeiro filho direto da linha
          const firstCell = rowEl.firstElementChild as HTMLElement | null;
          if (!firstCell) return { clicked: false, reason: 'no first child cell' };

          // Procura clicável dentro da primeira célula
          // Preferência: <a> ou <button>, depois elementos com classes plus/expand,
          // depois imagens/ícones, por último a própria célula.
          const candidates: HTMLElement[] = [];
          const collect = (el: Element) => {
            const tag = el.tagName;
            if (tag === 'A' || tag === 'BUTTON') {
              candidates.unshift(el as HTMLElement);  // prioridade alta
            } else if ((el as any).onclick || el.getAttribute('ng-click') || el.getAttribute('(click)')) {
              candidates.unshift(el as HTMLElement);
            } else {
              const cls = (el.getAttribute('class') || '').toLowerCase();
              if (cls.includes('plus') || cls.includes('expan') || cls.includes('toggle')) {
                candidates.unshift(el as HTMLElement);
              } else if (tag === 'IMG' || tag === 'I' || tag === 'SPAN' || tag === 'svg') {
                candidates.push(el as HTMLElement); // prioridade média
              }
            }
            for (const child of Array.from(el.children)) collect(child);
          };
          collect(firstCell);

          // Adiciona a própria firstCell como último recurso
          candidates.push(firstCell);

          if (candidates.length === 0) {
            // Fallback total: clica no row inteiro
            rowEl.click();
            return { clicked: true, via: 'rowEl', tag: rowEl.tagName };
          }

          const target = candidates[0];
          target.click();
          return {
            clicked: true,
            via: 'firstCell-child',
            tag: target.tagName,
            cls: (target.getAttribute('class') || '').slice(0, 60),
          };
        }, rowMarker);

        if (expandResult.clicked) {
          expanded = true;
          log.info(`[eCAC/Recibo] Expandiu linha de ${numero} via ${(expandResult as any).via} tag=${(expandResult as any).tag}`);
        } else {
          log.warn(`[eCAC/Recibo] Não foi possível expandir linha de ${numero}: ${(expandResult as any).reason}`);
        }
      } catch (e: any) {
        log.warn(`[eCAC/Recibo] Falha ao expandir linha de ${numero}: ${e?.message || e}`);
      }

      // Aguarda o painel expandido renderizar (Angular animation)
      if (expanded) {
        await this.page.waitForTimeout(1500);

        // 1b. Diagnóstico: na primeira expansão, captura HTML do painel para identificar seletores
        if (!EcacService._htmlLogged) {
          try {
            const panelInfo = await this.page.evaluate(() => {
              // Procura "Imprimir Recibo" e captura o elemento + pais + irmãos
              const allEls = Array.from(document.querySelectorAll('*'));
              const target = allEls.find(el => {
                const t = (el.textContent || '').trim();
                return t === 'Imprimir Recibo' || (t.includes('Imprimir Recibo') && t.length < 50 && el.children.length < 5);
              });
              if (!target) return { found: false, html: '' };
              // Captura ancestral até 3 níveis acima
              let ancestor = target as HTMLElement;
              for (let i = 0; i < 3 && ancestor.parentElement; i++) {
                ancestor = ancestor.parentElement;
              }
              return {
                found: true,
                targetTag: target.tagName,
                targetCls: target.getAttribute('class') || '',
                targetHref: target.getAttribute('href') || '',
                ancestorHtml: ancestor.outerHTML.replace(/\s+/g, ' ').slice(0, 3000),
              };
            }).catch(() => null);
            if (panelInfo) {
              log.warn(`[eCAC/Recibo] DIAG painel: found=${panelInfo.found} tag=${(panelInfo as any).targetTag} cls="${(panelInfo as any).targetCls}" href="${(panelInfo as any).targetHref}"`);
              if (panelInfo.found) {
                log.warn(`[eCAC/Recibo] DIAG ancestor HTML: ${(panelInfo as any).ancestorHtml}`);
              }
            }
            EcacService._htmlLogged = true;
          } catch { /* ignore */ }
        }

        // 1c. CLICAR em "Imprimir Recibo" usando JS evaluate.
        //
        // Estrutura real (descoberta nos logs): o texto "Imprimir Recibo" está num
        // <label> que NÃO é o clicável. O clicável (<a>/<button>) está em outro
        // container irmão (ou ancestral comum), separado por vários níveis de div.
        //
        // Estratégia: encontra "Imprimir Recibo" no DOM, sobe até um PAINEL
        // (ancestral grande, geralmente o container expandido da linha) e busca
        // TODOS os clicáveis dentro desse painel. Filtra os mais prováveis
        // (com classe/title/href contendo print/imprim/recibo) e clica.
        const clickResult = await this.page.evaluate((rowMarkerArg: string) => {
          // Acha o elemento da linha marcada — ESSENCIAL para escopar a busca,
          // já que múltiplos painéis podem estar abertos simultaneamente.
          const rowEl = document.querySelector(`[data-ts-row="${rowMarkerArg}"]`) as HTMLElement | null;
          if (!rowEl) return { clicked: false, reason: 'rowMarker não encontrado no DOM' };

          // Calcula DOM-distance entre dois elementos (ancestral comum + delta)
          const domDistance = (a: HTMLElement, b: HTMLElement): number => {
            const ancA: HTMLElement[] = [];
            let p: HTMLElement | null = a;
            while (p) { ancA.push(p); p = p.parentElement; }
            const setA = new Set(ancA);
            let dist = 0;
            p = b;
            while (p && !setA.has(p)) { dist++; p = p.parentElement; }
            if (!p) return 9999;
            return dist + ancA.indexOf(p);
          };

          // Procura TODOS os elementos com texto "Imprimir Recibo"
          const allEls = Array.from(document.querySelectorAll('*')) as HTMLElement[];
          const allReciboTextEls = allEls.filter(el => {
            const ownText = Array.from(el.childNodes)
              .filter(n => n.nodeType === 3)
              .map(n => (n.textContent || '').trim())
              .join(' ').trim();
            return ownText === 'Imprimir Recibo' || (ownText.includes('Imprimir Recibo') && ownText.length < 60);
          });

          if (allReciboTextEls.length === 0) {
            const wide = allEls.filter(el => {
              const t = (el.textContent || '').trim();
              return t.includes('Imprimir Recibo') && t.length < 50 && el.children.length <= 2;
            });
            allReciboTextEls.push(...wide);
          }

          if (allReciboTextEls.length === 0) {
            return { clicked: false, reason: 'texto "Imprimir Recibo" não encontrado no DOM' };
          }

          // CRÍTICO: escolhe o "Imprimir Recibo" MAIS PRÓXIMO da linha marcada.
          // Isso evita clicar no painel da linha anterior (que ainda pode estar aberto).
          const reciboTextEls = allReciboTextEls
            .map(el => ({ el, dist: domDistance(rowEl, el) }))
            .sort((a, b) => a.dist - b.dist)
            .map(x => x.el);

          // Loga as distâncias para debug (só primeiras 3)
          const distInfo = allReciboTextEls
            .map(el => domDistance(rowEl, el))
            .sort((a, b) => a - b)
            .slice(0, 3);
          (window as any).__lastReciboSearchDist = distInfo;

          // Para cada elemento com texto, sobe até um ANCESTRAL GRANDE (painel)
          // e procura clicáveis dentro dele
          const tryClickAround = (textEl: HTMLElement) => {
            // 1. Se for clicável, clica nele
            if (textEl.tagName === 'A' || textEl.tagName === 'BUTTON' ||
                (textEl as any).onclick || textEl.getAttribute('ng-click') || textEl.hasAttribute('(click)')) {
              textEl.click();
              return { via: 'self:' + textEl.tagName, tag: textEl.tagName };
            }

            // 2. Sobe até 10 níveis procurando um painel/container
            let panel: HTMLElement = textEl;
            for (let i = 0; i < 10 && panel.parentElement; i++) {
              panel = panel.parentElement;
              if (panel.tagName === 'BODY') break;
            }
            // Volta um pouco se subiu demais (até 4 níveis acima do texto)
            let panelCandidate: HTMLElement = textEl;
            for (let i = 0; i < 4 && panelCandidate.parentElement; i++) {
              panelCandidate = panelCandidate.parentElement;
            }

            // 3. Coleta TODOS os clicáveis dentro do painel
            const collectClickables = (root: HTMLElement) => {
              const result: HTMLElement[] = [];
              const all = root.querySelectorAll('a, button, [onclick], [ng-click], [class*="print" i], [class*="imprim" i], [class*="recibo" i]');
              for (const el of Array.from(all)) result.push(el as HTMLElement);
              return result;
            };

            const candidates = collectClickables(panelCandidate);
            if (candidates.length === 0) {
              // Sobe mais e tenta de novo
              const candidates2 = collectClickables(panel);
              candidates.push(...candidates2);
            }

            // 4. Calcula "distância DOM" entre cada candidato e o texto
            // (quanto menor a distância, mais provável que seja o botão certo)
            const domDistance = (a: HTMLElement, b: HTMLElement): number => {
              // Encontra ancestral comum mais próximo
              const ancA: HTMLElement[] = [];
              let p: HTMLElement | null = a;
              while (p) { ancA.push(p); p = p.parentElement; }
              const setA = new Set(ancA);
              let dist = 0;
              p = b;
              while (p && !setA.has(p)) { dist++; p = p.parentElement; }
              if (!p) return 9999;
              const idx = ancA.indexOf(p);
              return dist + idx;
            };

            // 5. Filtra candidatos: prefere os com indicação de "imprim/print/recibo"
            // OU posicionados próximos ao texto
            const scored = candidates.map(c => {
              const title = (c.getAttribute('title') || '').toLowerCase();
              const aria = (c.getAttribute('aria-label') || '').toLowerCase();
              const cls = (c.getAttribute('class') || '').toLowerCase();
              const href = (c.getAttribute('href') || '').toLowerCase();
              const ngClick = (c.getAttribute('ng-click') || c.getAttribute('(click)') || '').toLowerCase();
              const text = (c.textContent || '').trim().toLowerCase();
              const imgSrc = (c.querySelector('img')?.getAttribute('src') || '').toLowerCase();

              let score = 0;
              const haystack = `${title} ${aria} ${cls} ${href} ${ngClick} ${imgSrc}`;
              if (haystack.includes('imprim') || haystack.includes('print')) score += 100;
              if (haystack.includes('recibo')) score += 50;
              if (text.includes('imprimir') || text.includes('recibo')) score += 30;
              if (c.tagName === 'A') score += 5;
              if (c.tagName === 'BUTTON') score += 5;
              // Penaliza distância (quanto mais perto, melhor)
              const dist = domDistance(textEl, c);
              score -= dist;

              return { el: c, score, dist, info: {
                tag: c.tagName,
                cls: cls.slice(0, 60),
                title,
                aria,
                href,
                text: text.slice(0, 30),
                imgSrc: imgSrc.slice(0, 40),
              } };
            });

            scored.sort((a, b) => b.score - a.score);

            // 6. Clica no melhor candidato (excluindo o próprio textEl se incluído)
            for (const cand of scored) {
              if (cand.el === textEl) continue;
              cand.el.click();
              return {
                via: 'panel-search',
                tag: cand.el.tagName,
                cls: cand.info.cls,
                title: cand.info.title,
                href: cand.info.href,
                imgSrc: cand.info.imgSrc,
                text: cand.info.text,
                score: cand.score,
                dist: cand.dist,
                totalCandidates: scored.length,
              };
            }

            return null;
          };

          // Tenta com cada texto "Imprimir Recibo" encontrado
          for (const textEl of reciboTextEls) {
            const result = tryClickAround(textEl);
            if (result) return { clicked: true, ...result };
          }

          // Último recurso: clica no próprio texto
          reciboTextEls[0].click();
          return {
            clicked: true,
            via: 'fallback:' + reciboTextEls[0].tagName,
            tag: reciboTextEls[0].tagName,
            reason: 'nenhum clicável encontrado, clicou no próprio texto',
            searchDistances: (window as any).__lastReciboSearchDist || [],
          };
        }, rowMarker);

        // Loga distâncias para diagnóstico
        if ((clickResult as any).searchDistances) {
          log.info(`[eCAC/Recibo] DEBUG distâncias 'Imprimir Recibo' até rowMarker: ${JSON.stringify((clickResult as any).searchDistances)}`);
        }

        if (clickResult.clicked) {
          clicked = true;
          log.info(`[eCAC/Recibo] CLICK SUCCESS via=${(clickResult as any).via} tag=${(clickResult as any).tag} href="${(clickResult as any).href}" para ${numero}`);
        } else {
          log.warn(`[eCAC/Recibo] CLICK FAIL: ${(clickResult as any).reason} para ${numero}`);
        }
      }

      // ─────────────────────────────────────────────────────────────────────────
      // ESTRATÉGIA 2 (FALLBACK): se a expansão+click não funcionou, tenta o ícone "Imprimir" na última coluna
      // ─────────────────────────────────────────────────────────────────────────
      if (!clicked) {
        try {
          const printBtn = row.locator(
            'td:last-child a, td:last-child button, ' +
            'button[title*="primir" i], a[title*="primir" i], ' +
            '[aria-label*="primir" i], button:has(i.fa-print), a:has(i.fa-print)'
          ).first();
          if (await printBtn.count() > 0) {
            await printBtn.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
            await printBtn.click({ timeout: 8000 });
            clicked = true;
            log.info(`[eCAC/Recibo] FALLBACK: clicou ícone Imprimir da coluna para ${numero}`);
          }
        } catch (e: any) {
          log.warn(`[eCAC/Recibo] Estratégia 2 falhou: ${e?.message || e}`);
        }
      }

      // Se não encontrou na linha, dispara diagnóstico do painel
      if (!clicked) {
        // Diagnóstico só na primeira falha — captura todo o texto e botões do painel/modal aberto
        if (!EcacService._htmlLogged) {
          try {
            const panelInfo = await this.page.evaluate(() => {
              // Procura por modal/painel/dialog visível
              const containers = Array.from(document.querySelectorAll('[role="dialog"], .modal, .panel, .br-modal, .br-side-menu, aside, [class*="painel" i], [class*="lateral" i]'));
              const visible = containers.find((el: any) => {
                const r = el.getBoundingClientRect();
                return r.width > 100 && r.height > 100;
              });
              const target = visible || document.body;
              const text = (target as HTMLElement).innerText.replace(/\s+/g, ' ').slice(0, 1500);
              const buttons = Array.from(target.querySelectorAll('button, a')).slice(0, 40).map((b: any) => ({
                tag: b.tagName,
                title: b.getAttribute('title') || '',
                aria: b.getAttribute('aria-label') || '',
                cls: (b.getAttribute('class') || '').slice(0, 80),
                text: (b.textContent || '').trim().slice(0, 50),
              })).filter((b: any) => b.text || b.title || b.aria);
              return { text, buttons, found: !!visible, tag: target.tagName };
            }).catch(() => null);
            if (panelInfo) {
              log.warn(`[eCAC/Recibo] Painel após clique (found=${panelInfo.found}, tag=${panelInfo.tag}). Texto: ${panelInfo.text}`);
              log.warn(`[eCAC/Recibo] Botões no painel: ${JSON.stringify(panelInfo.buttons).slice(0, 2500)}`);
            }
            EcacService._htmlLogged = true;
          } catch { /* ignore */ }
        }
      }

      if (!clicked) {
        log.warn(`[eCAC/Recibo] Nenhum botão de impressão encontrado para ${numero}`);
        // Volta para a listagem se houve navegação
        await this.voltarParaListagem(urlAntes).catch(() => {});
        return false;
      }

      // Aguarda até 25s pela captura (popups podem demorar a fechar)
      for (let i = 0; i < 50 && !captured; i++) {
        await this.page.waitForTimeout(500);
      }

      // CRÍTICO: colapsa TODAS as linhas expandidas via JS para que a próxima
      // iteração não encontre "Imprimir Recibo" do painel anterior.
      // O perdcomp-web usa div-based table, não <table>, então usamos o marker.
      try {
        await this.page.evaluate((marker: string) => {
          const rowEl = document.querySelector(`[data-ts-row="${marker}"]`) as HTMLElement | null;
          if (!rowEl) return;
          // Clica na primeira célula da linha para colapsar (mesma ação de expandir)
          const firstCell = rowEl.firstElementChild as HTMLElement | null;
          if (!firstCell) return;
          // Procura o mesmo tipo de clicável usado para expandir
          const collectClickables = (root: HTMLElement) => {
            const result: HTMLElement[] = [];
            const all = root.querySelectorAll('a, button, [onclick], [ng-click], [class*="minus" i], [class*="plus" i], [class*="toggle" i]');
            for (const el of Array.from(all)) result.push(el as HTMLElement);
            return result;
          };
          const candidates = collectClickables(firstCell);
          if (candidates.length > 0) candidates[0].click();
          else firstCell.click();
        }, rowMarker).catch(() => {});
        await this.page.waitForTimeout(500);
      } catch { /* ignore */ }

      // Volta para a listagem para que a próxima linha seja processada
      await this.voltarParaListagem(urlAntes).catch(() => {});

      if (captured) {
        out.set(numero, captured);
        log.info(`[eCAC/Recibo] PDF capturado para ${numero} (${(captured as Buffer).length} bytes)`);
        return true;
      } else {
        log.warn(`[eCAC/Recibo] Timeout aguardando PDF para ${numero}`);
        return false;
      }
    } finally {
      this.page.off('download', onDownload);
      this.page.off('response', onResponse);
      this.context.off('page', onPopup);
      this.context.off('response', onContextResponse);
      if (captured) {
        log.info(`[eCAC/Recibo] ✓ ${numero}: PDF capturado via ${capturedSource} (${(captured as Buffer).length} bytes)`);
      } else {
        log.warn(`[eCAC/Recibo] ✗ ${numero}: NENHUM PDF capturado após click`);
      }
    }
  }

  /**
   * Fecha o painel/modal aberto pela ação "Exibir Relacionados" para que a
   * próxima linha possa ser processada. Caso tenha havido navegação real
   * (URL diferente), tenta voltar.
   */
  private async voltarParaListagem(urlOriginal: string): Promise<void> {
    if (!this.page) return;
    try {
      const currentUrl = this.page.url();

      // Se a URL mudou (navegação real), volta para a listagem de Documentos Entregues
      if (currentUrl !== urlOriginal) {
        await this.page.goBack({ timeout: 8000 }).catch(() => {});
        await this.page.waitForTimeout(1500);
      }

      // Limpa data-ts-row markers para evitar conflito na próxima iteração
      await this.page.evaluate(() => {
        document.querySelectorAll('[data-ts-row]').forEach(el => el.removeAttribute('data-ts-row'));
      }).catch(() => {});
    } catch { /* ignore */ }
  }
}
