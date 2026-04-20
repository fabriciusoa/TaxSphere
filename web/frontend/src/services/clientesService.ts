import api from './api';
import type { Cliente } from '../types';

export type RegimeTributarioCliente = 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real';

export interface ClienteListResponse {
  data: Cliente[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const clientesService = {
  listar: async (filtros?: {
    busca?: string;
    regime?: string;
    uf?: string;
    ativo?: string;
    page?: number;
    limit?: number;
  }): Promise<ClienteListResponse> => {
    const params = new URLSearchParams();
    if (filtros) {
      Object.entries(filtros).forEach(([k, v]) => {
        if (v !== undefined && v !== '') params.append(k, String(v));
      });
    }
    const { data } = await api.get(`/clientes?${params}`);
    return data;
  },

  buscarPorId: async (id: number): Promise<Cliente> => {
    const { data } = await api.get(`/clientes/${id}`);
    return data;
  },

  criar: async (cliente: Partial<Cliente>): Promise<Cliente> => {
    const { data } = await api.post('/clientes', cliente);
    return data;
  },

  atualizar: async (id: number, cliente: Partial<Cliente>): Promise<Cliente> => {
    const { data } = await api.put(`/clientes/${id}`, cliente);
    return data;
  },

  alternarAtivo: async (id: number): Promise<Cliente> => {
    const { data } = await api.patch(`/clientes/${id}/ativo`);
    return data;
  },

  excluir: async (id: number): Promise<void> => {
    await api.delete(`/clientes/${id}`);
  },
};
