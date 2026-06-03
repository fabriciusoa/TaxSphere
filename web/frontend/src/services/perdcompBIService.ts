import api from './api';

export interface BIKpis {
  total_documentos: number;
  total_empresas: number;
  valor_solicitado: number;
  credito_atualizado: number;
  credito_original: number;
  credito_utilizado: number;
  debitos_compensados: number;
  docs_com_recibo: number;
  docs_com_pdf: number;
  docs_legados: number;
  taxa_deferimento: number | null;
  tempo_medio_dias: number | null;
  tempo_mediana_dias: number | null;
  saldo_disponivel: number;
}

export interface BIStatusBucket   { chave: string; total: number; valor: number; }
export interface BIEvolucaoPoint  { mes: string; total: number; valor: number; }
export interface BICreditoTipo    { tipo: string; total: number; valor: number; }
export interface BIDocTipo        { tipo: string; total: number; }
export interface BITopEmpresa     { id_empresa: number; razao_social: string; total: number; valor: number; }
export interface BIFunil          { solicitado: number; atualizado: number; utilizado: number; disponivel: number; }
export interface BICompliance     {
  total_elegivel: number; com_recibo: number; com_pdf: number;
  sem_recibo: number; sem_pdf: number;
}

export interface BIPorEmpresaKpi {
  id_empresa: number; razao_social: string;
  total_documentos: number; credito_atualizado: number; valor_solicitado: number;
  credito_original: number; credito_utilizado: number; debitos_compensados: number;
}
export interface BIPorEmpresaEvolucao { id_empresa: number; razao_social: string; mes: string; total: number; valor: number; }
export interface BIPorEmpresaStatus   { id_empresa: number; razao_social: string; buckets: Record<string, number>; }
export interface BIPorEmpresaCredito  { id_empresa: number; razao_social: string; tipo: string; valor: number; }

export interface BIDashboardResponse {
  kpis: BIKpis;
  status_distribuicao: BIStatusBucket[];
  evolucao: BIEvolucaoPoint[];
  creditos_por_tipo: BICreditoTipo[];
  documentos_por_tipo: BIDocTipo[];
  top_empresas: BITopEmpresa[];
  funil: BIFunil;
  compliance: BICompliance;
  multi_empresa: boolean;
  por_empresa: null | {
    kpis: BIPorEmpresaKpi[];
    evolucao: BIPorEmpresaEvolucao[];
    status: BIPorEmpresaStatus[];
    creditos_por_tipo: BIPorEmpresaCredito[];
  };
}

export interface BIFiltros {
  id_empresa?: number | null;
  ids_empresas?: number[] | null;
  periodo_inicio?: string | null;
  periodo_fim?: string | null;
}

export const perdcompBIService = {
  dashboard: async (filtros: BIFiltros = {}): Promise<BIDashboardResponse> => {
    const params: Record<string, string> = {};
    if (filtros.ids_empresas && filtros.ids_empresas.length > 0) {
      params.ids_empresas = filtros.ids_empresas.join(',');
    } else if (filtros.id_empresa) {
      params.id_empresa = String(filtros.id_empresa);
    }
    if (filtros.periodo_inicio) params.periodo_inicio = filtros.periodo_inicio;
    if (filtros.periodo_fim)    params.periodo_fim    = filtros.periodo_fim;
    const { data } = await api.get('/perdcomp/bi/dashboard', { params });
    return data;
  },
};
