import api from './api';
import type { LoginLogPaginado } from '../types';

export const loginLogService = {
  listar: async (filtros?: {
    page?: number;
    limit?: number;
    sucesso?: 'sim' | 'nao';
    data_inicio?: string;
    data_fim?: string;
    usuario_id?: number;
  }): Promise<LoginLogPaginado> => {
    const params = new URLSearchParams();
    if (filtros?.page) params.append('page', filtros.page.toString());
    if (filtros?.limit) params.append('limit', filtros.limit.toString());
    if (filtros?.sucesso) params.append('sucesso', filtros.sucesso);
    if (filtros?.data_inicio) params.append('data_inicio', filtros.data_inicio);
    if (filtros?.data_fim) params.append('data_fim', filtros.data_fim);
    if (filtros?.usuario_id) params.append('usuario_id', filtros.usuario_id.toString());
    
    const response = await api.get<LoginLogPaginado>(`/login-log?${params}`);
    return response.data;
  }
};
