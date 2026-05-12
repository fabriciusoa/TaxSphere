import api from './api';

export type StatusNormalizado =
  | 'EM_ANALISE' | 'DEFERIDO' | 'PARCIALMENTE_DEFERIDO' | 'INDEFERIDO'
  | 'HOMOLOGADO' | 'NAO_HOMOLOGADO' | 'PARCIALMENTE_HOMOLOGADO'
  | 'CANCELADO' | 'RETIFICADO' | 'PENDENTE_DECISAO' | 'DESCONHECIDO';

export const STATUS_LABELS: Record<StatusNormalizado, string> = {
  EM_ANALISE: 'Em Análise',
  DEFERIDO: 'Deferido',
  PARCIALMENTE_DEFERIDO: 'Parcialmente Deferido',
  INDEFERIDO: 'Indeferido',
  HOMOLOGADO: 'Homologado',
  NAO_HOMOLOGADO: 'Não Homologado',
  PARCIALMENTE_HOMOLOGADO: 'Parcialmente Homologado',
  CANCELADO: 'Cancelado',
  RETIFICADO: 'Retificado',
  PENDENTE_DECISAO: 'Pendente de Decisão',
  DESCONHECIDO: 'Desconhecido',
};

export const STATUS_COLORS: Record<StatusNormalizado, 'success' | 'warning' | 'error' | 'info' | 'default'> = {
  EM_ANALISE: 'info',
  DEFERIDO: 'success',
  PARCIALMENTE_DEFERIDO: 'success',
  INDEFERIDO: 'error',
  HOMOLOGADO: 'success',
  NAO_HOMOLOGADO: 'error',
  PARCIALMENTE_HOMOLOGADO: 'warning',
  CANCELADO: 'error',
  RETIFICADO: 'warning',
  PENDENTE_DECISAO: 'info',
  DESCONHECIDO: 'default',
};

export interface SaldoDisponivel {
  id: number;
  id_empresa: number;
  numero_perdcomp_origem: string;
  tipo_credito: string;
  exercicio: string;
  periodo_apuracao: string | null;
  valor_saldo_negativo: number;
  selic_acumulada: number;
  credito_atualizado: number;
  total_utilizado: number;
  saldo_disponivel: number;
  data_entrega_pedido: string | null;
  data_prescricao: string | null;
  status_normalizado: StatusNormalizado;
  origem: string;
  dias_para_prescricao: number | null;
  percentual_utilizado: number;
  razao_social: string;
  cnpj: string;
}

export interface DashboardRelatorio {
  saldos: { quantidade: number; total_atualizado: number; total_utilizado: number; total_disponivel: number; ativos: number };
  documentos_por_status: { status: StatusNormalizado; label: string; quantidade: number; valor: number }[];
  prescricao: {
    criticos_30d: number; urgentes_90d: number; proximos_365d: number; prescritos: number;
    valor_critico_90d: number;
  };
  retrabalho: { total: number; retificadores: number; indice_pct: number };
  em_risco: { quantidade: number; valor: number };
}

export interface PrescricaoRelatorio {
  itens: any[];
  buckets: {
    prescritos: { quantidade: number; valor: number };
    critico_30: { quantidade: number; valor: number };
    urgente_90: { quantidade: number; valor: number };
    atencao_180: { quantidade: number; valor: number };
    proximo_365: { quantidade: number; valor: number };
  };
  totais: { quantidade: number; valor: number };
}

export interface RetrabalhoRelatorio {
  resumo: {
    total_documentos: number;
    total_retificadores: number;
    total_retificados: number;
    documentos_originais_retificados: number;
    indice_retrabalho_pct: number;
  };
  por_empresa: { id: number; razao_social: string; cnpj: string; total: number; retificadores: number; indice_retrabalho_pct: number }[];
  detalhamento: any[];
}

export interface CompensacoesRiscoRelatorio {
  itens: any[];
  totais: { quantidade: number; valor_em_risco: number };
}

export type StatusAtencao = 'PRESCRITO' | 'URGENTE_6M' | 'ATENCAO_1A' | 'AVISO_2A' | 'OK';

export interface ControleConsolidadoLinha {
  perdcomp_inicial: string;
  empresa: string;
  cnpj: string;
  ano_base: string | null;
  competencia: string | null;
  data_prescricao: string | null;
  dias_para_prescricao: number | null;
  status_atencao: StatusAtencao;
  tipo_credito: string;
  valor_credito_inicial: number;
  valor_credito_utilizado: number;
  saldo_credito: number;
  selic_acumulada_pct: number;
  saldo_credito_atualizado: number;
  deb_irpj: number;
  deb_csll: number;
  deb_cofins: number;
  deb_pis: number;
  deb_inss: number;
  deb_irrf: number;
  total_debitos: number;
  qtd_perdcomps: number;
  qtd_retificados: number;
  status_normalizado: string;
}

export interface ControleConsolidadoTotais {
  qtd_creditos: number;
  valor_credito_inicial: number;
  valor_credito_utilizado: number;
  saldo_credito: number;
  saldo_credito_atualizado: number;
  deb_irpj: number;
  deb_csll: number;
  deb_cofins: number;
  deb_pis: number;
  deb_inss: number;
  deb_irrf: number;
  total_debitos: number;
  qtd_perdcomps: number;
}

export const perdcompRelatoriosService = {
  dashboard: async (idEmpresa?: number): Promise<DashboardRelatorio> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/perdcomp/relatorios/dashboard${params}`);
    return data;
  },

  saldosDisponiveis: async (idEmpresa?: number): Promise<{ saldos: SaldoDisponivel[]; totais: any }> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/perdcomp/relatorios/saldos-disponiveis${params}`);
    return data;
  },

  prescricao: async (idEmpresa?: number, diasLimite = 365): Promise<PrescricaoRelatorio> => {
    const params = new URLSearchParams();
    if (idEmpresa) params.append('id_empresa', String(idEmpresa));
    params.append('dias_limite', String(diasLimite));
    const { data } = await api.get(`/perdcomp/relatorios/prescricao?${params}`);
    return data;
  },

  retrabalho: async (idEmpresa?: number): Promise<RetrabalhoRelatorio> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/perdcomp/relatorios/retrabalho${params}`);
    return data;
  },

  compensacoesEmRisco: async (idEmpresa?: number): Promise<CompensacoesRiscoRelatorio> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/perdcomp/relatorios/compensacoes-em-risco${params}`);
    return data;
  },

  /**
   * Controle Consolidado: reproduz a "Tabela1" da planilha de gestão (24 colunas).
   * Cada linha = 1 crédito, com débitos compensados agrupados por tributo.
   */
  controleConsolidado: async (idEmpresa?: number, statusAtencao?: string): Promise<{
    creditos: ControleConsolidadoLinha[];
    totais: ControleConsolidadoTotais;
    distribuicao_atencao: Record<string, number>;
  }> => {
    const params = new URLSearchParams();
    if (idEmpresa) params.append('id_empresa', String(idEmpresa));
    if (statusAtencao) params.append('status_atencao', statusAtencao);
    const qs = params.toString();
    const { data } = await api.get(`/perdcomp/relatorios/controle-consolidado${qs ? '?' + qs : ''}`);
    return data;
  },
};
