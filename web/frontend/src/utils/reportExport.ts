// ════════════════════════════════════════════════════════════════════════════
// Exportação de relatórios — PDF (jsPDF + autoTable), XLSX (ExcelJS) e DOCX.
// Logo TaxSphere com proporção preservada; Excel com filtros, congelamento,
// zebra, totais e capa com identidade visual.
// ════════════════════════════════════════════════════════════════════════════

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type * as ExcelJSTypes from 'exceljs';
import { saveAs } from 'file-saver';
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ImageRun, ShadingType,
} from 'docx';

// ─── Interfaces públicas ──────────────────────────────────────────────────────

export interface ReportKpi {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: string;
}

export interface ReportSection {
  title?: string;
  kpis?: ReportKpi[];
  headers?: string[];
  colAligns?: ('left' | 'right' | 'center')[];
  rows?: (string | number)[][];
  totaisRow?: (string | number)[];
  note?: string;
  alertText?: string;
}

export interface ReportData {
  titulo: string;
  subtitulo?: string;
  empresa?: string;
  geradoEm: string;
  secoes: ReportSection[];
  landscape?: boolean;
}

const NAVY_RGB: [number, number, number] = [10, 22, 40];
const CYAN_RGB: [number, number, number] = [0, 200, 212];
const GRAY_RGB: [number, number, number] = [100, 116, 139];
const LIGHT_RGB: [number, number, number] = [248, 250, 252];

const NAVY_ARGB = 'FF0A1628';
const CYAN_ARGB = 'FF00C8D4';
const HEADER_FILL = 'FF0A1628';
const ALT_ROW_FILL = 'FFF8FAFC';
const BORDER_COLOR = 'FFCBD5E1';

/** Arquivos em `public/` — ordem: marca limpa / ícone / legado (o docx espera transformation em *pixels*, não EMU). */
const LOGO_CANDIDATES = ['/TaxSphere_clean.png', '/TS_Sphere.png', '/logo_ts.png'] as const;

const STATUS_TEXT_COLORS: Record<string, [number, number, number]> = {
  Prescrito: [220, 38, 38],
  PRESCRITO: [220, 38, 38],
  '< 6 meses': [239, 68, 68],
  URGENTE_6M: [239, 68, 68],
  '< 1 ano': [249, 115, 22],
  ATENCAO_1A: [249, 115, 22],
  '< 2 anos': [234, 179, 8],
  AVISO_2A: [234, 179, 8],
  '> 2 anos': [34, 197, 94],
  OK: [34, 197, 94],
  Homologado: [34, 197, 94],
  Deferido: [34, 197, 94],
  'Em Análise': [59, 130, 246],
  Cancelado: [220, 38, 38],
  Retificado: [249, 115, 22],
  Desconhecido: [100, 116, 139],
};

// ─── Logo: raster no canvas + dimensões corretas (PDF mm, DOCX px, Excel px) ──

export type LogoParaRelatorio = {
  /** PNG base64 data URL (raster de alta qualidade, proporção exata) */
  dataUrlPng: string;
  pngBytes: Uint8Array;
  /** Tamanho no PDF (mm), proporcional */
  wPdfMm: number;
  hPdfMm: number;
  /** docx ImageRun.transformation = *pixels* (a lib converte para EMU internamente) */
  wDocxPx: number;
  hDocxPx: number;
  /** Dimensões do raster (px) — para Excel */
  wRaster: number;
  hRaster: number;
};

let logoPrepCache: LogoParaRelatorio | null | undefined;

function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function carregarImagem(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falha ao carregar imagem'));
    img.src = src;
  });
}

/**
 * Carrega o primeiro PNG disponível, redesenha em canvas (proporção 1:1, sem achatamento)
 * e devolve tamanhos corretos para PDF, DOCX e Excel.
 */
export async function prepararLogoRelatorio(): Promise<LogoParaRelatorio | null> {
  if (logoPrepCache !== undefined) return logoPrepCache;

  let fonteDataUrl = '';
  for (const path of LOGO_CANDIDATES) {
    try {
      const resp = await fetch(path, { cache: 'force-cache' });
      if (!resp.ok) continue;
      fonteDataUrl = await blobParaDataUrl(await resp.blob());
      if (fonteDataUrl) break;
    } catch {
      continue;
    }
  }
  if (!fonteDataUrl) {
    logoPrepCache = null;
    return null;
  }

  try {
    const img = await carregarImagem(fonteDataUrl);
    const nw = img.naturalWidth || img.width;
    const nh = img.naturalHeight || img.height;
    if (!nw || !nh) {
      logoPrepCache = null;
      return null;
    }

    const maxRasterPx = 720;
    const escala = Math.min(maxRasterPx / Math.max(nw, nh), 1);
    const rw = Math.max(1, Math.round(nw * escala));
    const rh = Math.max(1, Math.round(nh * escala));

    const canvas = document.createElement('canvas');
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      logoPrepCache = null;
      return null;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, rw, rh);
    ctx.drawImage(img, 0, 0, rw, rh);

    const dataUrlPng = canvas.toDataURL('image/png');
    const b64 = dataUrlPng.split(',')[1] || '';
    const bin = atob(b64);
    const pngBytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) pngBytes[i] = bin.charCodeAt(i);

    const maxPdfMm = 16;
    const aspect = rw / rh;
    let wPdfMm: number;
    let hPdfMm: number;
    if (aspect >= 1) {
      wPdfMm = maxPdfMm;
      hPdfMm = maxPdfMm / aspect;
    } else {
      hPdfMm = maxPdfMm;
      wPdfMm = maxPdfMm * aspect;
    }

    const maxDocxPx = 240;
    const sDocx = Math.min(maxDocxPx / Math.max(rw, rh), 1);
    const wDocxPx = Math.max(1, Math.round(rw * sDocx));
    const hDocxPx = Math.max(1, Math.round(rh * sDocx));

    logoPrepCache = {
      dataUrlPng,
      pngBytes,
      wPdfMm,
      hPdfMm,
      wDocxPx,
      hDocxPx,
      wRaster: rw,
      hRaster: rh,
    };
    return logoPrepCache;
  } catch {
    logoPrepCache = null;
    return null;
  }
}

/** Excel: ext em px, proporcional ao raster. */
function logoTamanhoExcelPx(w: number, h: number, maxLadoPx = 120): { width: number; height: number } {
  const escala = Math.min(maxLadoPx / Math.max(w, h), 1);
  return { width: Math.round(w * escala), height: Math.round(h * escala) };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').padEnd(6, '0');
  return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}

function bordaFina(): Partial<ExcelJSTypes.Borders> {
  const b: ExcelJSTypes.Border = { style: 'thin', color: { argb: BORDER_COLOR } };
  return { top: b, bottom: b, left: b, right: b };
}

function cabecalhoMoeda(header: string): boolean {
  const x = header.toLowerCase();
  return /(valor|saldo|utilizado|total|crédito|credito|atualiz|débito|debito|irpj|csll|cofins|pis|inss|compens|r\$)/.test(x);
}

/** Converte string pt-BR tipo "R$ 1.234,56" ou "272.438,68" em número. */
function parseValorPtBr(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const s = String(v).trim();
  if (!s || s === '—') return null;
  const t = s.replace(/\s/g, '').replace(/R\$\s?/i, '');
  if (!/^[\d.,-]+$/.test(t.replace(/−/g, '-'))) return null;
  const norm = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  const n = Number(norm);
  return Number.isFinite(n) ? n : null;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export async function exportarRelatorioPDF(data: ReportData, fileName: string) {
  const isLandscape = !!data.landscape;
  const doc = new jsPDF({ orientation: isLandscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
  const pageW = isLandscape ? 297 : 210;
  const pageH = isLandscape ? 210 : 297;
  const mg = 12;
  let y = mg;

  const logo = await prepararLogoRelatorio();
  let txtX = mg;
  if (logo) {
    try {
      doc.addImage(logo.dataUrlPng, 'PNG', mg, y, logo.wPdfMm, logo.hPdfMm);
      txtX = mg + logo.wPdfMm + 4;
    } catch {
      txtX = mg;
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...NAVY_RGB);
  doc.text(data.titulo, txtX, y + 5);
  if (data.subtitulo) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY_RGB);
    doc.text(data.subtitulo, txtX, y + 10, { maxWidth: pageW - txtX - mg - 52 });
  }
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_RGB);
  const infoLines = [data.empresa ? `Empresa: ${data.empresa}` : null, `Gerado em: ${data.geradoEm}`].filter(Boolean) as string[];
  infoLines.forEach((l, i) => doc.text(l, pageW - mg, y + 4 + i * 5, { align: 'right' }));
  y += Math.max(logo ? logo.hPdfMm + 4 : 0, 16);

  doc.setDrawColor(...CYAN_RGB);
  doc.setLineWidth(0.6);
  doc.line(mg, y, pageW - mg, y);
  y += 6;

  for (const sec of data.secoes) {
    if (sec.alertText) {
      const alertH = 11;
      doc.setFillColor(255, 244, 230);
      doc.roundedRect(mg, y, pageW - 2 * mg, alertH, 1.5, 1.5, 'F');
      doc.setDrawColor(245, 158, 11);
      doc.setLineWidth(0.3);
      doc.roundedRect(mg, y, pageW - 2 * mg, alertH, 1.5, 1.5, 'S');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(146, 64, 14);
      doc.text('ATENÇÃO:', mg + 3, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.text(sec.alertText, mg + 22, y + 5, { maxWidth: pageW - 2 * mg - 25 });
      y += alertH + 5;
    }

    if (sec.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(...NAVY_RGB);
      doc.text(sec.title, mg, y);
      y += 7;
    }

    if (sec.kpis && sec.kpis.length > 0) {
      const perRow = Math.min(sec.kpis.length, isLandscape ? 6 : 5);
      const cardW = (pageW - 2 * mg) / perRow;
      const cardH = sec.kpis.some(k => k.sublabel) ? 19 : 16;
      const rows = Math.ceil(sec.kpis.length / perRow);

      for (let row = 0; row < rows; row++) {
        const rowKpis = sec.kpis.slice(row * perRow, (row + 1) * perRow);
        rowKpis.forEach((k, idx) => {
          const cx = mg + idx * cardW;
          const cy = y + row * (cardH + 3);
          const rgb = k.color ? hexToRgb(k.color) : CYAN_RGB;

          doc.setFillColor(...LIGHT_RGB);
          doc.roundedRect(cx, cy, cardW - 2, cardH, 1.5, 1.5, 'F');
          doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
          doc.setLineWidth(1.2);
          doc.line(cx + 2, cy + cardH - 1, cx + cardW - 3, cy + cardH - 1);
          doc.setLineWidth(0.2);

          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.5);
          doc.setTextColor(...GRAY_RGB);
          doc.text(k.label, cx + 3, cy + 5.5, { maxWidth: cardW - 5 });

          doc.setFont('helvetica', 'bold');
          const valLen = String(k.value).length;
          doc.setFontSize(valLen > 16 ? 8.5 : valLen > 10 ? 10 : 12);
          doc.setTextColor(rgb[0], rgb[1], rgb[2]);
          doc.text(String(k.value), cx + 3, cy + 12, { maxWidth: cardW - 5 });

          if (k.sublabel) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...GRAY_RGB);
            doc.text(k.sublabel, cx + 3, cy + cardH - 2, { maxWidth: cardW - 5 });
          }
        });
      }
      y += rows * (cardH + 3) + 5;
    }

    if (sec.headers && sec.rows) {
      const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {};
      if (sec.colAligns) {
        sec.colAligns.forEach((align, i) => {
          columnStyles[i] = { halign: align };
        });
      }

      autoTable(doc, {
        head: [sec.headers],
        body: sec.rows.map(r => r.map(c => String(c))),
        foot: sec.totaisRow ? [sec.totaisRow.map(c => String(c))] : undefined,
        showFoot: 'lastPage',
        startY: y,
        margin: { left: mg, right: mg },
        styles: {
          fontSize: isLandscape ? 6.5 : 8,
          cellPadding: isLandscape ? 1.5 : 2,
          textColor: NAVY_RGB,
          overflow: 'linebreak',
        },
        headStyles: {
          fillColor: NAVY_RGB,
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: isLandscape ? 6.5 : 8,
          cellPadding: isLandscape ? 1.8 : 2.5,
        },
        footStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: 'bold',
          fontSize: isLandscape ? 6.5 : 8,
        },
        alternateRowStyles: { fillColor: LIGHT_RGB },
        columnStyles,
        theme: 'grid',
        tableLineColor: [226, 232, 240],
        tableLineWidth: 0.1,
        didParseCell(hookData) {
          const txt = String(hookData.cell.text?.[0] || '');
          const sc = STATUS_TEXT_COLORS[txt];
          if (sc && hookData.section === 'body') {
            hookData.cell.styles.textColor = sc;
            hookData.cell.styles.fontStyle = 'bold';
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 7;
    }

    if (sec.note) {
      if (y > pageH - 25) {
        doc.addPage();
        y = mg + 5;
      }
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRAY_RGB);
      doc.text(`Nota: ${sec.note}`, mg, y, { maxWidth: pageW - 2 * mg });
      y += 7;
    }
    y += 2;
  }

  const nPags = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= nPags; p++) {
    doc.setPage(p);
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.3);
    doc.line(mg, pageH - 8, pageW - mg, pageH - 8);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY_RGB);
    doc.text(`TaxSphere  |  ${data.titulo}`, mg, pageH - 5);
    doc.text(`${p} / ${nPags}`, pageW - mg, pageH - 5, { align: 'right' });
  }

  doc.save(fileName);
}

// ─── XLSX (ExcelJS) ────────────────────────────────────────────────────────────

function nomeAbaUnico(wb: ExcelJSTypes.Workbook, base: string): string {
  let n = base.replace(/[[\]/\\?:*']/g, '_').trim().substring(0, 31) || 'Dados';
  let c = n;
  let i = 0;
  while (wb.getWorksheet(c)) {
    i += 1;
    const suf = `_${i}`;
    c = `${n.substring(0, 31 - suf.length)}${suf}`;
  }
  return c;
}

function aplicarLarguras(ws: ExcelJSTypes.Worksheet, headers: string[], rows: (string | number)[][]) {
  headers.forEach((h, idx) => {
    const col = idx + 1;
    const maxLen = Math.max(
      String(h).length,
      ...rows.map(r => String(r[idx] ?? '').length),
      10,
    );
    ws.getColumn(col).width = Math.min(maxLen + 3, 55);
  });
}

async function montarCapaExcel(
  wb: ExcelJSTypes.Workbook,
  data: ReportData,
  logo: LogoParaRelatorio | null,
) {
  const ws = wb.addWorksheet('Capa', {
    views: [{ showGridLines: false }],
    properties: { tabColor: { argb: CYAN_ARGB } },
  });

  ws.mergeCells('D3:L3');
  ws.mergeCells('D4:L4');
  ws.mergeCells('D6:L6');
  ws.mergeCells('D7:L7');
  ws.mergeCells('D9:L11');

  const t1 = ws.getCell('D3');
  t1.value = data.titulo;
  t1.font = { size: 20, bold: true, color: { argb: NAVY_ARGB } };

  const t2 = ws.getCell('D4');
  t2.value = data.subtitulo || 'Relatório gerado pelo TaxSphere';
  t2.font = { size: 11, italic: true, color: { argb: 'FF64748B' } };

  ws.getCell('D6').value = 'Empresa';
  ws.getCell('E6').value = data.empresa || 'Todas as empresas';
  ws.getCell('D7').value = 'Gerado em';
  ws.getCell('E7').value = data.geradoEm;
  ['D6', 'D7'].forEach((a) => {
    const c = ws.getCell(a);
    c.font = { bold: true, color: { argb: 'FF64748B' }, size: 10 };
  });
  ['E6', 'E7'].forEach((a) => {
    ws.getCell(a).font = { size: 10, color: { argb: NAVY_ARGB } };
  });

  ws.getCell('D9').value =
    'Este arquivo contém uma ou mais abas de dados com filtros automáticos (cabeçalho azul), linhas zebradas e formatação numérica quando aplicável. Use a linha de cabeçalho para filtrar e ordenar.';
  ws.getCell('D9').font = { size: 10, color: { argb: 'FF475569' } };
  ws.getRow(3).height = 28;
  ws.getRow(4).height = 22;

  if (logo) {
    const base64 = logo.dataUrlPng.includes(',') ? logo.dataUrlPng.split(',')[1] : logo.dataUrlPng;
    const id = wb.addImage({ base64, extension: 'png' });
    const { width, height } = logoTamanhoExcelPx(logo.wRaster, logo.hRaster, 130);
    ws.addImage(id, { tl: { col: 0.15, row: 0.2 }, ext: { width, height } });
    ws.getRow(1).height = Math.max(Math.round(height * 0.75), 52);
  }

  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 4;
  ws.getColumn(3).width = 4;
  ws.getColumn(4).width = 14;
  for (let c = 5; c <= 12; c++) ws.getColumn(c).width = 14;
}

async function montarSecaoExcel(
  wb: ExcelJSTypes.Workbook,
  data: ReportData,
  sec: ReportSection,
  sheetBaseName: string,
  logo: LogoParaRelatorio | null,
) {
  const name = nomeAbaUnico(wb, sheetBaseName);
  const ws = wb.addWorksheet(name, { properties: { tabColor: { argb: NAVY_ARGB } } });

  let r = 1;

  if (logo) {
    const base64 = logo.dataUrlPng.includes(',') ? logo.dataUrlPng.split(',')[1] : logo.dataUrlPng;
    const id = wb.addImage({ base64, extension: 'png' });
    const { width, height } = logoTamanhoExcelPx(logo.wRaster, logo.hRaster, 72);
    ws.addImage(id, { tl: { col: 0.1, row: 0.05 }, ext: { width, height } });
    ws.getRow(1).height = Math.max(38, height * 0.55);
  }

  r = 2;
  const lastCol = Math.max(sec.headers?.length || 6, 8);
  ws.mergeCells(r, 1, r, lastCol);
  const brand = ws.getCell(r, 1);
  brand.value = `TaxSphere  |  ${data.titulo}`;
  brand.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  brand.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  brand.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  brand.border = bordaFina() as ExcelJSTypes.Borders;
  ws.getRow(r).height = 24;
  r += 1;

  if (sec.title) {
    ws.mergeCells(r, 1, r, lastCol);
    const c = ws.getCell(r, 1);
    c.value = sec.title;
    c.font = { bold: true, size: 14, color: { argb: NAVY_ARGB } };
    c.alignment = { vertical: 'middle', horizontal: 'left' };
    ws.getRow(r).height = 22;
    r += 1;
  }

  r += 1;

  if (sec.alertText) {
    ws.mergeCells(r, 1, r, lastCol);
    const c = ws.getCell(r, 1);
    c.value = `ATENÇÃO: ${sec.alertText}`;
    c.font = { bold: true, size: 10, color: { argb: 'FF92400E' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E6' } };
    c.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
    c.border = bordaFina() as ExcelJSTypes.Borders;
    ws.getRow(r).height = 48;
    r += 2;
  }

  if (sec.kpis && sec.kpis.length > 0) {
    ws.getCell(r, 1).value = 'Indicadores';
    ws.getCell(r, 1).font = { bold: true, size: 11, color: { argb: NAVY_ARGB } };
    r += 1;
    const hRow = r;
    ws.getRow(hRow).values = ['Indicador', 'Valor', 'Detalhe'];
    styleExcelHeaderRow(ws, hRow, 3);
    r += 1;
    for (const k of sec.kpis) {
      ws.getRow(r).values = [k.label, k.value, k.sublabel ?? ''];
      ws.getRow(r).getCell(2).font = { bold: true, size: 11, color: { argb: k.color ? `FF${k.color.replace('#', '')}` : CYAN_ARGB } };
      aplicarBordaLinha(ws, r, 3);
      r += 1;
    }
    r += 1;
  }

  if (sec.headers && Array.isArray(sec.rows)) {
    const headerRow = r;
    ws.getRow(headerRow).values = sec.headers;
    styleExcelHeaderRow(ws, headerRow, sec.headers.length);

    let dataEnd = headerRow;
    sec.rows.forEach((row, idx) => {
      const rr = headerRow + 1 + idx;
      ws.getRow(rr).values = row.map((c) => c);
      const bg = idx % 2 === 0 ? ALT_ROW_FILL : 'FFFFFFFF';
      for (let c = 1; c <= sec.headers!.length; c++) {
        const cell = ws.getRow(rr).getCell(c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = bordaFina() as ExcelJSTypes.Borders;
        cell.alignment = { vertical: 'middle', wrapText: true };
        if (cabecalhoMoeda(sec.headers![c - 1])) {
          const n = parseValorPtBr(cell.value);
          if (n != null) {
            cell.value = n;
            cell.numFmt = '[$R$-416] #,##0.00';
          }
        }
      }
      dataEnd = rr;
    });

    if (sec.totaisRow) {
      dataEnd += 1;
      ws.getRow(dataEnd).values = sec.totaisRow;
      for (let c = 1; c <= sec.headers.length; c++) {
        const cell = ws.getRow(dataEnd).getCell(c);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
        cell.border = bordaFina() as ExcelJSTypes.Borders;
        if (c > 1 && cabecalhoMoeda(sec.headers[c - 1])) {
          const n = parseValorPtBr(cell.value);
          if (n != null) {
            cell.value = n;
            cell.numFmt = '[$R$-416] #,##0.00';
          }
        }
      }
    }

    aplicarLarguras(ws, sec.headers, sec.rows);

    const filterFrom = headerRow;
    const filterTo = dataEnd;
    if (filterTo >= filterFrom && sec.headers.length > 0) {
      ws.autoFilter = {
        from: { row: filterFrom, column: 1 },
        to: { row: filterTo, column: sec.headers.length },
      };
    }

    ws.views = [{ state: 'frozen', ySplit: headerRow, activeCell: `A${headerRow + 1}`, showGridLines: true }];
  }

  if (sec.note) {
    r = (ws.lastRow?.number ?? r) + 2;
    ws.mergeCells(r, 1, r, lastCol);
    const c = ws.getCell(r, 1);
    c.value = `Nota: ${sec.note}`;
    c.font = { italic: true, size: 10, color: { argb: 'FF64748B' } };
    c.alignment = { wrapText: true };
  }
}

function styleExcelHeaderRow(ws: ExcelJSTypes.Worksheet, rowIndex: number, numCols: number) {
  const row = ws.getRow(rowIndex);
  row.height = 22;
  for (let c = 1; c <= numCols; c++) {
    const cell = row.getCell(c);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = bordaFina() as ExcelJSTypes.Borders;
  }
}

function aplicarBordaLinha(ws: ExcelJSTypes.Worksheet, rowIndex: number, numCols: number) {
  for (let c = 1; c <= numCols; c++) {
    ws.getRow(rowIndex).getCell(c).border = bordaFina() as ExcelJSTypes.Borders;
  }
}

export async function exportarRelatorioXLSX(data: ReportData, fileName: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TaxSphere';
  wb.created = new Date();
  wb.company = 'TaxSphere';

  const logo = await prepararLogoRelatorio();

  await montarCapaExcel(wb, data, logo);

  let idx = 0;
  for (const sec of data.secoes) {
    const base = sec.title || `Secao_${idx + 1}`;
    const temTabela = !!(sec.headers && sec.rows);
    const temKpiOuAlerta = !!(sec.kpis?.length || sec.alertText || sec.note);
    if (temTabela || temKpiOuAlerta) {
      await montarSecaoExcel(wb, data, sec, base, logo);
    }
    idx += 1;
  }

  const buf = await wb.xlsx.writeBuffer();
  saveAs(
    new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    fileName,
  );
}

// ─── DOCX ────────────────────────────────────────────────────────────────────

export async function exportarRelatorioDOCX(data: ReportData, fileName: string) {
  const children: any[] = [];

  const logo = await prepararLogoRelatorio();
  if (logo) {
    try {
      children.push(
        new Paragraph({
          spacing: { after: 200 },
          children: [
            new ImageRun({
              type: 'png',
              data: logo.pngBytes,
              transformation: { width: logo.wDocxPx, height: logo.hDocxPx },
            }),
          ],
        }),
      );
    } catch {
      /* ignorar */
    }
  }

  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 100, after: 120 },
      children: [new TextRun({ text: data.titulo, bold: true, color: '0A1628', size: 36 })],
    }),
  );
  if (data.subtitulo) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: data.subtitulo, color: '64748B', italics: true, size: 22 })],
      }),
    );
  }
  const metaLines = [data.empresa ? `Empresa: ${data.empresa}` : null, `Gerado em: ${data.geradoEm}`].filter(Boolean) as string[];
  metaLines.forEach((line) =>
    children.push(
      new Paragraph({
        spacing: { after: 60 },
        children: [new TextRun({ text: line, color: '64748B', size: 18 })],
      }),
    ),
  );
  children.push(new Paragraph({ text: '', spacing: { after: 240 } }));

  for (const sec of data.secoes) {
    if (sec.alertText) {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { type: ShadingType.SOLID, color: 'FFF4E6', fill: 'FFF4E6' },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: 'F59E0B' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'F59E0B' },
                    left: { style: BorderStyle.THICK, size: 16, color: 'F59E0B' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: 'F59E0B' },
                  },
                  children: [
                    new Paragraph({
                      spacing: { before: 60, after: 60 },
                      children: [new TextRun({ text: `ATENÇÃO: ${sec.alertText}`, color: '92400E', size: 18, bold: true })],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      );
      children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    }

    if (sec.title) {
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 320, after: 160 },
          children: [new TextRun({ text: sec.title, bold: true, color: '0A1628', size: 28 })],
        }),
      );
    }

    if (sec.kpis && sec.kpis.length > 0) {
      const hasSubLabels = sec.kpis.some((k) => k.sublabel);
      const kpiRows = [
        new TableRow({
          children: sec.kpis.map(
            (k) =>
              new TableCell({
                shading: { type: ShadingType.SOLID, color: 'F1F5F9', fill: 'F1F5F9' },
                borders: {
                  top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 60, after: 40 },
                    children: [new TextRun({ text: k.label, size: 16, color: '64748B' })],
                  }),
                ],
              }),
          ),
        }),
        new TableRow({
          children: sec.kpis.map(
            (k) =>
              new TableCell({
                shading: { type: ShadingType.SOLID, color: 'FFFFFF', fill: 'FFFFFF' },
                borders: {
                  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  bottom: { style: BorderStyle.THICK, size: 10, color: k.color ? k.color.toUpperCase() : '00C8D4' },
                  left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                  right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
                },
                children: [
                  new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 40, after: hasSubLabels ? 20 : 80 },
                    children: [
                      new TextRun({
                        text: String(k.value),
                        bold: true,
                        size: 26,
                        color: k.color ? k.color.toUpperCase() : '0A1628',
                      }),
                    ],
                  }),
                  ...(k.sublabel
                    ? [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          spacing: { before: 0, after: 80 },
                          children: [new TextRun({ text: k.sublabel, size: 16, color: '64748B' })],
                        }),
                      ]
                    : []),
                ],
              }),
          ),
        }),
      ];
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: kpiRows }));
      children.push(new Paragraph({ text: '', spacing: { after: 240 } }));
    }

    if (sec.headers && sec.rows) {
      const allRows = [...sec.rows, ...(sec.totaisRow ? [sec.totaisRow] : [])];
      const tbl = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [sec.headers, ...allRows].map((row, rowIdx) => {
          const isHead = rowIdx === 0;
          const isTotais = !!sec.totaisRow && rowIdx === allRows.length;
          const isAlt = !isHead && !isTotais && (rowIdx - 1) % 2 === 1;
          const bgColor = isHead ? '0A1628' : isTotais ? '1E293B' : isAlt ? 'F8FAFC' : 'FFFFFF';
          const txtColor = isHead || isTotais ? 'FFFFFF' : '0A1628';

          return new TableRow({
            children: row.map(
              (cell) =>
                new TableCell({
                  shading: { type: ShadingType.SOLID, color: bgColor, fill: bgColor },
                  borders: {
                    top: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
                    bottom: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
                    left: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
                    right: { style: BorderStyle.SINGLE, size: 2, color: 'CBD5E1' },
                  },
                  children: [
                    new Paragraph({
                      spacing: { before: 40, after: 40 },
                      children: [
                        new TextRun({
                          text: String(cell),
                          bold: isHead || isTotais,
                          color: txtColor,
                          size: isHead ? 17 : 15,
                        }),
                      ],
                    }),
                  ],
                }),
            ),
          });
        }),
      });
      children.push(tbl);
      children.push(new Paragraph({ text: '', spacing: { after: 240 } }));
    }

    if (sec.note) {
      children.push(
        new Paragraph({
          spacing: { after: 120 },
          children: [new TextRun({ text: `Nota: ${sec.note}`, italics: true, color: '64748B', size: 18 })],
        }),
      );
    }
  }

  children.push(new Paragraph({ text: '', spacing: { before: 480 } }));
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: 'TaxSphere  |  Sistema de Gestão Tributária', color: '94A3B8', size: 14, italics: true })],
    }),
  );

  const pageProps: Record<string, unknown> = {
    margin: { top: 851, right: 851, bottom: 851, left: 851 },
  };
  if (data.landscape) {
    pageProps.size = { orientation: 'landscape', width: 16838, height: 11906 };
  }

  const docxDoc = new Document({
    creator: 'TaxSphere',
    title: data.titulo,
    sections: [{ properties: { page: pageProps as any }, children }],
  });

  saveAs(await Packer.toBlob(docxDoc), fileName);
}

// ─── Exportação unificada ─────────────────────────────────────────────────────

export async function exportarRelatorio(formato: 'pdf' | 'docx' | 'xlsx', data: ReportData, nomeBase: string) {
  const dataStr = new Date().toISOString().split('T')[0];
  const safeBase = nomeBase.replace(/[^\w-]/g, '_');
  const fileName = `${safeBase}_${dataStr}.${formato}`;
  if (formato === 'pdf') return exportarRelatorioPDF(data, fileName);
  if (formato === 'xlsx') return exportarRelatorioXLSX(data, fileName);
  if (formato === 'docx') return exportarRelatorioDOCX(data, fileName);
}
