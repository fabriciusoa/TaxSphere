/**
 * Parser do recibo PDF do PER/DCOMP (Receita Federal / SERPRO).
 *
 * Suporta dois formatos:
 *
 * 1) Recibo curto (Pedido de Restituição) — ex.: "recibo-perdcomp (17).pdf"
 *    Contém: número do PER/DCOMP, número do PER/DCOMP com Demonstrativo do Crédito,
 *    valor do pedido, data de transmissão, dados do representante.
 *
 * 2) Recibo completo (Declaração de Compensação) — ex.: "383665332216081913028350.pdf"
 *    Contém todos os dados acima + valor do saldo negativo, SELIC acumulada,
 *    crédito atualizado, total de débitos compensados e detalhamento dos débitos.
 *
 * As regex são tolerantes a quebras de linha e espaços extras pois o texto extraído
 * pelo pdf-parse mantém a ordem, mas pode quebrar em colunas inesperadas.
 */

import { PDFParse } from 'pdf-parse';
import { log } from '../utils/logger';

export interface ReciboDebitoCompensado {
  ordem: number;
  cnpj_detentor: string | null;
  codigo_receita: string | null;
  denominacao_receita: string | null;
  grupo_tributo: string | null;
  periodicidade: string | null;
  periodo_apuracao: string | null;
  data_vencimento: string | null; // ISO yyyy-mm-dd
  principal: number;
  multa: number;
  juros: number;
  total: number;
  controlado_em_processo: boolean;
}

export interface ReciboData {
  // Identificação
  numero_perdcomp: string | null;
  numero_recibo: string | null;
  numero_perdcomp_inicial: string | null; // "Nº do PER/DCOMP Inicial" ou "PER/DCOMP com Demonstrativo do Crédito"
  tipo_documento: string | null; // "Original" / "Retificador"
  tipo_credito: string | null;
  data_transmissao: string | null;
  oriundo_acao_judicial: boolean | null;

  // Períodos / forma
  exercicio: string | null;
  periodo_inicial: string | null;
  periodo_final: string | null;
  forma_apuracao: string | null;
  forma_tributacao: string | null;
  periodo_apuracao: string | null;

  // Financeiro
  valor_pedido: number | null;
  valor_saldo_negativo: number | null;
  selic_acumulada: number | null;
  credito_atualizado: number | null;
  credito_original_data_entrega: number | null;
  saldo_credito_original: number | null;
  credito_original_utilizado: number | null;
  total_debitos_dcomp: number | null;

  // Empresa / responsável
  cnpj: string | null;
  nome_empresarial: string | null;
  responsavel_nome: string | null;
  responsavel_cpf: string | null;

  // Débitos compensados (apenas no recibo completo)
  debitos: ReciboDebitoCompensado[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const stripAccents = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Converte string monetária BR ("589.754,17" ou "1.234.567,89") em number.
 */
function parseMoney(s: string | null | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converte percentual BR ("10,84%") em number (10.84).
 */
function parsePercent(s: string | null | undefined): number | null {
  if (s == null) return null;
  const cleaned = s.replace(/\s/g, '').replace('%', '').replace(/\./g, '').replace(',', '.');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Converte "16/09/2025" em "2025-09-16".
 */
function parseDateBR(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function findValue(text: string, label: string | RegExp, options?: { multiline?: boolean }): string | null {
  // Build a tolerant regex matching the label optionally followed by ":" then the value
  const labelPattern = typeof label === 'string'
    ? label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
    : label.source;
  const re = options?.multiline
    ? new RegExp(`${labelPattern}\\s*:?\\s*([\\s\\S]*?)(?:\\n[A-ZÁÉÍÓÚÂÊÔÇÃÕ][^\\n]*?\\n|$)`, 'i')
    : new RegExp(`${labelPattern}\\s*:?\\s*([^\\n]+)`, 'i');
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

function parseSimNao(s: string | null): boolean | null {
  if (!s) return null;
  const v = stripAccents(s.trim().toLowerCase());
  if (v === 'sim') return true;
  if (v === 'nao') return false;
  return null;
}

/**
 * Detecta se o recibo é o "curto" (apenas pedido de restituição)
 * ou o "completo" (com débitos detalhados — formato legado).
 */
function isReciboCompleto(text: string): boolean {
  return /CR[ÉE]DITO\s+SALDO\s+NEGATIVO|001\.\s*D[ée]bito|Total\s+dos\s+d[ée]bitos\s+desta\s+DCOMP/i.test(text);
}

/**
 * Detecta se é uma Declaração de Compensação no formato SIMPLIFICADO (PERDCOMP Web v8.00+).
 * Esse formato tem "DADOS DOS DÉBITOS COMPENSADOS" com tabela compacta
 * "<TRIBUTO> <VALOR>" em vez do detalhamento bloco-a-bloco.
 */
function isDcompSimplificado(text: string): boolean {
  return /RECIBO\s+DE\s+ENTREGA\s+DA\s+DECLARA[ÇC][ÃA]O\s+DE\s+COMPENSA[ÇC][ÃA]O/i.test(text)
    && /DADOS\s+DOS\s+D[ÉE]BITOS\s+COMPENSADOS/i.test(text);
}

// ── Parser do recibo curto (Pedido de Restituição) ───────────────────────────

function parseReciboCurto(text: string): Partial<ReciboData> {
  const data: Partial<ReciboData> = {};

  data.cnpj = findValue(text, 'CNPJ');
  data.nome_empresarial = findValue(text, /Nome\s+Empresarial/i);
  data.tipo_documento = findValue(text, /Tipo\s+de\s+Documento/i);
  data.numero_recibo = findValue(text, /N[úu]mero\s+de\s+Controle/i);
  data.numero_perdcomp = findValue(text, /N[úu]mero\s+do\s+Documento/i);
  data.numero_perdcomp_inicial = findValue(text, /N[úu]mero\s+do\s+PER\/DCOMP\s+com\s+Demonstrativo\s+do\s+Cr[ée]dito/i);
  data.tipo_credito = findValue(text, /Tipo\s+de\s+Cr[ée]dito/i);
  data.oriundo_acao_judicial = parseSimNao(findValue(text, /Oriundo\s+de\s+A[çc][ãa]o\s+Judicial/i));

  const dt = findValue(text, /Data\s+de\s+Transmiss[ãa]o/i);
  data.data_transmissao = parseDateBR(dt);

  const valorPedido = findValue(text, /Valor\s+do\s+Pedido/i);
  data.valor_pedido = parseMoney(valorPedido);

  data.responsavel_nome = findValue(text, /^Nome\s*$/m) || findValue(text, /DADOS\s+DO\s+REPRESENTANTE[\s\S]*?Nome\s*:?\s*([^\n]+)/i);
  // CPF do representante (depois de DADOS DO REPRESENTANTE)
  const repBlock = text.match(/DADOS\s+DO\s+REPRESENTANTE[\s\S]*$/i)?.[0] || text;
  const cpfMatch = repBlock.match(/CPF\s*:?\s*([\d.\-]+)/i);
  if (cpfMatch) data.responsavel_cpf = cpfMatch[1].trim();
  const repNomeMatch = repBlock.match(/Nome\s*:?\s*([^\n]+?)\s*\n/i);
  if (repNomeMatch && !data.responsavel_nome) data.responsavel_nome = repNomeMatch[1].trim();

  return data;
}

// ── Parser do DCOMP SIMPLIFICADO (PERDCOMP Web v8.00+) ───────────────────────
//
// Esse formato é uma DCOMP minimalista: tem os mesmos dados básicos da
// restituição + tabela compacta "TRIBUTO VALOR" para os débitos compensados.

function parseDebitosSimplificado(text: string): ReciboDebitoCompensado[] {
  const debitos: ReciboDebitoCompensado[] = [];

  // Localiza o bloco "DADOS DOS DÉBITOS COMPENSADOS" até a próxima seção
  // (Fica o contribuinte... / DADOS DO REPRESENTANTE / fim).
  // Algumas versões têm valores ANTES do título; capturamos um buffer maior
  // ao redor do título e filtramos linhas.
  const startIdx = text.search(/DADOS\s+DOS\s+D[ÉE]BITOS\s+COMPENSADOS/i);
  if (startIdx < 0) return debitos;
  const endRe = /(Fica\s+o\s+contribuinte|DADOS\s+DO\s+REPRESENTANTE|O\s+contribuinte\s+pode\s+acompanhar)/i;
  const endMatch = text.slice(startIdx).search(endRe);
  const slice = endMatch > 0 ? text.slice(startIdx, startIdx + endMatch) : text.slice(startIdx);

  // Como o pdf-parse às vezes coloca os valores ANTES dos títulos (problema de
  // ordem de extração quando o PDF tem tabelas), também olhamos para alguns
  // valores próximos do início do PDF (cabeçalho).
  const headerLines = text.slice(0, Math.min(800, startIdx)).split('\n').map(l => l.trim()).filter(Boolean);

  // Combina ambos blocos
  const allLines = [
    ...slice.split('\n').map(l => l.trim()).filter(Boolean),
    ...headerLines,
  ];

  // Padrões para linhas de débito: "TRIBUTO VALOR" ou "VALOR TRIBUTO"
  // Tributos típicos: COFINS, PIS/PASEP, IRPJ, CSLL, INSS, IRRF, IPI, etc.
  // A regex aceita nomes em maiúsculas, podem ter espaços ou barras.
  const tributoRe = /^([A-Z][A-Z0-9\/\-\s]{1,40}?)\s+([\d.]+,\d{2})$/;
  const tributoReReverso = /^([\d.]+,\d{2})\s+([A-Z][A-Z0-9\/\-\s]{1,40})$/;

  // Linhas a ignorar (cabeçalhos / rodapés)
  const skipRe = /^(VALOR|DADOS|FICA|CNPJ|Nome|CPF|Tipo|Data|N[úu]mero|inclusive|O\s+contribuinte|MINIST|SECRETARIA|PER\/DCOMP|RECIBO|VERS|Documento|Internet|Receptor|em\s+\d|\d+\.\d+\.\d+|Telefone|Celular|Correio)/i;

  let ordem = 0;
  const seen = new Set<string>();

  for (const line of allLines) {
    if (skipRe.test(line)) continue;
    if (line.length < 3 || line.length > 80) continue;

    let tributo: string | null = null;
    let valor: number | null = null;

    const m1 = line.match(tributoRe);
    if (m1) {
      tributo = m1[1].trim();
      valor = parseMoney(m1[2]);
    } else {
      const m2 = line.match(tributoReReverso);
      if (m2) {
        valor = parseMoney(m2[1]);
        tributo = m2[2].trim();
      }
    }

    if (!tributo || valor == null || valor === 0) continue;
    // Filtra linhas que parecem ser cabeçalhos ou totais
    if (/^(TOTAL|VALOR|SALDO|CR[ÉE]DITO|D[ÉE]BITO)$/i.test(tributo)) continue;
    // Filtra tributo muito curto ou que seja só números
    if (tributo.length < 2 || /^\d+$/.test(tributo.replace(/\s/g, ''))) continue;
    // Dedup
    const key = `${tributo}|${valor}`;
    if (seen.has(key)) continue;
    seen.add(key);

    ordem++;
    debitos.push({
      ordem,
      cnpj_detentor: null,
      codigo_receita: null,
      denominacao_receita: tributo,
      grupo_tributo: tributo,
      periodicidade: null,
      periodo_apuracao: null,
      data_vencimento: null,
      principal: valor,
      multa: 0,
      juros: 0,
      total: valor,
      controlado_em_processo: false,
    });
  }

  return debitos;
}

function parseDcompSimplificado(text: string): Partial<ReciboData> {
  // Reusa a maior parte do parser "curto" (mesmos campos de identificação)
  const data = parseReciboCurto(text);

  // Sobrescreve número do PER/DCOMP (na DCOMP é "Número da Declaração", não "Número do Documento")
  const numDecl = findValue(text, /N[úu]mero\s+da\s+Declara[çc][ãa]o/i);
  if (numDecl) data.numero_perdcomp = numDecl;

  // Valor Utilizado nesta Declaração de Compensação = total de créditos usados
  const valorUtilizado = findValue(text, /Valor\s+Utilizado\s+nesta\s+Declara[çc][ãa]o\s+de\s+Compensa[çc][ãa]o/i);
  data.credito_original_utilizado = parseMoney(valorUtilizado);

  // Extrai débitos compensados no formato simplificado
  data.debitos = parseDebitosSimplificado(text);

  // Total de débitos = soma dos débitos compensados
  if (data.debitos.length > 0) {
    data.total_debitos_dcomp = data.debitos.reduce((sum, d) => sum + d.total, 0);
  }

  return data;
}

// ── Parser do recibo completo (Declaração de Compensação — formato legado) ───

function parseReciboCompleto(text: string): Partial<ReciboData> {
  const data: Partial<ReciboData> = {};

  // Cabeçalho — número aparece no topo: "CNPJ XX.XXX.XXX/XXXX-XX  NN.NNN.NNN.NNN.NN.N.NN-NNNN"
  const headerMatch = text.match(/CNPJ\s+([\d./-]+)\s+(\d{5}\.\d{5}\.\d{6}\.\d\.\d\.\d{2}-\d{4})/);
  if (headerMatch) {
    data.cnpj = headerMatch[1];
    data.numero_perdcomp = headerMatch[2];
  }

  data.nome_empresarial = findValue(text, /Nome\s+Empresarial/i);
  data.tipo_documento = findValue(text, /Tipo\s+de\s+Documento/i);
  data.tipo_credito = findValue(text, /Tipo\s+de\s+Cr[ée]dito/i);
  data.numero_perdcomp_inicial = findValue(text, /N[ºo]\s+do\s+PER\/DCOMP\s+Inicial/i);
  data.oriundo_acao_judicial = parseSimNao(findValue(text, /Cr[ée]dito\s+Oriundo\s+de\s+A[çc][ãa]o\s+Judicial/i));

  const dataTx = findValue(text, /Data\s+de\s+Transmiss[ãa]o/i);
  data.data_transmissao = parseDateBR(dataTx);

  data.forma_tributacao = findValue(text, /Forma\s+de\s+Tributa[çc][ãa]o\s+do\s+Lucro/i);
  data.forma_apuracao = findValue(text, /Forma\s+de\s+Apura[çc][ãa]o/i);
  data.exercicio = findValue(text, /Exerc[íi]cio/i);
  data.periodo_inicial = parseDateBR(findValue(text, /Data\s+Inicial\s+do\s+Per[íi]odo/i));
  data.periodo_final = parseDateBR(findValue(text, /Data\s+Final\s+do\s+Per[íi]odo/i));

  data.valor_saldo_negativo = parseMoney(findValue(text, /Valor\s+do\s+Saldo\s+Negativo/i));
  data.selic_acumulada = parsePercent(findValue(text, /Selic\s+Acumulada/i));
  data.credito_atualizado = parseMoney(findValue(text, /Cr[ée]dito\s+Atualizado/i));
  data.saldo_credito_original = parseMoney(findValue(text, /Saldo\s+do\s+Cr[ée]dito\s+Original/i));
  data.credito_original_utilizado = parseMoney(findValue(text, /Total\s+do\s+Cr[ée]dito\s+Original\s+Utilizado\s+nesta\s+DCOMP/i));

  // "Total dos débitos desta DCOMP" — label appears on its own line, value is orphaned a few lines below.
  // Pattern in PDF: label line ... [other labels with values] ... bare value line "X.XXX,XX"
  const totalDebitosMatch = text.match(/Total\s+dos\s+d[ée]bitos\s+desta\s+DCOMP[\s\S]{0,300}?\n([\d.]+,\d{2})\s*\n/i);
  data.total_debitos_dcomp = parseMoney(totalDebitosMatch?.[1]);

  // "Crédito Original na Data da Entrega" — value comes BEFORE the label, e.g. "426.097,18\tCrédito Original na Data da Entrega"
  const credOrigEntrega = text.match(/([\d.]+,\d{2})\s*[\t ]*Cr[ée]dito\s+Original\s+na\s+Data\s+da\s+Entrega/i);
  data.credito_original_data_entrega = parseMoney(credOrigEntrega?.[1]);

  // Responsável pelo preenchimento
  const respBlock = text.match(/Dados\s+do\s+Respons[áa]vel\s+pelo\s+Preenchimento[\s\S]*?(?:\n\n|$)/i)?.[0] || '';
  const respNome = respBlock.match(/Nome\s+([^\n]+?)\s*\n/i);
  if (respNome) data.responsavel_nome = respNome[1].trim();
  const respCpf = respBlock.match(/CPF\s+([\d.\-]+)/i);
  if (respCpf) data.responsavel_cpf = respCpf[1].trim();

  // Débitos compensados — extrair blocos numerados "001. Débito XXX", "002. Débito YYY", etc.
  data.debitos = parseDebitosCompensados(text);

  return data;
}

function parseDebitosCompensados(rawText: string): ReciboDebitoCompensado[] {
  const debitos: ReciboDebitoCompensado[] = [];

  // Strip recurring page headers that may split débito blocks across page boundaries
  // (e.g. "Secretaria da Receita Federal... PERDCOMP 8.0\nCNPJ XX.XXX/XXXX-XX NN....NN-NNNN\n4\n\n-- 4 of 5 --")
  const text = rawText
    .replace(/Secretaria\s+da\s+Receita\s+Federal\s+do\s+Brasil[\s\S]*?PERDCOMP\s+\d+\.\d+\s*\n/gi, '')
    .replace(/CNPJ\s+[\d./-]+\s+\d{5}\.\d{5}\.\d{6}\.\d\.\d\.\d{2}-\d{4}\s*\n/g, '')
    .replace(/\n\s*\d+\s*\n\n--\s*\d+\s+of\s+\d+\s*--\s*\n/g, '\n');

  // Cada débito começa com "NNN. Débito <Tributo>" e termina antes do próximo bloco numerado ou de "TOTAL"
  // ou de fim do texto. Usamos lookahead com \n+\d{3}\. para tolerar quebras de linha extras.
  const pattern = /(\d{3})\.\s*D[ée]bito\s+([^\n]+?)\n([\s\S]*?)(?=\n+\d{3}\.\s*D[ée]bito|\n+TOTAL\b|\n*$)/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const ordem = Number(match[1]);
    const tributoNome = match[2].trim();
    const block = match[3];

    const cnpj = block.match(/CNPJ\s+do\s+Detentor\s+do\s+D[ée]bito\s+([\d./-]+)/i)?.[1] || null;
    const codigoReceita = block.match(/C[óo]digo\s+da\s+Receita\/Denomina[çc][ãa]o\s+([\d-]+)\s*-\s*([^\n]+)/i);
    const codigo = codigoReceita?.[1].trim() || null;
    const denominacao = codigoReceita?.[2].trim() || null;
    const grupoTributo = block.match(/Grupo\s+de\s+Tributo\s+([^\n]+(?:\n[A-Z][^\n]*)?)/i)?.[1].replace(/\n/g, ' ').trim() || tributoNome;
    const periodicidade = block.match(/Periodicidade\s+([^\n]+)/i)?.[1].trim() || null;
    const periodoApur = block.match(/Per[íi]odo\s+de\s+Apura[çc][ãa]o\s+([^\n]+)/i)?.[1].trim() || null;
    const dataVenc = parseDateBR(block.match(/Data\s+de\s+Vencimento[^0-9]*([\d/]+)/i)?.[1] || null);
    const principal = parseMoney(block.match(/Principal\s+([\d.,]+)/i)?.[1]) ?? 0;
    const multa = parseMoney(block.match(/Multa\s+([\d.,]+)/i)?.[1]) ?? 0;
    const juros = parseMoney(block.match(/Juros\s+([\d.,]+)/i)?.[1]) ?? 0;
    const total = parseMoney(block.match(/Total\s+([\d.,]+)/i)?.[1]) ?? (principal + multa + juros);
    const controladoMatch = block.match(/D[ée]bito\s+Controlado\s+em\s+Processo\s+(Sim|N[ãa]o)/i)?.[1];
    const controlado = controladoMatch ? /sim/i.test(controladoMatch) : false;

    debitos.push({
      ordem,
      cnpj_detentor: cnpj,
      codigo_receita: codigo,
      denominacao_receita: denominacao,
      grupo_tributo: grupoTributo,
      periodicidade,
      periodo_apuracao: periodoApur,
      data_vencimento: dataVenc,
      principal,
      multa,
      juros,
      total,
      controlado_em_processo: controlado,
    });
  }

  return debitos;
}

// ── API pública ──────────────────────────────────────────────────────────────

export async function parseReciboPdf(pdfBuffer: Buffer): Promise<ReciboData> {
  const parser = new PDFParse({ data: pdfBuffer });
  let rawText = '';
  let totalPages = 0;
  try {
    const parsed = await parser.getText();
    rawText = parsed.text || '';
    totalPages = parsed.total || (parsed.pages?.length ?? 0);
  } finally {
    try { await parser.destroy(); } catch { /* ignore */ }
  }
  // Normalize whitespace but preserve line breaks
  const text = rawText.replace(/\r\n/g, '\n').replace(/[\t ]+/g, ' ');

  log.info(`[reciboParser] PDF parseado: ${totalPages} página(s), ${rawText.length} caracteres`);

  // Detecção de formato — 3 variantes:
  // 1. DCOMP legado (com "001. Débito ..." detalhado)
  // 2. DCOMP simplificado (PERDCOMP Web v8.00+, tabela "TRIBUTO VALOR")
  // 3. Pedido de Restituição (sem débitos)
  let base: Partial<ReciboData>;
  let formato: string;
  if (isReciboCompleto(text)) {
    formato = 'completo-legado';
    base = parseReciboCompleto(text);
  } else if (isDcompSimplificado(text)) {
    formato = 'dcomp-simplificado';
    base = parseDcompSimplificado(text);
  } else {
    formato = 'restituicao-curto';
    base = parseReciboCurto(text);
  }
  log.info(`[reciboParser] Formato detectado: ${formato} — ${base.debitos?.length ?? 0} débito(s) extraído(s)`);

  return {
    numero_perdcomp: null,
    numero_recibo: null,
    numero_perdcomp_inicial: null,
    tipo_documento: null,
    tipo_credito: null,
    data_transmissao: null,
    oriundo_acao_judicial: null,
    exercicio: null,
    periodo_inicial: null,
    periodo_final: null,
    forma_apuracao: null,
    forma_tributacao: null,
    periodo_apuracao: null,
    valor_pedido: null,
    valor_saldo_negativo: null,
    selic_acumulada: null,
    credito_atualizado: null,
    credito_original_data_entrega: null,
    saldo_credito_original: null,
    credito_original_utilizado: null,
    total_debitos_dcomp: null,
    cnpj: null,
    nome_empresarial: null,
    responsavel_nome: null,
    responsavel_cpf: null,
    debitos: [],
    ...base,
  };
}
