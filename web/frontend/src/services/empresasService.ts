import api from './api';
import type { Empresas } from '../types';

export const empresasService = {
  // ===== EMPRESAS =====

  listar: async (filtros?: { busca?: string; regime?: string; uf?: string; ativo?: string; page?: number; limit?: number }): Promise<{ data: Empresas[]; pagination: { total: number; page: number; limit: number } }> => {
    const params = new URLSearchParams();
    if (filtros) {
      Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
    }
    const { data } = await api.get(`/empresas?${params}`);
    return data;
  },
  buscarPorId: async (id: number): Promise<Empresas> => {
    const { data } = await api.get(`/empresas/${id}`);
    return data;
  },
  criar: async (empresa: Partial<Empresas>): Promise<Empresas> => {
    const { data } = await api.post('/empresas', empresa);
    return data;
  },
  atualizar: async (id: number, empresa: Partial<Empresas>): Promise<Empresas> => {
    const { data } = await api.put(`/empresas/${id}`, empresa);
    return data;
  },
  excluir: async (id: number): Promise<void> => {
    await api.delete(`/empresas/${id}`);
  },
  buscarCNPJ: async (cnpj: string): Promise<any> => {
    const digits = cnpj.replace(/\D/g, '');
    const { data } = await api.get(`/empresas/cnpj/${digits}`);
    return data;
  },
};
