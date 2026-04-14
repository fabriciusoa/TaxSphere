import api from './api';

export interface DctfWebDeclaracao {
  id: number;
  id_empresa: number;
  razao_social?: string;
  cnpj?: string;
  categoria: string;
  periodo_apuracao: string;
  situacao: string;
  debito_apurado: number;
  credito_vinculado: number;
  saldo_pagar: number;
  data_transmissao: string | null;
  numero_recibo: string | null;
  origem: string;
  darf_gerado: number;
  darf_codigo: string | null;
  darf_vencimento: string | null;
  darf_valor: number | null;
  darf_pago: number;
  observacoes: string | null;
  criado_em: string;
  atualizado_em: string;
  tributos?: DctfWebTributo[];
}

export interface DctfWebTributo {
  id: number;
  id_declaracao: number;
  codigo_receita: string;
  descricao: string | null;
  valor_principal: number;
  valor_multa: number;
  valor_juros: number;
  valor_total: number;
  compensado: number;
  suspenso: number;
  saldo: number;
}

export interface DctfWebDashboard {
  totais: {
    total_declaracoes: number;
    ativas: number;
    em_andamento: number;
    retificadas: number;
    total_debito: number;
    total_credito: number;
    total_saldo: number;
    total_pago: number;
    total_pendente: number;
  };
  porPeriodo: Array<{ periodo_apuracao: string; qtd: number; debito: number; saldo: number }>;
  porSituacao: Array<{ situacao: string; qtd: number }>;
  vencimentos: Array<{
    id: number; periodo_apuracao: string; darf_vencimento: string;
    darf_valor: number; categoria: string; razao_social: string; cnpj: string;
  }>;
}

const dctfwebService = {
  dashboard: (idEmpresa?: number) =>
    api.get<DctfWebDashboard>('/dctfweb/dashboard', { params: { id_empresa: idEmpresa } }).then(r => r.data),

  listar: (params: { id_empresa?: number; situacao?: string; periodo?: string; busca?: string; page?: number; limit?: number }) =>
    api.get<{ data: DctfWebDeclaracao[]; pagination: { total: number; page: number; limit: number } }>(
      '/dctfweb/declaracoes', { params }
    ).then(r => r.data),

  buscarPorId: (id: number) =>
    api.get<DctfWebDeclaracao>(`/dctfweb/declaracoes/${id}`).then(r => r.data),

  criar: (data: Partial<DctfWebDeclaracao>) =>
    api.post<DctfWebDeclaracao>('/dctfweb/declaracoes', data).then(r => r.data),

  atualizar: (id: number, data: Partial<DctfWebDeclaracao>) =>
    api.put<DctfWebDeclaracao>(`/dctfweb/declaracoes/${id}`, data).then(r => r.data),

  excluir: (id: number) =>
    api.delete(`/dctfweb/declaracoes/${id}`).then(r => r.data),

  gerarDarf: (id: number, data: { codigo?: string; vencimento?: string; valor?: number }) =>
    api.post(`/dctfweb/declaracoes/${id}/darf`, data).then(r => r.data),

  marcarPago: (id: number) =>
    api.put(`/dctfweb/declaracoes/${id}/pago`).then(r => r.data),
};

export default dctfwebService;
