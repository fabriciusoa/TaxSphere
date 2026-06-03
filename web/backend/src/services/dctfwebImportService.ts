/**
 * Importador de XML para o módulo DCTFWeb.
 *
 * Lê arquivos XML/ZIP enviados pelo usuário e popula `dctfweb_declaracoes` com
 * valores agregados (origem='XML'). Suporta:
 *
 *   • eSocial S-1299 (Fechamento dos Eventos Periódicos)
 *     - Confirma que o período foi encerrado no eSocial.
 *     - Cruzar com S-5011 (apuração) para obter a contribuição previdenciária.
 *
 *   • EFD-Reinf R-9000 (Encerramento / Consolidação)
 *     - Confirma retenções IRRF/CSLL/COFINS/PIS de terceiros.
 *
 *   • Recibo DCTFWeb (XML do próprio recibo entregue na Receita)
 *     - Dado mais confiável: situação, recibo, valores agregados.
 *
 * Estratégia conservadora: não tentamos calcular a DCTFWeb a partir dos eventos
 * detalhados (S-1200/S-1210/R-2010/etc.) — apenas extraímos sinais agregados
 * (período encerrado, valores totais) e usamos para RECONCILIAR depois com o
 * que vier do RPA.
 *
 * Como melhorar mais adiante:
 *   • Implementar parser do leiaute completo (eSocial v2.5+ tem ~50 eventos).
 *   • Calcular DCTFWeb a partir dos eventos pré-fechamento, prevendo divergências.
 */
import { XMLParser } from 'fast-xml-parser';
import AdmZip from 'adm-zip';
import { runQuery, getOne } from '../database/connection';
import { log } from '../utils/logger';
import crypto from 'node:crypto';

export interface ImportXmlResultado {
  processados: number;
  ignorados: number;
  erros: { arquivo: string; motivo: string }[];
  declaracoes_upsert: number;
  divergencias_detectadas: number;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseAttributeValue: false,
  parseTagValue: false,
});

function normalizarPeriodo(s: string | undefined | null): string | null {
  if (!s) return null;
  // Aceita: "2026-05", "05/2026", "202605", "2026-05-31"
  const m1 = s.match(/^(\d{4})-(\d{2})/);
  if (m1) return `${m1[2]}/${m1[1]}`;
  const m2 = s.match(/^(\d{2})\/(\d{4})/);
  if (m2) return `${m2[1]}/${m2[2]}`;
  const m3 = s.match(/^(\d{4})(\d{2})$/);
  if (m3) return `${m3[2]}/${m3[1]}`;
  return s;
}

function toNumber(v: any): number {
  if (v == null) return 0;
  const s = String(v).replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function detectarTipo(xml: any): 'ESOCIAL_S1299' | 'REINF_R9000' | 'DCTFWEB_RECIBO' | 'DESCONHECIDO' {
  const str = JSON.stringify(xml).toLowerCase();
  if (str.includes('s-1299') || str.includes('evtfechaevper') || str.includes('fechaevper')) return 'ESOCIAL_S1299';
  if (str.includes('r-9000') || str.includes('reinfencerramento') || str.includes('evtfechareinf')) return 'REINF_R9000';
  if (str.includes('dctfweb') && (str.includes('recibo') || str.includes('numerorecibo'))) return 'DCTFWEB_RECIBO';
  return 'DESCONHECIDO';
}

function pegarPrimeiroValor(obj: any, caminhos: string[][]): any {
  for (const path of caminhos) {
    let cur = obj;
    let ok = true;
    for (const k of path) {
      if (cur && typeof cur === 'object' && k in cur) cur = cur[k];
      else { ok = false; break; }
    }
    if (ok && cur !== undefined && cur !== null) return cur;
  }
  return null;
}

interface ParsedData {
  tipo: string;
  periodo_apuracao: string | null;
  categoria: string;
  numero_recibo: string | null;
  situacao: string;
  debito_apurado: number;
  credito_vinculado: number;
  saldo_pagar: number;
  data_transmissao: string | null;
}

function parseEsocialS1299(xml: any): ParsedData {
  // eSocial S-1299: <eSocial><evtFechaEvPer>...<ideEvento><perApur>AAAA-MM</perApur>...
  const perApur = pegarPrimeiroValor(xml, [
    ['eSocial', 'evtFechaEvPer', 'ideEvento', 'perApur'],
    ['eSocial', 'evtFechaEvPer', 'ideRespInf', 'perApur'],
  ]);
  return {
    tipo: 'ORIGEM_ESOCIAL',
    periodo_apuracao: normalizarPeriodo(perApur),
    categoria: 'Previdenciária (eSocial)',
    numero_recibo: pegarPrimeiroValor(xml, [['eSocial', 'evtFechaEvPer', '@_Id'], ['Id']]),
    situacao: 'eSocial S-1299 (encerramento)',
    debito_apurado: 0,        // o S-1299 só sinaliza fechamento; valores vêm do S-5011
    credito_vinculado: 0,
    saldo_pagar: 0,
    data_transmissao: pegarPrimeiroValor(xml, [['eSocial', 'evtFechaEvPer', 'ideEvento', 'dhProc']]),
  };
}

function parseReinfR9000(xml: any): ParsedData {
  const perApur = pegarPrimeiroValor(xml, [
    ['Reinf', 'evtFechaReinf', 'ideEvento', 'perApur'],
    ['Reinf', 'evtFechaReinf', 'perApur'],
  ]);
  return {
    tipo: 'ORIGEM_REINF',
    periodo_apuracao: normalizarPeriodo(perApur),
    categoria: 'Retenções (EFD-Reinf)',
    numero_recibo: pegarPrimeiroValor(xml, [['Reinf', 'evtFechaReinf', '@_Id']]),
    situacao: 'EFD-Reinf R-9000 (encerramento)',
    debito_apurado: 0,
    credito_vinculado: 0,
    saldo_pagar: 0,
    data_transmissao: pegarPrimeiroValor(xml, [['Reinf', 'evtFechaReinf', 'ideEvento', 'dhProc']]),
  };
}

function parseDctfwebRecibo(xml: any): ParsedData {
  // O XML do recibo DCTFWeb (quando disponível) carrega situação, valores e número
  // do recibo já agregados. Estrutura varia — buscamos campos com nomes flexíveis.
  const root = xml.recibo || xml.DCTFWeb || xml.dctfweb || xml;
  return {
    tipo: 'ORIGEM_RECIBO',
    periodo_apuracao: normalizarPeriodo(pegarPrimeiroValor(root, [
      ['periodo'], ['periodoApuracao'], ['per_apur'], ['perApur'],
    ])),
    categoria: pegarPrimeiroValor(root, [['categoria'], ['cat']]) ?? 'DCTFWeb (recibo)',
    numero_recibo: pegarPrimeiroValor(root, [
      ['numeroRecibo'], ['numero_recibo'], ['nrRecibo'], ['recibo'],
    ]),
    situacao: pegarPrimeiroValor(root, [['situacao'], ['status']]) ?? 'Transmitida',
    debito_apurado: toNumber(pegarPrimeiroValor(root, [['debitoApurado'], ['debito_apurado'], ['vrDebito']])),
    credito_vinculado: toNumber(pegarPrimeiroValor(root, [['creditoVinculado'], ['credito_vinculado'], ['vrCredito']])),
    saldo_pagar: toNumber(pegarPrimeiroValor(root, [['saldoPagar'], ['saldo_pagar'], ['vrSaldoPagar']])),
    data_transmissao: pegarPrimeiroValor(root, [['dataTransmissao'], ['data_transmissao'], ['dhProc']]),
  };
}

function normalizarSituacao(s: string | null | undefined): string {
  if (!s) return 'DESCONHECIDA';
  const v = s.toLowerCase();
  if (v.includes('aceita')) return 'ACEITA';
  if (v.includes('rejei')) return 'REJEITADA';
  if (v.includes('retif')) return 'RETIFICADA';
  if (v.includes('sem mov')) return 'SEM_MOVIMENTO';
  if (v.includes('transmit') || v.includes('encerr')) return 'TRANSMITIDA';
  if (v.includes('edi') || v.includes('andam')) return 'EM_EDICAO';
  return 'DESCONHECIDA';
}

function hashConteudo(parsed: ParsedData): string {
  const norm = JSON.stringify({
    deb: parsed.debito_apurado,
    cred: parsed.credito_vinculado,
    saldo: parsed.saldo_pagar,
    cat: parsed.categoria,
  });
  return crypto.createHash('sha256').update(norm).digest('hex');
}

async function processarParsed(idEmpresa: number, parsed: ParsedData): Promise<{ upsert: boolean; divergencia: boolean }> {
  if (!parsed.periodo_apuracao) return { upsert: false, divergencia: false };

  const hash = hashConteudo(parsed);
  const hashCol = parsed.tipo === 'ORIGEM_ESOCIAL' ? 'hash_esocial' : parsed.tipo === 'ORIGEM_REINF' ? 'hash_reinf' : null;

  // Verifica se já existe declaração para esse período (vinda do RPA, por exemplo)
  const existente = await getOne<{ id: number; debito_apurado: number; credito_vinculado: number; saldo_pagar: number; hash_esocial: string | null; hash_reinf: string | null }>(
    `SELECT id, debito_apurado, credito_vinculado, saldo_pagar, hash_esocial, hash_reinf
       FROM dctfweb_declaracoes
      WHERE id_empresa = $1 AND periodo_apuracao = $2
      ORDER BY id DESC LIMIT 1`,
    [idEmpresa, parsed.periodo_apuracao]
  );

  if (existente) {
    // Atualiza hash da fonte correspondente + verifica divergência
    let divergencia = false;
    let divergenciaMotivo: string | null = null;

    // Se for recibo DCTFWeb (dado primário), comparamos valores
    if (parsed.tipo === 'ORIGEM_RECIBO') {
      const dif = Math.abs((existente.debito_apurado || 0) - parsed.debito_apurado)
                + Math.abs((existente.credito_vinculado || 0) - parsed.credito_vinculado)
                + Math.abs((existente.saldo_pagar || 0) - parsed.saldo_pagar);
      if (dif > 0.01) {
        divergencia = true;
        divergenciaMotivo = `Valores do recibo divergem do RPA. Δ débito=${(existente.debito_apurado - parsed.debito_apurado).toFixed(2)} Δ crédito=${(existente.credito_vinculado - parsed.credito_vinculado).toFixed(2)} Δ saldo=${(existente.saldo_pagar - parsed.saldo_pagar).toFixed(2)}`;
      }
    }

    const updateParts: string[] = [];
    const params: any[] = [];
    if (hashCol) { params.push(hash); updateParts.push(`${hashCol} = $${params.length}`); }
    if (parsed.tipo === 'ORIGEM_RECIBO') {
      params.push(parsed.debito_apurado); updateParts.push(`debito_apurado = $${params.length}`);
      params.push(parsed.credito_vinculado); updateParts.push(`credito_vinculado = $${params.length}`);
      params.push(parsed.saldo_pagar); updateParts.push(`saldo_pagar = $${params.length}`);
      params.push(parsed.numero_recibo || null); updateParts.push(`numero_recibo = COALESCE($${params.length}, numero_recibo)`);
      params.push(normalizarSituacao(parsed.situacao)); updateParts.push(`situacao_normalizada = $${params.length}`);
      params.push(parsed.situacao); updateParts.push(`situacao = $${params.length}`);
    }
    if (divergencia) {
      params.push(true); updateParts.push(`divergencia = $${params.length}`);
      params.push(divergenciaMotivo); updateParts.push(`divergencia_motivo = $${params.length}`);
    }
    updateParts.push(`atualizado_em = NOW()`);
    params.push(existente.id);
    await runQuery(
      `UPDATE dctfweb_declaracoes SET ${updateParts.join(', ')} WHERE id = $${params.length}`,
      params
    );
    return { upsert: true, divergencia };
  }

  // Não existe — insere
  await runQuery(
    `INSERT INTO dctfweb_declaracoes
       (id_empresa, periodo_apuracao, categoria, tipo,
        situacao, situacao_normalizada,
        debito_apurado, credito_vinculado, saldo_pagar,
        numero_recibo, data_transmissao,
        hash_esocial, hash_reinf)
     VALUES ($1, $2, $3, 'ORIGINAL', $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id_empresa, periodo_apuracao, categoria, tipo) DO NOTHING`,
    [
      idEmpresa, parsed.periodo_apuracao, parsed.categoria,
      parsed.situacao, normalizarSituacao(parsed.situacao),
      parsed.debito_apurado, parsed.credito_vinculado, parsed.saldo_pagar,
      parsed.numero_recibo || null, parsed.data_transmissao,
      parsed.tipo === 'ORIGEM_ESOCIAL' ? hash : null,
      parsed.tipo === 'ORIGEM_REINF'   ? hash : null,
    ]
  );
  return { upsert: true, divergencia: false };
}

async function processarArquivoXml(idEmpresa: number, nome: string, conteudo: string): Promise<{ upsert: boolean; divergencia: boolean; tipo: string }> {
  const xml = parser.parse(conteudo);
  const tipo = detectarTipo(xml);

  let parsed: ParsedData | null = null;
  if (tipo === 'ESOCIAL_S1299')      parsed = parseEsocialS1299(xml);
  else if (tipo === 'REINF_R9000')   parsed = parseReinfR9000(xml);
  else if (tipo === 'DCTFWEB_RECIBO') parsed = parseDctfwebRecibo(xml);
  else {
    throw new Error(`Tipo de XML não reconhecido em ${nome}`);
  }
  if (!parsed.periodo_apuracao) {
    throw new Error(`Período de apuração ausente em ${nome}`);
  }
  const r = await processarParsed(idEmpresa, parsed);
  log.info(`[dctfweb-import] ${nome} → ${tipo} período ${parsed.periodo_apuracao}${r.divergencia ? ' [DIVERGÊNCIA]' : ''}`);
  return { ...r, tipo };
}

export async function importarXmlDctfweb(idEmpresa: number, arquivos: Express.Multer.File[]): Promise<ImportXmlResultado> {
  const result: ImportXmlResultado = {
    processados: 0, ignorados: 0, erros: [],
    declaracoes_upsert: 0, divergencias_detectadas: 0,
  };

  for (const arquivo of arquivos) {
    const nome = arquivo.originalname.toLowerCase();
    try {
      if (nome.endsWith('.zip')) {
        const zip = new AdmZip(arquivo.buffer);
        for (const entry of zip.getEntries()) {
          if (entry.isDirectory) continue;
          if (!entry.entryName.toLowerCase().endsWith('.xml')) continue;
          try {
            const conteudo = entry.getData().toString('utf8');
            const r = await processarArquivoXml(idEmpresa, entry.entryName, conteudo);
            result.processados++;
            if (r.upsert) result.declaracoes_upsert++;
            if (r.divergencia) result.divergencias_detectadas++;
          } catch (e: any) {
            result.erros.push({ arquivo: entry.entryName, motivo: e.message });
            result.ignorados++;
          }
        }
      } else if (nome.endsWith('.xml')) {
        const conteudo = arquivo.buffer.toString('utf8');
        const r = await processarArquivoXml(idEmpresa, arquivo.originalname, conteudo);
        result.processados++;
        if (r.upsert) result.declaracoes_upsert++;
        if (r.divergencia) result.divergencias_detectadas++;
      } else {
        result.ignorados++;
        result.erros.push({ arquivo: arquivo.originalname, motivo: 'Tipo de arquivo não suportado (use .xml ou .zip)' });
      }
    } catch (e: any) {
      result.erros.push({ arquivo: arquivo.originalname, motivo: e.message });
      result.ignorados++;
    }
  }
  return result;
}
