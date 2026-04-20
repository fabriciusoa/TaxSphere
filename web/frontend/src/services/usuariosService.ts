import api from './api';
import { type Usuario } from '../types';

interface UsuariosResponse {
  data: Usuario[];
  totalRecords: number;
  page: number;
  limit: number;
}

export const usuariosService = {
  listar: async (filtros?: { 
    status?: string; 
    busca?: string;
    data_criacao_inicio?: string;
    data_criacao_fim?: string;
    cliente_id?: number;
    page?: number;
    limit?: number;
  }): Promise<UsuariosResponse> => {
    const params = new URLSearchParams();
    if (filtros?.busca)
      params.append('busca', filtros.busca);
    if (filtros?.data_criacao_inicio) 
      params.append('data_criacao_inicio', filtros.data_criacao_inicio);
    if (filtros?.data_criacao_fim) 
      params.append('data_criacao_fim', filtros.data_criacao_fim);
    if (filtros?.cliente_id) 
      params.append('cliente_id', String(filtros.cliente_id));
    if (filtros?.page) 
      params.append('page', String(filtros.page));
    if (filtros?.limit) 
      params.append('limit', String(filtros.limit));
    
    const response = await api.get<UsuariosResponse>(`/usuarios?${params}`);
    return response.data;
  },

  buscarPorId: async (id: number): Promise<Usuario> => {
    const response = await api.get<Usuario>(`/usuarios/${id}`);
    return response.data;
  },

  criar: async (data: Usuario): Promise<Usuario> => {
    const response = await api.post<Usuario>('/usuarios', data);
    return response.data;
  },

  atualizar: async (id: number, data: Usuario): Promise<Usuario> => {
    const response = await api.put<Usuario>(`/usuarios/${id}`, data);
    return response.data;
  },

  desbloquear: async (id: number): Promise<{ message: string }> => {
    const response = await api.put<{ message: string }>(`/usuarios/${id}/desbloquear`);
    return response.data;
  },

  inativar: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/usuarios/${id}`);
    return response.data;
  },

  buscarMeuPerfil: async (): Promise<Usuario> => {
    const response = await api.get<Usuario>('/usuarios/me');
    return response.data;
  },

  atualizarMeuPerfil: async (data: Usuario): Promise<Usuario> => {
    const response = await api.put<Usuario>('/usuarios/me', data);
    return response.data;
  },

  buscarPerfisDoUsuario: async (id: number): Promise<{ id: number; perfil_id: number; perfil: string }[]> => {
    const response = await api.get(`/usuarios/${id}/perfis`);
    return response.data;
  },

  sincronizarPerfisDoUsuario: async (id: number, perfil_ids: number[]): Promise<void> => {
    await api.put(`/usuarios/${id}/perfis`, { perfil_ids });
  },
};
