/**
 * Regras de negócio oficiais da DCTFWeb conforme Manual de Orientação
 * publicado pela Receita Federal — atualização Janeiro/2025.
 *
 * Implementa:
 *   • CATEGORIAS oficiais (cap. 8.1)
 *   • TIPOS e SUBTIPOS (cap. 8.3)
 *   • SITUAÇÕES (cap. 8.4)
 *   • ORIGENS dos débitos (cap. 8.2)
 *   • PRAZO LEGAL por categoria (cap. 4.2)
 *   • MAED — Multa por Atraso na Entrega (cap. 5.1, 5.3, 5.4)
 *   • DETECÇÃO DE IMPEDIMENTO DE CND (cap. 17)
 *
 * Toda regra aqui tem referência ao item correspondente do manual no comentário,
 * permitindo auditoria rápida quando a Receita atualizar a normativa.
 */

// ────────────────────────────────────────────────────────────────────────────
// CATEGORIAS (manual cap. 8.1)
// ────────────────────────────────────────────────────────────────────────────
export const CATEGORIAS_DCTFWEB = {
  GERAL:                   { label: 'Geral',                 periodicidade: 'mensal',  descricao: 'DCTFWeb mensal' },
  GERAL_PF:                { label: 'Geral PF',              periodicidade: 'mensal',  descricao: 'DCTFWeb mensal de empregador pessoa física equiparada a empresa' },
  DECIMO_TERCEIRO:         { label: '13º Salário',           periodicidade: 'anual',   descricao: 'DCTFWeb anual — Gratificação Natalina' },
  DECIMO_TERCEIRO_PF:      { label: '13º Salário PF',        periodicidade: 'anual',   descricao: 'DCTFWeb anual — Gratificação Natalina (PF equiparada)' },
  ESPETACULO_DESPORTIVO:   { label: 'Espetáculo Desportivo', periodicidade: 'diaria',  descricao: 'DCTFWeb diária — evento desportivo de equipe de futebol profissional' },
  AFERICAO:                { label: 'Aferição',              periodicidade: 'mensal',  descricao: 'DCTFWeb gerada a partir do Sero — regularização de obras' },
  RECLAMATORIA_TRABALHISTA: { label: 'Reclamatória Trabalhista', periodicidade: 'mensal', descricao: 'DCTFWeb gerada a partir de reclamatória trabalhista no eSocial' },
} as const;

export type CategoriaDctfweb = keyof typeof CATEGORIAS_DCTFWEB;

// ────────────────────────────────────────────────────────────────────────────
// TIPOS (manual cap. 8.3)
// ────────────────────────────────────────────────────────────────────────────
export const TIPOS_DCTFWEB = {
  ORIGINAL:     { label: 'Original',     descricao: 'Primeira declaração entregue para um PA/Categoria' },
  RETIFICADORA: { label: 'Retificadora', descricao: 'Substitui outra declaração entregue' },
  EXCLUSAO:     { label: 'Exclusão',     descricao: 'Exclui declaração entregue (não aplicável a Geral/13º)' },
} as const;

export const SUBTIPOS_DCTFWEB = {
  COM_DEBITOS:        { label: 'Com débitos',        descricao: 'Confessa ao menos um débito' },
  SEM_DEBITOS_ZERADA: { label: 'Sem débitos (zerada)', descricao: 'Sem débitos, mas há créditos (salário-família, etc.)' },
  SEM_MOVIMENTO:      { label: 'Sem movimento',      descricao: 'Não houve fatos geradores' },
} as const;

// ────────────────────────────────────────────────────────────────────────────
// SITUAÇÕES (manual cap. 8.4)
// ────────────────────────────────────────────────────────────────────────────
export const SITUACOES_DCTFWEB = {
  EM_ANDAMENTO: { label: 'Em andamento', cor: 'amber',  descricao: 'Não transmitida, passível de edição' },
  ATIVA:        { label: 'Ativa',        cor: 'emerald', descricao: 'Transmitida, tratada pela RFB e válida' },
  RETIFICADA:   { label: 'Retificada',   cor: 'purple', descricao: 'Alterada pela entrega de retificadora' },
  EXCLUIDA:     { label: 'Excluída',     cor: 'gray',   descricao: 'Excluída por declaração de exclusão' },
  INDEVIDA:     { label: 'Indevida',     cor: 'red',    descricao: 'Excluída mediante procedimento de ofício da RFB' },
  FASEAMENTO:   { label: 'Faseamento',   cor: 'gray',   descricao: 'PA anterior à obrigatoriedade da DCTFWeb' },
} as const;

export type SituacaoDctfweb = keyof typeof SITUACOES_DCTFWEB;

// ────────────────────────────────────────────────────────────────────────────
// ORIGENS dos débitos (manual cap. 8.2)
// ────────────────────────────────────────────────────────────────────────────
export const ORIGENS_DEBITOS = {
  ESOCIAL:   { label: 'eSocial',        descricao: 'Contribuições previdenciárias, terceiros, IRRF trabalho' },
  REINF_CP:  { label: 'EFD-Reinf CP',   descricao: 'Série R-2000: contribuições previdenciárias substitutivas' },
  REINF_RET: { label: 'EFD-Reinf RET',  descricao: 'Série R-4000: retenções IRRF, CSLL, COFINS, PIS' },
  MIT:       { label: 'MIT',            descricao: 'Módulo de Inclusão de Tributos: IRPJ, CSLL, IPI, IOF, PIS, COFINS, CIDE, CPSS' },
  SERO:      { label: 'Sero',           descricao: 'Aferição de obras de construção civil' },
} as const;

// ────────────────────────────────────────────────────────────────────────────
// PRAZO LEGAL (manual cap. 4.2)
// ────────────────────────────────────────────────────────────────────────────
const FERIADOS_FEDERAIS: Record<string, string[]> = {
  // Mapeamento mínimo de feriados federais para cálculo de dia útil.
  // Para precisão total, integrar com fonte oficial (Anbima/BACEN). Mantemos aqui
  // os feriados fixos + alguns móveis dos últimos anos como aproximação.
  '2024': ['2024-01-01', '2024-02-12', '2024-02-13', '2024-03-29', '2024-04-21', '2024-05-01', '2024-05-30', '2024-09-07', '2024-10-12', '2024-11-02', '2024-11-15', '2024-11-20', '2024-12-25'],
  '2025': ['2025-01-01', '2025-03-03', '2025-03-04', '2025-04-18', '2025-04-21', '2025-05-01', '2025-06-19', '2025-09-07', '2025-10-12', '2025-11-02', '2025-11-15', '2025-11-20', '2025-12-25'],
  '2026': ['2026-01-01', '2026-02-16', '2026-02-17', '2026-04-03', '2026-04-21', '2026-05-01', '2026-06-04', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25'],
};

function isFeriado(d: Date): boolean {
  const ano = String(d.getFullYear());
  const iso = d.toISOString().slice(0, 10);
  return (FERIADOS_FEDERAIS[ano] || []).includes(iso);
}

function isDiaUtil(d: Date): boolean {
  const dow = d.getDay(); // 0=Dom, 6=Sáb
  if (dow === 0 || dow === 6) return false;
  return !isFeriado(d);
}

/** Último dia útil do mês X/AAAA. */
function ultimoDiaUtilDoMes(ano: number, mes: number): Date {
  const ult = new Date(Date.UTC(ano, mes, 0)); // 0 = último dia do mês anterior + indexação
  // Recua até cair em dia útil
  while (!isDiaUtil(ult)) ult.setUTCDate(ult.getUTCDate() - 1);
  return ult;
}

/**
 * Calcula o prazo legal de entrega da DCTFWeb conforme cap. 4.2 do manual.
 *
 * @param categoria  ex: 'GERAL', 'DECIMO_TERCEIRO', 'ESPETACULO_DESPORTIVO', 'AFERICAO', 'RECLAMATORIA_TRABALHISTA'
 * @param periodoApuracao  formato 'MM/AAAA'
 * @param dataEvento  obrigatório para ESPETACULO_DESPORTIVO (data do evento)
 * @returns Date com o prazo legal de entrega
 */
export function calcularPrazoLegal(
  categoria: CategoriaDctfweb,
  periodoApuracao: string,
  dataEvento?: Date,
): Date | null {
  const m = periodoApuracao.match(/^(\d{2})\/(\d{4})$/);
  if (!m && categoria !== 'ESPETACULO_DESPORTIVO') return null;
  const mes = m ? parseInt(m[1], 10) : 0;
  const ano = m ? parseInt(m[2], 10) : 0;

  switch (categoria) {
    case 'GERAL':
    case 'GERAL_PF':
    case 'RECLAMATORIA_TRABALHISTA':
      // Último dia útil do mês SEGUINTE ao de apuração
      return ultimoDiaUtilDoMes(ano, mes + 1);

    case 'AFERICAO':
      // Último dia útil do mês EM QUE OCORRE A AFERIÇÃO (manual diz "mês em que se realizar a aferição")
      // Tratamos como mesmo mês do PA (heurística — ajustar quando tivermos data exata de aferição)
      return ultimoDiaUtilDoMes(ano, mes);

    case 'DECIMO_TERCEIRO':
    case 'DECIMO_TERCEIRO_PF':
      // Sempre dia 20 de dezembro do exercício de apuração
      return new Date(Date.UTC(ano, 11, 20));

    case 'ESPETACULO_DESPORTIVO': {
      if (!dataEvento) return null;
      // 2º dia útil após a data do evento
      const d = new Date(dataEvento);
      let uteisContados = 0;
      while (uteisContados < 2) {
        d.setUTCDate(d.getUTCDate() + 1);
        if (isDiaUtil(d)) uteisContados++;
      }
      return d;
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────
// MAED — Multa por Atraso na Entrega da Declaração (manual cap. 5.1, 5.3, 5.4)
// ────────────────────────────────────────────────────────────────────────────
export interface MaedCalculo {
  multa_bruta: number;
  multa_minima_aplicada: boolean;
  porcentual_aplicado: number;          // 0..0.20 (cap. 5.1: limite 20%)
  meses_em_atraso: number;
  com_reducao: { tipo: 'a' | 'b' | null; multa_final: number };
  observacao?: string;
}

interface MaedInput {
  debito_apurado: number;
  dias_atraso: number;
  sem_movimento?: boolean;           // declaração SEM_MOVIMENTO usa multa mínima menor
  regime?: 'MEI' | 'ME_EPP_SIMPLES' | 'NORMAL';
  apresentada_apos_oficio?: boolean; // false = item (a) cap. 5.4 → 50% redução
  apresentada_no_prazo_intimacao?: boolean; // true = item (b) cap. 5.4 → 25% redução
}

/**
 * Calcula a MAED conforme manual:
 *   • 2% ao mês-calendário ou fração sobre montante das contribuições (cap. 5.1)
 *   • Limite: 20% do valor (cap. 5.1)
 *   • Multa mínima:
 *       - R$ 200 se SEM_MOVIMENTO (omissão sem fatos geradores)
 *       - R$ 500 nos demais casos
 *     Reduções: 90% para MEI, 50% para ME/EPP Simples (cap. 5.3)
 *   • Reduções gerais (cap. 5.4):
 *       (a) 50% se apresentada após prazo MAS antes de procedimento de ofício
 *       (b) 25% se apresentada no prazo fixado em intimação
 */
export function calcularMaed(input: MaedInput): MaedCalculo {
  const { debito_apurado, dias_atraso, sem_movimento = false, regime = 'NORMAL',
          apresentada_apos_oficio = false, apresentada_no_prazo_intimacao = false } = input;

  if (dias_atraso <= 0) {
    return { multa_bruta: 0, multa_minima_aplicada: false, porcentual_aplicado: 0, meses_em_atraso: 0, com_reducao: { tipo: null, multa_final: 0 } };
  }

  // Meses de atraso = qtd meses-calendário ou fração (mín 1, máx 10 para chegar a 20%)
  const meses = Math.min(10, Math.ceil(dias_atraso / 30));
  const porcentual = Math.min(0.20, 0.02 * meses);
  let multa = debito_apurado * porcentual;

  // Multa mínima (cap. 5.3)
  const minimaBase = sem_movimento ? 200 : 500;
  const reducaoRegime = regime === 'MEI' ? 0.10 : regime === 'ME_EPP_SIMPLES' ? 0.50 : 1.00;
  const minimaAplicavel = minimaBase * reducaoRegime;
  const minimaAplicada = multa < minimaAplicavel;
  if (minimaAplicada) multa = minimaAplicavel;

  // Reduções gerais (cap. 5.4) — observada a multa mínima
  let multaFinal = multa;
  let tipoReducao: 'a' | 'b' | null = null;
  if (apresentada_no_prazo_intimacao) {
    multaFinal = Math.max(minimaAplicavel, multa * 0.75); // -25%
    tipoReducao = 'b';
  } else if (!apresentada_apos_oficio) {
    multaFinal = Math.max(minimaAplicavel, multa * 0.50); // -50%
    tipoReducao = 'a';
  }

  return {
    multa_bruta: Math.round(multa * 100) / 100,
    multa_minima_aplicada: minimaAplicada,
    porcentual_aplicado: porcentual,
    meses_em_atraso: meses,
    com_reducao: { tipo: tipoReducao, multa_final: Math.round(multaFinal * 100) / 100 },
    observacao: tipoReducao === 'a' ? 'Redução de 50% — apresentada antes de procedimento de ofício'
              : tipoReducao === 'b' ? 'Redução de 25% — apresentada no prazo da intimação'
              : minimaAplicada ? 'Multa mínima aplicada' : undefined,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// IMPEDIMENTO DE CND (manual cap. 17.1.1)
// ────────────────────────────────────────────────────────────────────────────
/**
 * Determina se a empresa tem DCTFWeb retificadora pendente que vai impedir
 * emissão de CND/CPD-EN. Caso típico: nova escrituração eSocial gerou
 * retificadora em "em andamento" mas o usuário não transmitiu.
 */
export function detectaImpedimentoCnd(decl: {
  tipo: string;
  situacao_normalizada: string;
  id_declaracao_original: number | null;
}): { impede: boolean; motivo: string } {
  if (decl.tipo === 'RETIFICADORA' && decl.situacao_normalizada === 'EM_ANDAMENTO') {
    return {
      impede: true,
      motivo: 'Retificadora em andamento sem transmissão. A omissão impede emissão de CND/CPD-EN (manual cap. 17.1.1).',
    };
  }
  return { impede: false, motivo: '' };
}

// ────────────────────────────────────────────────────────────────────────────
// NORMALIZAÇÃO DE TEXTOS DO E-CAC
// ────────────────────────────────────────────────────────────────────────────
export function normalizarCategoria(texto: string | null | undefined): CategoriaDctfweb {
  if (!texto) return 'GERAL';
  const t = texto.toLowerCase();
  if (t.includes('13') || t.includes('décimo') || t.includes('decimo') || t.includes('natalina')) {
    return t.includes('pf') ? 'DECIMO_TERCEIRO_PF' : 'DECIMO_TERCEIRO';
  }
  if (t.includes('desportivo') || t.includes('espetáculo') || t.includes('espetaculo')) return 'ESPETACULO_DESPORTIVO';
  if (t.includes('aferi')) return 'AFERICAO';
  if (t.includes('reclamat')) return 'RECLAMATORIA_TRABALHISTA';
  if (t.includes('pf')) return 'GERAL_PF';
  return 'GERAL';
}

export function normalizarSituacao(texto: string | null | undefined): SituacaoDctfweb {
  if (!texto) return 'EM_ANDAMENTO';
  const t = texto.toLowerCase();
  if (t.includes('andam') || t.includes('edi')) return 'EM_ANDAMENTO';
  if (t.includes('ativ'))                       return 'ATIVA';
  if (t.includes('retif'))                      return 'RETIFICADA';
  if (t.includes('exclu') && !t.includes('inde')) return 'EXCLUIDA';
  if (t.includes('inde'))                       return 'INDEVIDA';
  if (t.includes('fasea'))                      return 'FASEAMENTO';
  return 'EM_ANDAMENTO';
}

export function normalizarTipo(texto: string | null | undefined): 'ORIGINAL' | 'RETIFICADORA' | 'EXCLUSAO' {
  if (!texto) return 'ORIGINAL';
  const t = texto.toLowerCase();
  if (t.includes('retif')) return 'RETIFICADORA';
  if (t.includes('exclu')) return 'EXCLUSAO';
  return 'ORIGINAL';
}

// ────────────────────────────────────────────────────────────────────────────
// AGREGADOS úteis para o dashboard
// ────────────────────────────────────────────────────────────────────────────
/**
 * Para a tela inicial padrão (manual cap. 7): por padrão exibe declarações
 * "Em andamento" + "Ativas com saldo a pagar transmitidas nos últimos 30 dias".
 */
export function filtroPadraoTelaInicial(): string {
  return `(
    situacao_normalizada = 'EM_ANDAMENTO'
    OR (situacao_normalizada = 'ATIVA' AND saldo_pagar > 0 AND data_transmissao > CURRENT_DATE - INTERVAL '30 days')
  )`;
}
