import api from './api';
import type { NcmTabela } from '../types';

export interface NcmTabelaListResponse {
  data: NcmTabela[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const ncmTabelaService = {
  listar: async (filtros?: {
    busca?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<NcmTabelaListResponse> => {
    const params = new URLSearchParams();
    if (filtros) {
      Object.entries(filtros).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v));
      });
    }
    const { data } = await api.get(`/ncm-tabela?${params}`);
    return data;
  },

  buscarPorId: async (id: number): Promise<NcmTabela> => {
    const { data } = await api.get(`/ncm-tabela/${id}`);
    return data;
  },

  criar: async (ncm: Partial<NcmTabela>): Promise<NcmTabela> => {
    const { data } = await api.post('/ncm-tabela', ncm);
    return data;
  },

  atualizar: async (id: number, ncm: Partial<NcmTabela>): Promise<NcmTabela> => {
    const { data } = await api.put(`/ncm-tabela/${id}`, ncm);
    return data;
  },

  alternarStatus: async (id: number): Promise<NcmTabela> => {
    const { data } = await api.patch(`/ncm-tabela/${id}/status`);
    return data;
  },

  excluir: async (id: number): Promise<void> => {
    await api.delete(`/ncm-tabela/${id}`);
  },
};
