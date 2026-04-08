import api from './api';

// Tipos e interfaces
export type StatusNotificacao = 'Pendente' | 'Enviado' | 'Falha';
export type TipoNotificacao = 'EMAIL' | 'WHATSAPP';

export interface Notificacao {
  id: number;
  id_agendamento: number;
  tipo: TipoNotificacao;
  tipo_notificacao: string;
  destinatario: string;
  assunto: string;
  corpo: string;
  status: StatusNotificacao;
  contador_tentativas: number;
  enviado_em?: string;
  entregue_em?: string;
  erro_falha?: string;
  criado_em: string;
}

export interface EstatisticasNotificacao {
  total: number;
  pendentes: number;
  enviadas: number;
  falhas: number;
  taxa_sucesso: number;
}

export interface FiltrosNotificacao {
  status?: StatusNotificacao;
  tipo?: TipoNotificacao;
  limite?: number;
  offset?: number;
}

const notificacoesService = {
  /**
   * Listar notificações com filtros opcionais
   * @param filtros - Filtros para a listagem
   * @returns Lista de notificações
   */
  listar: async (filtros?: FiltrosNotificacao): Promise<Notificacao[]> => {
    const response = await api.get<Notificacao[]>('/notificacoes', {
      params: filtros
    });
    return response.data;
  },

  /**
   * Buscar estatísticas de notificações
   * @returns Estatísticas agregadas
   */
  estatisticas: async (): Promise<EstatisticasNotificacao> => {
    const response = await api.get<EstatisticasNotificacao>('/notificacoes/estatisticas');
    return response.data;
  },

  /**
   * Reprocessar notificações que falharam
   * Reset contador de tentativas e status para permitir novo envio
   * @returns Mensagem de sucesso com quantidade reprocessada
   */
  reprocessarFalhas: async (): Promise<{ message: string; reprocessados: number }> => {
    const response = await api.post<{ message: string; reprocessados: number }>(
      '/notificacoes/reprocessar-falhas'
    );
    return response.data;
  }
};

export default notificacoesService;
