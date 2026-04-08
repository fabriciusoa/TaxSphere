import api from './api';

export interface Manutencao {
  id: number;
  descricao: string;
  dt_inicio: string;
  dt_fim: string | null;
  status: 'planejada' | 'em_execucao' | 'terminado';
  dt_excluido_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface ManutencaoPayload {
  descricao: string;
  dt_inicio: string;
  dt_fim?: string | null;
  status: 'planejada' | 'em_execucao' | 'terminado';
}

export const manutencaoService = {
  listar: async (): Promise<Manutencao[]> => {
    const response = await api.get('/manutencoes');
    return response.data;
  },

  criar: async (payload: ManutencaoPayload): Promise<Manutencao> => {
    const response = await api.post('/manutencoes', payload);
    return response.data;
  },

  atualizar: async (id: number, payload: Partial<ManutencaoPayload>): Promise<Manutencao> => {
    const response = await api.put(`/manutencoes/${id}`, payload);
    return response.data;
  },

  excluir: async (id: number): Promise<void> => {
    await api.delete(`/manutencoes/${id}`);
  },

  ativas: async (): Promise<Manutencao[]> => {
    const response = await api.get('/manutencoes/ativas');
    return response.data;
  }
};
