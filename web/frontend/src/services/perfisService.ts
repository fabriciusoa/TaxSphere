import api from './api';
import type { Perfil, SysModulo, PerfilPermissao } from '../types';

export interface PerfilListResponse {
  data: Perfil[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export interface PerfilPayload {
  perfil: string;
  permissoes?: Omit<PerfilPermissao, 'id'>[];
}

export const perfisService = {
  arvoreMenu: async (): Promise<SysModulo[]> => {
    const { data } = await api.get('/perfis/menu');
    return data;
  },

  listar: async (filtros?: { busca?: string; page?: number; limit?: number }): Promise<PerfilListResponse> => {
    const params = new URLSearchParams();
    if (filtros) {
      Object.entries(filtros).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v));
      });
    }
    const { data } = await api.get(`/perfis?${params}`);
    return data;
  },

  buscarPorId: async (id: number): Promise<Perfil> => {
    const { data } = await api.get(`/perfis/${id}`);
    return data;
  },

  criar: async (payload: PerfilPayload): Promise<Perfil> => {
    const { data } = await api.post('/perfis', payload);
    return data;
  },

  atualizar: async (id: number, payload: PerfilPayload): Promise<Perfil> => {
    const { data } = await api.put(`/perfis/${id}`, payload);
    return data;
  },

  excluir: async (id: number): Promise<void> => {
    await api.delete(`/perfis/${id}`);
  },
};

