import api from './api';

// Tipos e interfaces
export type StatusNotificacao = 'Pendente' | 'Enviado' | 'Falha';

export interface Notificacao {
  id: number;
  usuario_id: number;
  tipo_notificacao: string;
  status: StatusNotificacao;
  destinatario: string;
  assunto: string;
  mensagem: string;
  enviado_em?: string;
  erro_falha?: string;
  contador_tentativas: number;
  maximo_tentativas: number;
  created_at: string;
  updated_at: string;
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
