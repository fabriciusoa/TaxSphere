import api from './api';

const BASE = '/perdcomp/documentos';

export interface PerdcompDocumento {
  id: number;
  id_empresa: number;
  id_certificado?: number;
  id_usuario_criador?: number;
  numero?: string;
  tipo_documento: string;
  tipo_credito: string;
  titularidade: string;
  status: string;
  data_transmissao?: string;
  protocolo_transmissao?: string;
  observacoes?: string;
  dar_numero?: string;
  dar_data_arrecadacao?: string;
  criado_em: string;
  atualizado_em: string;
  // joined
  empresa_razao_social?: string;
  empresa_cnpj?: string;
  usuario_nome?: string;
  cert_cn?: string;
  cert_validade?: string;
  total_debitos?: number;
  // nested
  credito?: CreditoTributario;
  debitos?: DebitoPerdcomp[];
  responsavel?: ResponsavelPreenchimento;
  historico?: HistoricoStatus[];
  recibos?: Recibo[];
}

export interface CreditoTributario {
  id: number;
  id_perdcomp: number;
  cnpj_detentor: string;
  codigo_receita: string;
  denominacao_receita?: string;
  periodo_apuracao: string;
  data_arrecadacao?: string;
  data_vencimento?: string;
  valor_original_inicial: number;
  valor_principal: number;
  valor_utilizado: number;
  selic_acumulada: number;
  credito_atualizado: number;
  total_debitos_documento: number;
  total_credito_utilizado: number;
  saldo_credito_original: number;
}

export interface DebitoPerdcomp {
  id: number;
  id_perdcomp: number;
  ordem: number;
  grupo_tributo: string;
  tipo_debito: string;
  cnpj_detentor: string;
  codigo_receita: string;
  denominacao_receita?: string;
  periodicidade?: string;
  periodo_apuracao: string;
  data_vencimento: string;
  valor_principal: number;
  multa: number;
  juros: number;
  valor_total: number;
  controlado_em_processo: boolean;
  numero_processo?: string;
}

export interface ResponsavelPreenchimento {
  id: number;
  id_perdcomp: number;
  cpf: string;
  nome: string;
  telefone_fixo?: string;
  telefone_celular?: string;
  email?: string;
  crc?: string;
  uf_crc?: string;
}

export interface HistoricoStatus {
  id: number;
  id_perdcomp: number;
  status_anterior: string;
  status_novo: string;
  observacao?: string;
  origem_atualizacao: string;
  usuario_nome?: string;
  criado_em: string;
}

export interface Recibo {
  id: number;
  id_perdcomp: number;
  numero_controle?: string;
  numero_perdcomp?: string;
  data_transmissao?: string;
  tipo_documento?: string;
  tipo_credito?: string;
  valor_pedido?: number;
  versao?: string;
  nome_representante?: string;
  cpf_representante?: string;
  telefone?: string;
  email?: string;
  observacoes?: string;
  criado_em: string;
}

export const TIPOS_DOCUMENTO = [
  { value: 'PEDIDO_RESTITUICAO', label: 'PER — Pedido de Restituição' },
  { value: 'DECLARACAO_COMPENSACAO', label: 'DCOMP — Declaração de Compensação' },
  { value: 'PEDIDO_RESSARCIMENTO', label: 'Pedido de Ressarcimento' },
  { value: 'PEDIDO_REEMBOLSO', label: 'Pedido de Reembolso' },
];

export const TIPOS_CREDITO = [
  { value: 'PAGAMENTO_INDEVIDO_OU_A_MAIOR', label: 'Pagamento Indevido ou a Maior' },
  { value: 'SALDO_NEGATIVO_IRPJ', label: 'Saldo Negativo de IRPJ' },
  { value: 'SALDO_NEGATIVO_CSLL', label: 'Saldo Negativo de CSLL' },
  { value: 'COFINS_EXPORTACAO', label: 'COFINS — Exportação' },
  { value: 'PIS_EXPORTACAO', label: 'PIS/PASEP — Exportação' },
  { value: 'IPI_EXPORTACAO', label: 'IPI — Exportação' },
  { value: 'OUTROS', label: 'Outros' },
];

export const GRUPOS_TRIBUTO = [
  'COFINS', 'PIS_PASEP', 'CSLL', 'IRPJ', 'IRRF', 'IPI', 'IOF', 'CIDE',
  'CP_PATRONAL', 'CP_SEGURADOS', 'CP_TERCEIROS', 'CPRB', 'CPSSS', 'COSIRF',
  'CSRF', 'MULTA_JUROS', 'LANCAMENTO_OFICIO', 'OUTRAS_RECEITAS', 'SIMPLES',
];

export const STATUS_LABELS: Record<string, { label: string; color: 'default' | 'warning' | 'info' | 'success' | 'error' | 'primary' }> = {
  RASCUNHO: { label: 'Rascunho', color: 'default' },
  VALIDADO: { label: 'Validado', color: 'info' },
  AGUARDANDO_ENVIO: { label: 'Aguard. Envio', color: 'warning' },
  ENVIANDO: { label: 'Enviando', color: 'warning' },
  ERRO_ENVIO: { label: 'Erro Envio', color: 'error' },
  TRANSMITIDO: { label: 'Transmitido', color: 'primary' },
  EM_PROCESSAMENTO: { label: 'Em Processamento', color: 'info' },
  RETIFICADO: { label: 'Retificado', color: 'default' },
  CANCELADO: { label: 'Cancelado', color: 'error' },
  PER_DEFERIDO: { label: 'Deferido', color: 'success' },
  PER_INDEFERIDO: { label: 'Indeferido', color: 'error' },
  DESPACHO_DECISORIO_EMITIDO: { label: 'Despacho Emitido', color: 'info' },
  COMPENSACAO_DECLARADA: { label: 'Comp. Declarada', color: 'success' },
  COMPENSACAO_NAO_DECLARADA: { label: 'Comp. Não Declarada', color: 'error' },
};

export const perdcompDocumentosService = {
  async listar(params?: {
    id_empresa?: number; tipo_documento?: string; tipo_credito?: string;
    status?: string; numero?: string; page?: number; limit?: number;
  }) {
    const res = await api.get(BASE, { params });
    return res.data as { data: PerdcompDocumento[]; pagination: any };
  },

  async buscarPorId(id: number) {
    const res = await api.get(`${BASE}/${id}`);
    return res.data as PerdcompDocumento;
  },

  async criar(data: Partial<PerdcompDocumento> & { credito?: any; debitos?: any[]; responsavel?: any }) {
    const res = await api.post(BASE, data);
    return res.data as PerdcompDocumento;
  },

  async atualizar(id: number, data: Partial<PerdcompDocumento>) {
    const res = await api.put(`${BASE}/${id}`, data);
    return res.data as PerdcompDocumento;
  },

  async atualizarStatus(id: number, status: string, params?: { observacao?: string; numero?: string; protocolo_transmissao?: string }) {
    const res = await api.patch(`${BASE}/${id}/status`, { status, ...params });
    return res.data as PerdcompDocumento;
  },

  async excluir(id: number) {
    await api.delete(`${BASE}/${id}`);
  },

  async historico(id: number) {
    const res = await api.get(`${BASE}/${id}/historico`);
    return res.data as HistoricoStatus[];
  },

  async salvarCredito(id: number, credito: Partial<CreditoTributario>) {
    const res = await api.put(`${BASE}/${id}/credito`, credito);
    return res.data as CreditoTributario;
  },

  async listarDebitos(id: number) {
    const res = await api.get(`${BASE}/${id}/debitos`);
    return res.data as DebitoPerdcomp[];
  },

  async criarDebito(id: number, debito: Partial<DebitoPerdcomp>) {
    const res = await api.post(`${BASE}/${id}/debitos`, debito);
    return res.data as DebitoPerdcomp;
  },

  async atualizarDebito(id: number, debitoId: number, debito: Partial<DebitoPerdcomp>) {
    const res = await api.put(`${BASE}/${id}/debitos/${debitoId}`, debito);
    return res.data as DebitoPerdcomp;
  },

  async excluirDebito(id: number, debitoId: number) {
    await api.delete(`${BASE}/${id}/debitos/${debitoId}`);
  },

  async salvarResponsavel(id: number, responsavel: Partial<ResponsavelPreenchimento>) {
    const res = await api.put(`${BASE}/${id}/responsavel`, responsavel);
    return res.data as ResponsavelPreenchimento;
  },

  async listarRecibos(id: number) {
    const res = await api.get(`${BASE}/${id}/recibos`);
    return res.data as Recibo[];
  },

  async criarRecibo(id: number, recibo: Partial<Recibo>) {
    const res = await api.post(`${BASE}/${id}/recibos`, recibo);
    return res.data as Recibo;
  },

  async excluirRecibo(id: number, reciboId: number) {
    await api.delete(`${BASE}/${id}/recibos/${reciboId}`);
  },
};

// Saldos
export interface SaldoCredito {
  id: number;
  id_empresa: number;
  numero_perdcomp_origem?: string;
  tipo_credito: string;
  exercicio: string;
  periodo_apuracao?: string;
  valor_saldo_negativo: number;
  selic_acumulada: number;
  credito_atualizado: number;
  total_utilizado: number;
  saldo_disponivel: number;
  saldo_calculado?: number;
  percentual_utilizado?: number;
  origem: string;
  observacoes?: string;
  data_referencia: string;
  razao_social?: string;
  cnpj?: string;
}

export const saldosCreditoService = {
  async listar(params?: { id_empresa?: number; tipo_credito?: string; exercicio?: string }) {
    const res = await api.get('/perdcomp/saldos', { params });
    return res.data as SaldoCredito[];
  },

  async resumo(id_empresa: number) {
    const res = await api.get(`/perdcomp/saldos/resumo/${id_empresa}`);
    return res.data;
  },

  async criar(data: Partial<SaldoCredito>) {
    const res = await api.post('/perdcomp/saldos', data);
    return res.data as SaldoCredito;
  },

  async criarLote(items: Partial<SaldoCredito>[]) {
    const res = await api.post('/perdcomp/saldos/lote', items);
    return res.data;
  },

  async atualizar(id: number, data: Partial<SaldoCredito>) {
    const res = await api.put(`/perdcomp/saldos/${id}`, data);
    return res.data as SaldoCredito;
  },

  async excluir(id: number) {
    await api.delete(`/perdcomp/saldos/${id}`);
  },

  async listarMovimentacoes(id: number) {
    const res = await api.get(`/perdcomp/saldos/${id}/movimentacoes`);
    return res.data;
  },

  async criarMovimentacao(id: number, data: { tipo: string; valor: number; descricao?: string; id_perdcomp?: number; numero_perdcomp?: string }) {
    const res = await api.post(`/perdcomp/saldos/${id}/movimentacoes`, data);
    return res.data;
  },
};

// Jobs
export interface JobExecucao {
  id: number;
  tipo: string;
  status: string;
  id_perdcomp?: number;
  id_certificado: number;
  tentativas: number;
  max_tentativas: number;
  erro?: string;
  screenshot_paths?: string;
  iniciado_em?: string;
  finalizado_em?: string;
  proxima_tentativa?: string;
  criado_em: string;
  perdcomp_numero?: string;
  tipo_documento?: string;
  cert_cn?: string;
  razao_social?: string;
  cnpj?: string;
}

export const perdcompJobsService = {
  async listar(params?: { tipo?: string; status?: string; id_certificado?: number; page?: number; limit?: number }) {
    const res = await api.get('/perdcomp/jobs', { params });
    return res.data as { data: JobExecucao[]; resumo: Record<string, number>; pagination: any };
  },

  async buscarPorId(id: number) {
    const res = await api.get(`/perdcomp/jobs/${id}`);
    return res.data as JobExecucao;
  },

  async criar(data: { tipo: string; id_certificado: number; id_perdcomp?: number; max_tentativas?: number }) {
    const res = await api.post('/perdcomp/jobs', data);
    return res.data as JobExecucao;
  },

  async retentar(id: number) {
    const res = await api.post(`/perdcomp/jobs/${id}/retentar`);
    return res.data as JobExecucao;
  },

  async cancelar(id: number) {
    await api.post(`/perdcomp/jobs/${id}/cancelar`);
  },
};
