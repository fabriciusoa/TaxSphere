// ════════════════════════════════════════════════════════════════════════════
// Utilitários para exportar relatórios em PDF, DOCX e XLSX.
// Todas as funções recebem uma estrutura unificada `ReportData` (título +
// metadados + uma ou mais "seções" com tabela ou KPIs) e geram um download
// com o logo do TaxSphere e formatação limpa.
// ════════════════════════════════════════════════════════════════════════════

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import {
  Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ImageRun, ShadingType,
} from 'docx';

export interface ReportKpi { label: string; value: string | number }
export interface ReportSection {
  title?: string;
  kpis?: ReportKpi[];
  // Tabela: primeira linha são headers
  headers?: string[];
  rows?: (string | number)[][];
  note?: string;
}
export interface ReportData {
  titulo: string;
  subtitulo?: string;
  empresa?: string;
  geradoEm: string; // ISO ou texto formatado
  secoes: ReportSection[];
}

// Cores do tema (consistentes com a UI)
const COR_NAVY = '#0a1628';
const COR_CYAN = '#00bfd4';
const COR_CINZA = '#64748b';
const COR_BG_HEADER = '#f1f5f9';

// ─── Helper: carrega o logo como base64 (cache em módulo) ────────────────────
let logoCache: string | null = null;
async function carregarLogo(): Promise<string> {
  if (logoCache) return logoCache;
  try {
    const resp = await fetch('/logo_ts.png');
    const blob = await resp.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        logoCache = reader.result as string;
        resolve(logoCache);
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

// ─── PDF (jsPDF + autoTable) ─────────────────────────────────────────────────
export async function exportarRelatorioPDF(data: ReportData, fileName: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const margem = 15;
  let y = margem;

  // Logo + cabeçalho
  const logo = await carregarLogo();
  if (logo) {
    try { doc.addImage(logo, 'PNG', margem, y, 28, 10); } catch { /* ignore */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(COR_NAVY);
  doc.text(data.titulo, margem + 32, y + 7);
  y += 16;

  // Metadados
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(COR_CINZA);
  if (data.subtitulo) { doc.text(data.subtitulo, margem, y); y += 4; }
  if (data.empresa) { doc.text(`Empresa: ${data.empresa}`, margem, y); y += 4; }
  doc.text(`Gerado em: ${data.geradoEm}`, margem, y); y += 6;

  // Linha separadora
  doc.setDrawColor(COR_CYAN);
  doc.setLineWidth(0.5);
  doc.line(margem, y, 210 - margem, y);
  y += 6;

  // Seções
  for (const sec of data.secoes) {
    if (sec.title) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(COR_NAVY);
      doc.text(sec.title, margem, y);
      y += 6;
    }

    // KPIs (se houver) — em colunas
    if (sec.kpis && sec.kpis.length > 0) {
      const larg = (210 - 2 * margem) / sec.kpis.length;
      sec.kpis.forEach((k, i) => {
        const x = margem + i * larg;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(COR_CINZA);
        doc.text(k.label, x, y);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        doc.setTextColor(COR_NAVY);
        doc.text(String(k.value), x, y + 6);
      });
      y += 12;
    }

    // Tabela
    if (sec.headers && sec.rows) {
      autoTable(doc, {
        head: [sec.headers],
        body: sec.rows.map(r => r.map(c => String(c))),
        startY: y,
        margin: { left: margem, right: margem },
        styles: { fontSize: 8, cellPadding: 2, textColor: [10, 22, 40] },
        headStyles: { fillColor: [10, 22, 40], textColor: [255, 255, 255], fontStyle: 'bold' },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        theme: 'grid',
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    if (sec.note) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      doc.setTextColor(COR_CINZA);
      doc.text(sec.note, margem, y, { maxWidth: 210 - 2 * margem });
      y += 6;
    }
  }

  // Rodapé em cada página
  const totalPaginas = (doc as any).internal.getNumberOfPages();
  for (let p = 1; p <= totalPaginas; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COR_CINZA);
    doc.text(`TaxSphere · ${data.titulo}`, margem, 290);
    doc.text(`${p} / ${totalPaginas}`, 210 - margem, 290, { align: 'right' });
  }

  doc.save(fileName);
}

// ─── XLSX (SheetJS) ──────────────────────────────────────────────────────────
export function exportarRelatorioXLSX(data: ReportData, fileName: string) {
  const wb = XLSX.utils.book_new();

  // Aba "Resumo" — capa
  const capaRows: any[][] = [
    [data.titulo],
    [data.subtitulo || ''],
    [`Empresa: ${data.empresa || '—'}`],
    [`Gerado em: ${data.geradoEm}`],
    [],
  ];
  const capa = XLSX.utils.aoa_to_sheet(capaRows);
  capa['!cols'] = [{ wch: 80 }];
  // Aplica negrito na primeira linha
  if (capa['A1']) capa['A1'].s = { font: { bold: true, sz: 16, color: { rgb: '0A1628' } } };
  XLSX.utils.book_append_sheet(wb, capa, 'Resumo');

  // Uma aba por seção
  for (const sec of data.secoes) {
    const linhas: any[][] = [];
    if (sec.title) linhas.push([sec.title], []);
    if (sec.kpis && sec.kpis.length > 0) {
      linhas.push(['Indicador', 'Valor']);
      sec.kpis.forEach(k => linhas.push([k.label, k.value]));
      linhas.push([]);
    }
    if (sec.headers && sec.rows) {
      linhas.push(sec.headers);
      sec.rows.forEach(r => linhas.push(r));
    }
    if (sec.note) { linhas.push([], [sec.note]); }
    const ws = XLSX.utils.aoa_to_sheet(linhas);
    // larguras de colunas automáticas (aprox)
    const numCols = Math.max(...linhas.map(l => l.length));
    ws['!cols'] = Array(numCols).fill({ wch: 20 });
    const nome = (sec.title || 'Dados').substring(0, 30).replace(/[\/\\?*\[\]:]/g, '');
    XLSX.utils.book_append_sheet(wb, ws, nome);
  }

  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  saveAs(blob, fileName);
}

// ─── DOCX ────────────────────────────────────────────────────────────────────
export async function exportarRelatorioDOCX(data: ReportData, fileName: string) {
  const children: any[] = [];

  // Logo
  const logo = await carregarLogo();
  if (logo) {
    try {
      // Converte data URI para Uint8Array
      const base64 = logo.split(',')[1];
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      children.push(new Paragraph({
        children: [new ImageRun({ data: bytes, transformation: { width: 100, height: 35 }, type: 'png' })],
      }));
    } catch { /* ignore */ }
  }

  // Título
  children.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun({ text: data.titulo, bold: true, color: '0A1628', size: 32 })],
  }));
  if (data.subtitulo) {
    children.push(new Paragraph({
      children: [new TextRun({ text: data.subtitulo, color: '64748B', italics: true })],
    }));
  }
  if (data.empresa) {
    children.push(new Paragraph({
      children: [new TextRun({ text: `Empresa: ${data.empresa}`, color: '64748B', size: 20 })],
    }));
  }
  children.push(new Paragraph({
    children: [new TextRun({ text: `Gerado em: ${data.geradoEm}`, color: '64748B', size: 20 })],
  }));
  children.push(new Paragraph({ text: '' }));

  // Seções
  for (const sec of data.secoes) {
    if (sec.title) {
      children.push(new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun({ text: sec.title, bold: true, color: '0A1628', size: 26 })],
      }));
    }

    if (sec.kpis && sec.kpis.length > 0) {
      const kpiTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: sec.kpis.map(k => new TableCell({
              shading: { type: ShadingType.SOLID, color: 'F1F5F9', fill: 'F1F5F9' },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: k.label, size: 16, color: '64748B' })],
              })],
            })),
          }),
          new TableRow({
            children: sec.kpis.map(k => new TableCell({
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(k.value), bold: true, size: 26, color: '0A1628' })],
              })],
            })),
          }),
        ],
      });
      children.push(kpiTable);
      children.push(new Paragraph({ text: '' }));
    }

    if (sec.headers && sec.rows) {
      const allRows = [sec.headers, ...sec.rows];
      const tbl = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: allRows.map((r, idx) => new TableRow({
          children: r.map(cell => new TableCell({
            shading: idx === 0 ? { type: ShadingType.SOLID, color: '0A1628', fill: '0A1628' } : undefined,
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
            },
            children: [new Paragraph({
              children: [new TextRun({
                text: String(cell),
                bold: idx === 0,
                color: idx === 0 ? 'FFFFFF' : '0A1628',
                size: idx === 0 ? 18 : 16,
              })],
            })],
          })),
        })),
      });
      children.push(tbl);
      children.push(new Paragraph({ text: '' }));
    }

    if (sec.note) {
      children.push(new Paragraph({
        children: [new TextRun({ text: sec.note, italics: true, color: '64748B', size: 18 })],
      }));
    }
  }

  // Rodapé (linha final)
  children.push(new Paragraph({ text: '' }));
  children.push(new Paragraph({
    alignment: AlignmentType.RIGHT,
    children: [new TextRun({ text: 'TaxSphere · Sistema de gestão tributária', color: '64748B', size: 14, italics: true })],
  }));

  const doc = new Document({
    creator: 'TaxSphere',
    title: data.titulo,
    sections: [{ children }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
}

// Export "all-in-one" — escolhe pelo formato
export async function exportarRelatorio(
  formato: 'pdf' | 'docx' | 'xlsx',
  data: ReportData,
  nomeBase: string
) {
  const dataStr = new Date().toISOString().split('T')[0];
  const safeBase = nomeBase.replace(/[^\w\-]/g, '_');
  const fileName = `${safeBase}_${dataStr}.${formato}`;
  if (formato === 'pdf') return exportarRelatorioPDF(data, fileName);
  if (formato === 'xlsx') return exportarRelatorioXLSX(data, fileName);
  if (formato === 'docx') return exportarRelatorioDOCX(data, fileName);
}

// Suprime aviso de import não usado
void COR_BG_HEADER;
