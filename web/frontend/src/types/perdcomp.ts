export type RegimeTributario = 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real';
export type TipoCredito = 'PIS' | 'COFINS' | 'IRPJ' | 'CSLL' | 'IPI' | 'INSS' | 'IOF' | 'IRRF' | 'CIDE' | 'OUTROS';
export type OrigemCredito = 'Pagamento Indevido' | 'Pagamento a Maior' | 'Crédito Presumido' | 'Saldo Negativo IRPJ/CSLL' | 'Retenção na Fonte' | 'Exportação';
export type StatusCredito = 'Disponível' | 'Parcialmente Utilizado' | 'Esgotado' | 'Prescrito' | 'Suspenso';
export type StatusDebito = 'Pendente' | 'Parcialmente Compensado' | 'Compensado' | 'Pago';
export type TipoPedido = 'Restituição' | 'Ressarcimento' | 'Reembolso' | 'Compensação';
export type StatusPedido = 'Rascunho' | 'Transmitido' | 'Em Análise' | 'Deferido' | 'Deferido Parcialmente' | 'Indeferido' | 'Não Homologado' | 'Cancelado' | 'Homologado';
export type TipoDocumento = 'DARF' | 'GPS' | 'DCTF' | 'EFD' | 'Contrato' | 'Outros';
export type TipoAlerta = 'Prescrição Próxima' | 'Prazo Manifestação' | 'Crédito Esgotado' | 'Status Alterado' | 'Oportunidade Compensação';
export type PrioridadeAlerta = 'Baixa' | 'Média' | 'Alta' | 'Crítica';

export interface PerdcompEmpresa {
  id: number;
  id_usuario_responsavel: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  inscricao_estadual?: string;
  regime_tributario: RegimeTributario;
  uf?: string;
  municipio?: string;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
  total_creditos?: number;
  total_debitos?: number;
  total_pedidos?: number;
  saldo_creditos?: number;
}

export interface PerdcompCredito {
  id: number;
  id_empresa: number;
  empresa_razao_social?: string;
  empresa_cnpj?: string;
  tipo_credito: TipoCredito;
  origem_credito: OrigemCredito;
  periodo_apuracao: string;
  codigo_receita?: string;
  valor_original: number;
  valor_selic_acumulado: number;
  valor_atualizado: number;
  dt_pagamento_original: string;
  dt_vencimento_prescricao: string;
  status: StatusCredito;
  saldo_disponivel: number;
  observacoes?: string;
  criado_em: string;
  atualizado_em: string;
  dias_para_prescricao?: number;
}

export interface PerdcompDebito {
  id: number;
  id_empresa: number;
  empresa_razao_social?: string;
  empresa_cnpj?: string;
  tipo_tributo: string;
  codigo_receita?: string;
  periodo_apuracao: string;
  valor_principal: number;
  valor_multa: number;
  valor_juros: number;
  valor_total: number;
  dt_vencimento: string;
  status: StatusDebito;
  saldo_devedor: number;
  observacoes?: string;
  criado_em: string;
  atualizado_em: string;
}

export interface PerdcompPedido {
  id: number;
  id_empresa: number;
  empresa_razao_social?: string;
  empresa_cnpj?: string;
  id_usuario_criador: number;
  usuario_nome?: string;
  numero_processo?: string;
  tipo_pedido: TipoPedido;
  status: StatusPedido;
  valor_total_credito: number;
  valor_total_debito: number;
  dt_transmissao?: string;
  dt_ciencia?: string;
  dt_prazo_manifestacao?: string;
  dt_decisao?: string;
  motivo_indeferimento?: string;
  observacoes?: string;
  criado_em: string;
  atualizado_em: string;
  itens?: PerdcompPedidoItem[];
  documentos?: PerdcompDocumento[];
  historico?: PerdcompHistorico[];
}

export interface PerdcompPedidoItem {
  id: number;
  id_pedido: number;
  id_credito?: number;
  id_debito?: number;
  tipo_item: 'credito' | 'debito';
  valor_utilizado: number;
  criado_em: string;
  credito_tipo?: TipoCredito;
  credito_periodo?: string;
  debito_tipo?: string;
  debito_periodo?: string;
}

export interface PerdcompDocumento {
  id: number;
  id_pedido?: number;
  id_credito?: number;
  tipo_documento: TipoDocumento;
  nome_arquivo: string;
  tipo_arquivo: string;
  tamanho_bytes: number;
  observacoes?: string;
  criado_em: string;
}

export interface PerdcompHistorico {
  id: number;
  id_pedido?: number;
  id_credito?: number;
  id_debito?: number;
  id_usuario: number;
  usuario_nome?: string;
  acao: string;
  campo_alterado?: string;
  valor_anterior?: string;
  valor_novo?: string;
  detalhes?: string;
  criado_em: string;
}

export interface PerdcompAlerta {
  id: number;
  id_empresa?: number;
  empresa_razao_social?: string;
  id_pedido?: number;
  id_credito?: number;
  id_usuario: number;
  tipo_alerta: TipoAlerta;
  titulo: string;
  mensagem: string;
  prioridade: PrioridadeAlerta;
  lido: boolean;
  criado_em: string;
}

export interface SelicTaxa {
  id: number;
  mes_referencia: string;
  taxa_mensal: number;
  taxa_acumulada_ano?: number;
  criado_em: string;
}

export interface PerdcompDashboardData {
  total_creditos_disponiveis: number;
  valor_creditos_disponiveis: number;
  total_debitos_pendentes: number;
  valor_debitos_pendentes: number;
  pedidos_em_analise: number;
  pedidos_deferidos: number;
  pedidos_indeferidos: number;
  taxa_deferimento: number;
  creditos_proximos_prescricao: number;
  valor_creditos_prescricao: number;
  alertas_nao_lidos: number;
  creditos_por_tipo: { tipo: TipoCredito; total: number; valor: number }[];
  pedidos_por_status: { status: StatusPedido; total: number }[];
  ultimos_movimentos: PerdcompHistorico[];
}

export interface SimulacaoResultado {
  creditos_selecionados: { id: number; tipo: TipoCredito; valor_utilizado: number; saldo_restante: number }[];
  debitos_compensados: { id: number; tipo: string; valor_compensado: number; saldo_restante: number }[];
  total_credito_utilizado: number;
  total_debito_compensado: number;
  economia_estimada: number;
  alertas: string[];
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface IAAnaliseResponse {
  analise: string;
  oportunidades: { descricao: string; valor_estimado: number; prioridade: string }[];
  recomendacoes: string[];
}

export interface IARiscoResponse {
  nivel_risco: 'Baixo' | 'Médio' | 'Alto';
  score: number;
  fatores_risco: string[];
  recomendacoes: string[];
}

export interface IAChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}
