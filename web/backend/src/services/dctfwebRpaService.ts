/**
 * RPA do DCTFWeb — scraping do portal e-CAC.
 *
 * Arquitetura (descoberta inspecionando PERDCOMP/ECAC/PÁG.*.html):
 *   • Entry: https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=80000005
 *     ↳ contém <iframe name="frmApp"> que carrega a SPA Angular
 *   • SPA usa Angular (ng-version 16+) + componente <app-root>
 *   • Listagens em <ngx-datatable> com <datatable-header-cell title="..."> +
 *     <datatable-body-row> com <datatable-body-cell>
 *   • Loading: componente <br-loading> e seu .backdrop (mesmo padrão do PER/DCOMP)
 *
 * Estratégia defensiva:
 *   • Múltiplos seletores fallback para iframe/tabela
 *   • Identificação de colunas por substring do header (não por índice)
 *   • Log de HTML em caso de falha para ajustar seletores depois
 *   • Tolerância a layouts pre-Angular (alguns submenus do e-CAC ainda usam ASP.NET)
 *
 * Para o pipeline funcionar, este serviço REUSA a Page já autenticada que vem
 * de `EcacService.prepararSessaoAutenticada()`. Não inicializa browser próprio.
 */
import type { Page, Frame } from 'playwright';
import { log } from '../utils/logger';
import { normalizarCategoria, normalizarSituacao, normalizarTipo } from './dctfwebRegrasService';

export const DCTFWEB_ENTRY_URL = 'https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=80000005&origem=menu';

export interface DctfwebDeclaracaoBruta {
  numero_recibo: string | null;
  periodo_apuracao: string;
  /** Texto bruto vindo do e-CAC */
  categoria_bruto: string;
  /** Enum normalizado conforme manual cap. 8.1 */
  categoria: string;
  tipo_bruto: string;
  /** Enum normalizado conforme manual cap. 8.3 */
  tipo: 'ORIGINAL' | 'RETIFICADORA' | 'EXCLUSAO';
  /** Texto bruto da situação no e-CAC */
  situacao: string;
  /** Enum normalizado conforme manual cap. 8.4 */
  situacao_normalizada: string;
  debito_apurado: number;
  credito_vinculado: number;
  saldo_pagar: number;
  data_transmissao: string | null;
  data_recepcao: string | null;
}

export interface DctfwebDarfBruto {
  codigo_receita: string;
  denominacao: string | null;
  periodo_apuracao: string;
  vencimento: string;
  principal: number;
  multa: number;
  juros: number;
  total: number;
  numero_documento: string | null;
  codigo_barras: string | null;
}

export interface DctfwebRpaResult<T> {
  success: boolean;
  data: T[];
  errors: string[];
  sessaoExpirada?: boolean;
}

function parseValor(s: string | null | undefined): number {
  if (!s) return 0;
  // Aceita "1.234,56" (pt-BR) e "1234.56" (en)
  const clean = String(s).replace(/[^\d,.-]/g, '').trim();
  if (!clean) return 0;
  // Heurística: se tem vírgula como último separador decimal
  if (clean.includes(',') && clean.lastIndexOf(',') > clean.lastIndexOf('.')) {
    return parseFloat(clean.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(clean.replace(/,/g, '')) || 0;
}

function parseData(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  const br = t.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function normalizarPeriodo(s: string | null | undefined): string {
  if (!s) return '';
  const t = s.trim();
  // "06/2026" → "06/2026" (mantém)
  const m1 = t.match(/^(\d{2})\/(\d{4})/);
  if (m1) return `${m1[1]}/${m1[2]}`;
  // "2026-06" → "06/2026"
  const m2 = t.match(/^(\d{4})-(\d{2})/);
  if (m2) return `${m2[2]}/${m2[1]}`;
  return t;
}

export class DctfwebRpaService {
  private page: Page | null = null;
  private onProgress?: (msg: string) => void;
  private static _htmlLogged = false;

  constructor(onProgress?: (msg: string) => void) {
    this.onProgress = onProgress;
  }

  /**
   * Recebe a Page autenticada vinda do EcacService.prepararSessaoAutenticada().
   * É a única forma suportada — não inicializa browser próprio.
   */
  usarPaginaAutenticada(page: Page): void {
    this.page = page;
  }

  private progress(msg: string) {
    log.info(`[dctfweb-rpa] ${msg}`);
    this.onProgress?.(msg);
  }

  /**
   * Acessa o app DCTFWeb dentro do iframe `frmApp`. Retorna o Frame (API direta)
   * em vez de FrameLocator — permite chamar `frame.evaluate()` diretamente sem
   * passar por `locator('body')` (que mantém um timeout interno de 60s e gera
   * o erro "locator.evaluate: Timeout 60000ms exceeded" quando o body do iframe
   * ainda está vazio).
   */
  private async abrirAppNoIframe(): Promise<Frame> {
    if (!this.page) throw new Error('Page não inicializada — chame usarPaginaAutenticada()');
    if (this.page.isClosed()) {
      const err: any = new Error('Página do e-CAC foi fechada antes da navegação (sessão pode ter expirado ou portal fechou a aba).');
      err.sessaoExpirada = true;
      throw err;
    }

    this.progress('Navegando para DCTFWeb…');
    try {
      await this.page.goto(DCTFWEB_ENTRY_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    } catch (e: any) {
      // ERR_TIMED_OUT / ERR_CONNECTION_REFUSED / DNS = portal Receita inalcançável.
      // Não é bug do app — pode ser firewall corporativo, DNS, ou e-CAC em manutenção.
      // Encurtamos o timeout (30s vs 90s) e devolvemos erro CLARO para a UI sinalizar.
      const msg = e.message || '';
      if (/ERR_TIMED_OUT|ERR_CONNECTION|ERR_NAME_NOT_RESOLVED|ECONNREFUSED|ENOTFOUND/.test(msg)) {
        const err: any = new Error(`Portal e-CAC inalcançável (${msg.match(/net::([A-Z_]+)/)?.[1] || 'rede'}). Verifique conectividade/firewall/DNS para cav.receita.fazenda.gov.br.`);
        err.networkError = true;
        throw err;
      }
      throw e;
    }
    log.info(`[dctfweb-rpa] URL após goto: ${this.page.url()}`);
    await new Promise(r => setTimeout(r, 2000));

    const url = this.page.url().toLowerCase();
    if (url.includes('autenticacao') || url.includes('login') || url.includes('sso.acesso.gov.br')) {
      const err: any = new Error('Sessão e-CAC expirada ao abrir DCTFWeb');
      err.sessaoExpirada = true;
      throw err;
    }

    // Aguarda iframe presente (até 15s)
    let frameHandle: any = null;
    try {
      frameHandle = await this.page.waitForSelector('iframe[name="frmApp"], iframe[id="frmApp"], iframe[src*="dctfweb"], iframe', { timeout: 15_000 });
      log.info('[dctfweb-rpa] iframe encontrado');
    } catch {
      log.warn('[dctfweb-rpa] iframe frmApp não encontrado em 15s');
    }

    // API Frame direta: faz chamadas de JS sem usar locator (que cobra 60s extra de timeout)
    const frames = this.page.frames();
    log.info(`[dctfweb-rpa] page tem ${frames.length} frame(s): ${frames.map(f => f.name() || '(no-name)').join(', ')}`);

    let frame: Frame | null = null;
    if (frameHandle) {
      frame = await frameHandle.contentFrame();
    }
    if (!frame) {
      // fallback por nome
      frame = this.page.frame({ name: 'frmApp' });
    }
    if (!frame) {
      // fallback: pega o frame mais "rico" (que não é o main)
      frame = frames.find(f => f !== this.page!.mainFrame() && f.url() && !f.url().endsWith('about:blank')) || null;
    }
    if (!frame) {
      log.warn('[dctfweb-rpa] nenhum frame interno detectado — usando o mainFrame (pode ser uma tela sem iframe)');
      frame = this.page.mainFrame();
    }
    log.info(`[dctfweb-rpa] frame ativo: name=${frame.name() || '(no-name)'} url=${frame.url()}`);

    // Espera o body do frame existir antes de continuar (rápido — só 5s)
    try {
      await frame.waitForLoadState('domcontentloaded', { timeout: 10_000 });
    } catch {
      log.warn('[dctfweb-rpa] frame.waitForLoadState(domcontentloaded) timeout — prosseguindo');
    }

    // Aguarda componentes Angular OU tabela presente (até 30s) — não é mais um locator de body
    try {
      await frame.waitForSelector('app-root, ngx-datatable, datatable-body-row, table, .br-table', { timeout: 30_000 });
      log.info('[dctfweb-rpa] componente Angular/tabela detectado no frame');
    } catch {
      log.warn('[dctfweb-rpa] componentes Angular/tabela não visíveis em 30s — vou tentar parsear assim mesmo');
    }

    await this.waitForLoadingInFrame(frame);
    return frame;
  }

  /** Espera o <br-loading> dentro do frame terminar. */
  private async waitForLoadingInFrame(frame: Frame): Promise<void> {
    try {
      await frame.waitForSelector('br-loading', { state: 'hidden', timeout: 20_000 });
    } catch { /* spinner pode nem aparecer */ }
    try {
      await frame.waitForSelector('br-loading .backdrop', { state: 'hidden', timeout: 5_000 });
    } catch { /* ok */ }
    await new Promise(r => setTimeout(r, 400));
  }

  /**
   * Clica no botão "Consultar" do filtro, se existir.
   */
  private async clicarConsultarSeExistir(frame: Frame): Promise<void> {
    try {
      const clicado = await frame.evaluate(() => {
        const btns = Array.from(document.querySelectorAll<HTMLElement>('button, input[type="button"], input[type="submit"], a.btn'));
        const btn = btns.find(b => /^\s*Consultar\s*$/i.test(b.textContent || '') || (b as HTMLInputElement).value === 'Consultar');
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (clicado) {
        this.progress('Clicou em Consultar');
        await this.waitForLoadingInFrame(frame);
        await new Promise(r => setTimeout(r, 1500));
      }
    } catch (e: any) {
      log.warn(`[dctfweb-rpa] clicarConsultar falhou: ${e.message}`);
    }
  }

  /**
   * Parser defensivo da tabela dentro do frame.
   * Usa `frame.evaluate()` direto (sem locator) — chamada bruta em JS dentro do
   * contexto do frame, com timeout default 30s (e não 60 do locator).
   */
  private async parseTabelaNoIframe(frame: Frame): Promise<Record<string, string>[]> {
    if (!this.page) return [];

    const tableData = await frame.evaluate(() => {
      // 1) ngx-datatable (e-CAC moderno, Angular)
      const ngxRows = document.querySelectorAll('datatable-body-row');
      if (ngxRows.length > 0) {
        const headerCells = document.querySelectorAll('datatable-header-cell');
        const headers = Array.from(headerCells).map(h => {
          // Preferimos o atributo title="..." (estável); fallback para textContent
          const title = h.getAttribute('title');
          return (title || h.textContent || '').trim().toLowerCase();
        });
        return Array.from(ngxRows).map(row => {
          const cells = row.querySelectorAll('datatable-body-cell');
          const values = Array.from(cells).map(c => (c.textContent || '').trim());
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = values[i] || ''; });
          return obj;
        });
      }

      // 2) tabela HTML padrão (algumas sub-telas DCTFWeb ainda usam ASP.NET)
      const tables = document.querySelectorAll('table');
      for (const table of Array.from(tables)) {
        const headerRow = table.querySelector('thead tr, tr:first-child');
        if (!headerRow) continue;
        const headers = Array.from(headerRow.querySelectorAll('th, td'))
          .map(h => (h.textContent || '').trim().toLowerCase());
        // Filtra tabelas que claramente são da DCTFWeb (algum cabeçalho conhecido)
        const isDctfTable = headers.some(h =>
          h.includes('per') || h.includes('apur') || h.includes('categoria') ||
          h.includes('situa') || h.includes('saldo') || h.includes('receita') ||
          h.includes('vencimento') || h.includes('recibo')
        );
        if (!isDctfTable) continue;

        const bodyRows = table.querySelectorAll('tbody tr, tr:not(:first-child)');
        return Array.from(bodyRows).map(row => {
          const cells = row.querySelectorAll('td');
          const values = Array.from(cells).map(c => (c.textContent || '').trim());
          const obj: Record<string, string> = {};
          headers.forEach((h, i) => { obj[h] = values[i] || ''; });
          return obj;
        }).filter(r => Object.values(r).some(v => v));
      }

      return [] as Record<string, string>[];
    });

    if (!tableData || tableData.length === 0) {
      if (!DctfwebRpaService._htmlLogged) {
        DctfwebRpaService._htmlLogged = true;
        try {
          // frame.evaluate é uma chamada bruta — sem locator timeout
          const html = await frame.evaluate(() => document.body?.innerHTML.slice(0, 4000) || '');
          log.warn(`[dctfweb-rpa] Tabela vazia — amostra do HTML (4KB): ${html.replace(/\s+/g, ' ').slice(0, 2000)}`);
        } catch { /* ignore */ }
      }
      return [];
    }
    log.info(`[dctfweb-rpa] Tabela: ${tableData.length} linha(s). Headers: ${Object.keys(tableData[0]).join(' | ')}`);
    return tableData;
  }

  /**
   * Identifica colunas por padrões de substring no header.
   * Aceita variações como "Período", "Período Apuração", "Per. Apuração".
   */
  private mapearColunas<K extends string>(
    row: Record<string, string>,
    mapa: Record<K, string[]>,
  ): Record<K, string> {
    const headers = Object.keys(row);
    const find = (patterns: string[]) => {
      const key = headers.find(h => patterns.some(p => h.includes(p.toLowerCase())));
      return key ? row[key] : '';
    };
    const out = {} as Record<K, string>;
    for (const [k, patterns] of Object.entries(mapa) as [K, string[]][]) {
      out[k] = find(patterns);
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONSULTAR DECLARAÇÕES
  // ──────────────────────────────────────────────────────────────────────────
  async consultarDeclaracoes(): Promise<DctfwebRpaResult<DctfwebDeclaracaoBruta>> {
    try {
      const frame = await this.abrirAppNoIframe();
      // Em DCTFWeb a primeira tela costuma ser a listagem (sem clicar nada).
      // Algumas variantes exigem clicar em "Consultar Créditos e Débitos" antes.
      try {
        const clicado = await frame.evaluate(() => {
          const candidatos = Array.from(document.querySelectorAll<HTMLElement>('a, button'));
          const el = candidatos.find(c => /consultar cr[ée]ditos e d[ée]bitos/i.test(c.textContent || ''));
          if (el) { el.click(); return true; }
          return false;
        });
        if (clicado) await this.waitForLoadingInFrame(frame);
      } catch { /* ignore */ }

      await this.clicarConsultarSeExistir(frame);
      const rows = await this.parseTabelaNoIframe(frame);
      if (rows.length === 0) {
        return { success: true, data: [], errors: ['Tabela DCTFWeb vazia (sem declarações ou seletor mudou)'] };
      }

      const data: DctfwebDeclaracaoBruta[] = rows.map(r => {
        const m = this.mapearColunas(r, {
          periodo:         ['período', 'periodo', 'per. apur', 'per apur'],
          categoria:       ['categoria', 'cat.'],
          tipo:            ['tipo'],
          situacao:        ['situa'],
          debito:          ['débito', 'debito'],
          credito:         ['crédito', 'credito vinc'],
          saldo:           ['saldo', 'a pagar'],
          recibo:          ['recibo', 'nº recibo', 'numero recibo'],
          dataTransmissao: ['transmiss', 'transmit'],
          dataRecepcao:    ['recep'],
        });
        // Normaliza textos brutos do e-CAC para os enums oficiais do manual.
        // Mantemos o texto bruto também (categoria_bruto, tipo_bruto) para auditoria.
        return {
          numero_recibo: m.recibo || null,
          periodo_apuracao: normalizarPeriodo(m.periodo),
          categoria_bruto: m.categoria || '',
          categoria: normalizarCategoria(m.categoria),                       // GERAL/DECIMO_TERCEIRO/...
          tipo_bruto: m.tipo || '',
          tipo: normalizarTipo(m.tipo),                                      // ORIGINAL/RETIFICADORA/EXCLUSAO
          situacao: m.situacao || '',
          situacao_normalizada: normalizarSituacao(m.situacao),              // EM_ANDAMENTO/ATIVA/...
          debito_apurado: parseValor(m.debito),
          credito_vinculado: parseValor(m.credito),
          saldo_pagar: parseValor(m.saldo),
          data_transmissao: parseData(m.dataTransmissao),
          data_recepcao: parseData(m.dataRecepcao),
        };
      }).filter(d => d.periodo_apuracao); // descarta linhas sem período (linhas de subtotal/rodapé)

      this.progress(`Coletadas ${data.length} declaração(ões)`);
      return { success: true, data, errors: [] };
    } catch (e: any) {
      log.error(`[dctfweb-rpa.consultarDeclaracoes] ${e.message}`);
      return { success: false, data: [], errors: [e.message], sessaoExpirada: !!e.sessaoExpirada };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CONSULTAR DARFs
  // ──────────────────────────────────────────────────────────────────────────
  async consultarDarfs(): Promise<DctfwebRpaResult<DctfwebDarfBruto>> {
    try {
      const frame = await this.abrirAppNoIframe();
      // Tenta abrir a sub-tela "Emissão de DARF" / "Emitir DARF" / "DARF"
      try {
        const clicado = await frame.evaluate(() => {
          const els = Array.from(document.querySelectorAll<HTMLElement>('a, button'));
          const el = els.find(e => /emiss[aã]o de darf|emitir darf|^darf\s*$/i.test(e.textContent || ''));
          if (el) { el.click(); return true; }
          return false;
        });
        if (clicado) await this.waitForLoadingInFrame(frame);
      } catch { /* tenta sem clicar */ }
      await this.clicarConsultarSeExistir(frame);
      const rows = await this.parseTabelaNoIframe(frame);
      if (rows.length === 0) {
        return { success: true, data: [], errors: ['Nenhum DARF encontrado ou tela não carregou'] };
      }
      const data: DctfwebDarfBruto[] = rows.map(r => {
        const m = this.mapearColunas(r, {
          codigo:      ['código', 'codigo', 'receita'],
          denominacao: ['denominação', 'denominacao', 'descrição', 'descricao'],
          periodo:     ['período', 'periodo', 'per. apur'],
          vencimento:  ['vencimento', 'venc.'],
          principal:   ['principal', 'valor principal'],
          multa:       ['multa'],
          juros:       ['juros'],
          total:       ['total', 'valor total'],
          numero:      ['número', 'numero do', 'nº documento'],
          barras:      ['barra', 'código de barras'],
        });
        const principal = parseValor(m.principal);
        const multa = parseValor(m.multa);
        const juros = parseValor(m.juros);
        const total = parseValor(m.total) || principal + multa + juros;
        return {
          codigo_receita: m.codigo,
          denominacao: m.denominacao || null,
          periodo_apuracao: normalizarPeriodo(m.periodo),
          vencimento: parseData(m.vencimento) || new Date().toISOString().slice(0, 10),
          principal, multa, juros, total,
          numero_documento: m.numero || null,
          codigo_barras: m.barras || null,
        };
      }).filter(d => d.codigo_receita);
      this.progress(`Coletados ${data.length} DARF(s)`);
      return { success: true, data, errors: [] };
    } catch (e: any) {
      log.error(`[dctfweb-rpa.consultarDarfs] ${e.message}`);
      return { success: false, data: [], errors: [e.message], sessaoExpirada: !!e.sessaoExpirada };
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // BAIXAR RECIBOS (PDF)
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Para cada número de recibo, navega na linha correspondente e captura o PDF
   * gerado quando o usuário clica em "Visualizar Recibo".
   *
   * Estratégia: intercepta o response PDF via page.waitForEvent('response').
   * Funciona para o padrão de e-CAC que abre o PDF inline (Content-Type:
   * application/pdf).
   */
  async baixarRecibos(numeros: string[]): Promise<Map<string, Buffer>> {
    const out = new Map<string, Buffer>();
    if (!this.page || numeros.length === 0) return out;
    try {
      const frame = await this.abrirAppNoIframe();
      for (const numero of numeros) {
        try {
          // Clica no botão "Recibo" da linha que contém esse número
          const clicado = await frame.evaluate((num: string) => {
            const linhas = Array.from(document.querySelectorAll<HTMLElement>('datatable-body-row, tr'));
            const linha = linhas.find(l => l.textContent?.includes(num));
            if (!linha) return false;
            const btn = linha.querySelector<HTMLElement>('button, a, [title*="Recibo" i]');
            if (!btn) return false;
            const candidato = Array.from(linha.querySelectorAll<HTMLElement>('button, a'))
              .find(b => /recibo|pdf/i.test(b.textContent || '') || /recibo/i.test(b.getAttribute('title') || ''));
            (candidato || btn).click();
            return true;
          }, numero);
          if (!clicado) continue;

          // O clique já aconteceu dentro do frame.evaluate acima; só aguardamos o PDF
          const pdfPromise = this.page.waitForResponse(
            (r) => r.headers()['content-type']?.includes('application/pdf') === true,
            { timeout: 20_000 },
          ).catch(() => null);
          const resp = await pdfPromise;
          if (resp) {
            out.set(numero, await resp.body());
            this.progress(`Recibo ${numero} baixado`);
          }
          await this.waitForLoadingInFrame(frame);
        } catch (e: any) {
          log.warn(`[dctfweb-rpa.baixarRecibos] ${numero}: ${e.message}`);
        }
      }
    } catch (e: any) {
      log.error(`[dctfweb-rpa.baixarRecibos] fatal: ${e.message}`);
    }
    return out;
  }
}
