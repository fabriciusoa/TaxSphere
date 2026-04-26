import puppeteer, { Browser, Page } from 'puppeteer';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { log } from '../utils/logger';

const ECAC_LOGIN_URL = 'https://cav.receita.fazenda.gov.br/autenticacao/login';
const ECAC_DCTFWEB_URL = 'https://dctfweb.cav.receita.fazenda.gov.br/aplicacoesweb/dctfweb/default.aspx';
const ECAC_SITUACAO_URL = 'https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=10015&origem=pesquisa';

const NAVIGATION_TIMEOUT = 60000;
const PAGE_LOAD_DELAY = 3000;

export interface EcacCredito {
  tipo_credito: string;
  origem_credito: string;
  periodo_apuracao: string;
  codigo_receita: string;
  valor_original: number;
  dt_pagamento_original: string;
  observacoes: string;
}

export interface EcacDebito {
  tipo_tributo: string;
  codigo_receita: string;
  periodo_apuracao: string;
  valor_principal: number;
  valor_multa: number;
  valor_juros: number;
  dt_vencimento: string;
  observacoes: string;
}

export interface EcacDctfWebDeclaracao {
  categoria: string;
  periodo_apuracao: string;
  situacao: string;
  debito_apurado: number;
  saldo_pagar: number;
  data_transmissao: string;
  origem: string;
}

export interface EcacExtractionResult {
  success: boolean;
  creditos: EcacCredito[];
  debitos: EcacDebito[];
  declaracoes: EcacDctfWebDeclaracao[];
  errors: string[];
  screenshots?: string[];
}

interface TempCertFile {
  path: string;
  cleanup: () => void;
}

function writeTempPfx(pfxBuffer: Buffer): TempCertFile {
  const tmpDir = os.tmpdir();
  const filename = `taxsphere-cert-${crypto.randomBytes(8).toString('hex')}.pfx`;
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, pfxBuffer, { mode: 0o600 });
  return {
    path: filePath,
    cleanup: () => {
      try { fs.unlinkSync(filePath); } catch { /* ignore */ }
    },
  };
}

export class EcacService {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private tempCert: TempCertFile | null = null;
  private onProgress?: (msg: string, pct: number) => void;

  constructor(onProgress?: (msg: string, pct: number) => void) {
    this.onProgress = onProgress;
  }

  private progress(msg: string, pct: number) {
    log.info(`[eCAC] ${msg} (${pct}%)`);
    this.onProgress?.(msg, pct);
  }

  async iniciar(pfxBuffer: Buffer, passphrase: string): Promise<void> {
    this.progress('Preparando certificado digital...', 5);

    this.tempCert = writeTempPfx(pfxBuffer);

    this.progress('Iniciando navegador...', 10);

    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1366,768',
        '--ignore-certificate-errors',
        `--auto-select-certificate-for-urls={"pattern":"*receita.fazenda.gov.br*","filter":{}}`,
      ],
    });

    const context = this.browser.defaultBrowserContext();
    this.page = await context.newPage();

    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT);

    await this.page.setRequestInterception(true);
    this.page.on('request', (request) => {
      const blockedTypes = ['image', 'stylesheet', 'font', 'media'];
      if (blockedTypes.includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });
  }

  async autenticarEcac(): Promise<boolean> {
    if (!this.page || !this.tempCert) throw new Error('Navegador não iniciado');

    try {
      this.progress('Acessando portal eCAC...', 15);
      await this.page.goto(ECAC_LOGIN_URL, { waitUntil: 'networkidle2' });

      await this.delay(PAGE_LOAD_DELAY);
      this.progress('Selecionando autenticação por certificado...', 20);

      const certButtonSelectors = [
        'a[href*="certificado"]',
        'button:has-text("Certificado")',
        '[data-type="certificado"]',
        'a.certificado-digital',
        '#login-certificate',
        'a[title*="certificado" i]',
        'a[title*="Certificado" i]',
      ];

      let clicked = false;
      for (const selector of certButtonSelectors) {
        try {
          const el = await this.page.$(selector);
          if (el) {
            await el.click();
            clicked = true;
            break;
          }
        } catch { /* try next */ }
      }

      if (!clicked) {
        const links = await this.page.$$('a');
        for (const link of links) {
          const text = await link.evaluate(el => el.textContent || '');
          if (text.toLowerCase().includes('certificado')) {
            await link.click();
            clicked = true;
            break;
          }
        }
      }

      if (!clicked) {
        log.warn('[eCAC] Não encontrou botão de certificado, tentando acesso direto');
      }

      this.progress('Aguardando autenticação com certificado...', 30);
      await this.delay(5000);

      const currentUrl = this.page.url();
      const authenticated = currentUrl.includes('ecac') ||
                           currentUrl.includes('cav.receita') ||
                           currentUrl.includes('dctfweb') ||
                           !currentUrl.includes('login');

      if (authenticated) {
        this.progress('Autenticação realizada com sucesso', 35);
        return true;
      }

      log.warn(`[eCAC] URL pós-login: ${currentUrl}`);
      return false;
    } catch (err: any) {
      log.error(`[eCAC] Erro na autenticação: ${err.message}`);
      return false;
    }
  }

  async extrairDCTFWeb(): Promise<EcacDctfWebDeclaracao[]> {
    if (!this.page) throw new Error('Navegador não iniciado');

    const declaracoes: EcacDctfWebDeclaracao[] = [];

    try {
      this.progress('Acessando DCTFWeb...', 40);
      await this.page.goto(ECAC_DCTFWEB_URL, { waitUntil: 'networkidle2' });
      await this.delay(PAGE_LOAD_DELAY);

      this.progress('Extraindo declarações DCTFWeb...', 50);

      const rows = await this.page.$$('table tbody tr, .grid-row, [role="row"]');

      for (const row of rows) {
        try {
          const cells = await row.$$('td, [role="gridcell"]');
          if (cells.length >= 4) {
            const textos = await Promise.all(
              cells.map(cell => cell.evaluate(el => (el.textContent || '').trim()))
            );

            const decl: EcacDctfWebDeclaracao = {
              categoria: textos[0] || '',
              periodo_apuracao: this.normalizePeriodo(textos[1] || ''),
              situacao: textos[2] || '',
              debito_apurado: this.parseValor(textos[3] || '0'),
              saldo_pagar: this.parseValor(textos[4] || '0'),
              data_transmissao: textos[5] || '',
              origem: 'DCTFWeb',
            };

            if (decl.periodo_apuracao && decl.debito_apurado > 0) {
              declaracoes.push(decl);
            }
          }
        } catch { /* skip row */ }
      }

      this.progress(`${declaracoes.length} declarações encontradas`, 60);
    } catch (err: any) {
      log.error(`[eCAC] Erro ao extrair DCTFWeb: ${err.message}`);
    }

    return declaracoes;
  }

  async extrairSituacaoFiscal(): Promise<{ creditos: EcacCredito[]; debitos: EcacDebito[] }> {
    if (!this.page) throw new Error('Navegador não iniciado');

    const creditos: EcacCredito[] = [];
    const debitos: EcacDebito[] = [];

    try {
      this.progress('Acessando situação fiscal...', 65);
      await this.page.goto(ECAC_SITUACAO_URL, { waitUntil: 'networkidle2' });
      await this.delay(PAGE_LOAD_DELAY);

      this.progress('Extraindo débitos e créditos...', 75);

      const content = await this.page.content();

      const debitRows = await this.page.$$('table.debitos tbody tr, [data-tipo="debito"]');
      for (const row of debitRows) {
        try {
          const cells = await row.$$('td');
          if (cells.length >= 5) {
            const t = await Promise.all(cells.map(c => c.evaluate(el => (el.textContent || '').trim())));
            debitos.push({
              tipo_tributo: this.mapTipoTributo(t[0] || ''),
              codigo_receita: t[1] || '',
              periodo_apuracao: this.normalizePeriodo(t[2] || ''),
              valor_principal: this.parseValor(t[3] || '0'),
              valor_multa: this.parseValor(t[4] || '0'),
              valor_juros: this.parseValor(t[5] || '0'),
              dt_vencimento: this.normalizeDate(t[6] || ''),
              observacoes: `Importado eCAC - ${new Date().toISOString().substring(0, 10)}`,
            });
          }
        } catch { /* skip */ }
      }

      const creditRows = await this.page.$$('table.creditos tbody tr, [data-tipo="credito"]');
      for (const row of creditRows) {
        try {
          const cells = await row.$$('td');
          if (cells.length >= 4) {
            const t = await Promise.all(cells.map(c => c.evaluate(el => (el.textContent || '').trim())));
            creditos.push({
              tipo_credito: this.mapTipoCredito(t[0] || ''),
              origem_credito: 'Pagamento Indevido',
              periodo_apuracao: this.normalizePeriodo(t[1] || ''),
              codigo_receita: t[2] || '',
              valor_original: this.parseValor(t[3] || '0'),
              dt_pagamento_original: this.normalizeDate(t[4] || ''),
              observacoes: `Importado eCAC - ${new Date().toISOString().substring(0, 10)}`,
            });
          }
        } catch { /* skip */ }
      }

      this.progress(`${creditos.length} créditos e ${debitos.length} débitos encontrados`, 85);
    } catch (err: any) {
      log.error(`[eCAC] Erro ao extrair situação fiscal: ${err.message}`);
    }

    return { creditos, debitos };
  }

  convertDeclaracoesToDebitos(declaracoes: EcacDctfWebDeclaracao[]): EcacDebito[] {
    return declaracoes
      .filter(d => d.saldo_pagar > 0 && d.situacao !== 'Inativa')
      .map(d => ({
        tipo_tributo: this.mapCategoriaTributo(d.categoria),
        codigo_receita: '',
        periodo_apuracao: d.periodo_apuracao,
        valor_principal: d.debito_apurado,
        valor_multa: 0,
        valor_juros: Math.max(0, d.saldo_pagar - d.debito_apurado),
        dt_vencimento: this.calcVencimento(d.periodo_apuracao),
        observacoes: `DCTFWeb ${d.categoria} - Situação: ${d.situacao} | Importado eCAC ${new Date().toISOString().substring(0, 10)}`,
      }));
  }

  async executarExtracao(pfxBuffer: Buffer, passphrase: string): Promise<EcacExtractionResult> {
    const result: EcacExtractionResult = {
      success: false, creditos: [], debitos: [], declaracoes: [], errors: [],
    };

    try {
      await this.iniciar(pfxBuffer, passphrase);

      const autenticado = await this.autenticarEcac();
      if (!autenticado) {
        result.errors.push('Falha na autenticação com certificado digital. Verifique se o certificado está válido e se a senha está correta.');
        return result;
      }

      const declaracoes = await this.extrairDCTFWeb();
      result.declaracoes = declaracoes;

      const debitosDctf = this.convertDeclaracoesToDebitos(declaracoes);
      result.debitos.push(...debitosDctf);

      try {
        const { creditos, debitos } = await this.extrairSituacaoFiscal();
        result.creditos.push(...creditos);
        result.debitos.push(...debitos);
      } catch (err: any) {
        result.errors.push(`Situação fiscal parcial: ${err.message}`);
      }

      this.progress('Extração concluída com sucesso', 95);
      result.success = true;
    } catch (err: any) {
      log.error(`[eCAC] Erro geral: ${err.message}`);
      result.errors.push(err.message);
    } finally {
      await this.fechar();
      this.progress('Processo finalizado', 100);
    }

    return result;
  }

  async fechar(): Promise<void> {
    try { if (this.browser) await this.browser.close(); } catch { /* ignore */ }
    this.browser = null;
    this.page = null;
    this.tempCert?.cleanup();
    this.tempCert = null;
  }

  // ---- Helpers ----

  private delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
  }

  private parseValor(text: string): number {
    const clean = text.replace(/[R$\s.]/g, '').replace(',', '.');
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
  }

  private normalizePeriodo(text: string): string {
    const match = text.match(/(\d{2})[\/\-](\d{4})/);
    if (match) return `${match[1]}/${match[2]}`;
    const match2 = text.match(/(\d{4})[\/\-](\d{2})/);
    if (match2) return `${match2[2]}/${match2[1]}`;
    return text;
  }

  private normalizeDate(text: string): string {
    const match = text.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (match) return `${match[3]}-${match[2]}-${match[1]}`;
    return text;
  }

  private calcVencimento(periodo: string): string {
    const match = periodo.match(/(\d{2})\/(\d{4})/);
    if (!match) return '';
    const mes = parseInt(match[1]);
    const ano = parseInt(match[2]);
    const proxMes = mes === 12 ? 1 : mes + 1;
    const proxAno = mes === 12 ? ano + 1 : ano;
    return `${proxAno}-${String(proxMes).padStart(2, '0')}-20`;
  }

  private mapTipoTributo(text: string): string {
    const upper = text.toUpperCase();
    if (upper.includes('PIS')) return 'PIS';
    if (upper.includes('COFINS')) return 'COFINS';
    if (upper.includes('IRPJ')) return 'IRPJ';
    if (upper.includes('CSLL')) return 'CSLL';
    if (upper.includes('IPI')) return 'IPI';
    if (upper.includes('INSS') || upper.includes('PREVIDENC')) return 'INSS';
    if (upper.includes('IRRF')) return 'IRRF';
    return text || 'OUTROS';
  }

  private mapTipoCredito(text: string): string {
    const upper = text.toUpperCase();
    if (upper.includes('PIS')) return 'PIS';
    if (upper.includes('COFINS')) return 'COFINS';
    if (upper.includes('IRPJ')) return 'IRPJ';
    if (upper.includes('CSLL')) return 'CSLL';
    if (upper.includes('IPI')) return 'IPI';
    if (upper.includes('INSS')) return 'INSS';
    if (upper.includes('IRRF')) return 'IRRF';
    if (upper.includes('CIDE')) return 'CIDE';
    if (upper.includes('IOF')) return 'IOF';
    return 'OUTROS';
  }

  private mapCategoriaTributo(cat: string): string {
    const upper = cat.toUpperCase();
    if (upper.includes('GERAL') || upper.includes('MENSAL')) return 'IRPJ';
    if (upper.includes('13')) return 'INSS';
    if (upper.includes('ANUAL')) return 'CSLL';
    return 'OUTROS';
  }
}
