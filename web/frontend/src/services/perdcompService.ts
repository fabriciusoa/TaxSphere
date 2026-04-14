import api from './api';
import type {
  PerdcompEmpresa, PerdcompCredito, PerdcompDebito, PerdcompPedido,
  PerdcompAlerta, PerdcompDashboardData, SimulacaoResultado, PaginatedResponse,
} from '../types/perdcomp';

export const perdcompService = {
  // ===== EMPRESAS =====
  empresas: {
    listar: async (filtros?: { busca?: string; regime?: string; uf?: string; ativo?: string; page?: number; limit?: number }): Promise<PaginatedResponse<PerdcompEmpresa>> => {
      const params = new URLSearchParams();
      if (filtros) {
        Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
      }
      const { data } = await api.get(`/perdcomp/empresas?${params}`);
      return data;
    },
    buscarPorId: async (id: number): Promise<PerdcompEmpresa> => {
      const { data } = await api.get(`/perdcomp/empresas/${id}`);
      return data;
    },
    criar: async (empresa: Partial<PerdcompEmpresa>): Promise<PerdcompEmpresa> => {
      const { data } = await api.post('/perdcomp/empresas', empresa);
      return data;
    },
    atualizar: async (id: number, empresa: Partial<PerdcompEmpresa>): Promise<PerdcompEmpresa> => {
      const { data } = await api.put(`/perdcomp/empresas/${id}`, empresa);
      return data;
    },
    excluir: async (id: number): Promise<void> => {
      await api.delete(`/perdcomp/empresas/${id}`);
    },
    buscarCNPJ: async (cnpj: string): Promise<any> => {
      const digits = cnpj.replace(/\D/g, '');
      const { data } = await api.get(`/perdcomp/empresas/cnpj/${digits}`);
      return data;
    },
  },

  // ===== CRÉDITOS =====
  creditos: {
    listar: async (filtros?: { id_empresa?: number; tipo_credito?: string; status?: string; periodo?: string; busca?: string; page?: number; limit?: number }): Promise<PaginatedResponse<PerdcompCredito>> => {
      const params = new URLSearchParams();
      if (filtros) {
        Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
      }
      const { data } = await api.get(`/perdcomp/creditos?${params}`);
      return data;
    },
    buscarPorId: async (id: number): Promise<PerdcompCredito> => {
      const { data } = await api.get(`/perdcomp/creditos/${id}`);
      return data;
    },
    criar: async (credito: any): Promise<PerdcompCredito> => {
      const { data } = await api.post('/perdcomp/creditos', credito);
      return data;
    },
    atualizar: async (id: number, credito: any): Promise<PerdcompCredito> => {
      const { data } = await api.put(`/perdcomp/creditos/${id}`, credito);
      return data;
    },
    excluir: async (id: number): Promise<void> => {
      await api.delete(`/perdcomp/creditos/${id}`);
    },
    atualizarSelic: async (id_empresa?: number): Promise<{ message: string }> => {
      const { data } = await api.post('/perdcomp/creditos/atualizar-selic', { id_empresa });
      return data;
    },
  },

  // ===== DÉBITOS =====
  debitos: {
    listar: async (filtros?: { id_empresa?: number; tipo_tributo?: string; status?: string; periodo?: string; page?: number; limit?: number }): Promise<PaginatedResponse<PerdcompDebito>> => {
      const params = new URLSearchParams();
      if (filtros) {
        Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
      }
      const { data } = await api.get(`/perdcomp/debitos?${params}`);
      return data;
    },
    buscarPorId: async (id: number): Promise<PerdcompDebito> => {
      const { data } = await api.get(`/perdcomp/debitos/${id}`);
      return data;
    },
    criar: async (debito: any): Promise<PerdcompDebito> => {
      const { data } = await api.post('/perdcomp/debitos', debito);
      return data;
    },
    atualizar: async (id: number, debito: any): Promise<PerdcompDebito> => {
      const { data } = await api.put(`/perdcomp/debitos/${id}`, debito);
      return data;
    },
    excluir: async (id: number): Promise<void> => {
      await api.delete(`/perdcomp/debitos/${id}`);
    },
  },

  // ===== PEDIDOS =====
  pedidos: {
    listar: async (filtros?: { id_empresa?: number; tipo_pedido?: string; status?: string; page?: number; limit?: number }): Promise<PaginatedResponse<PerdcompPedido>> => {
      const params = new URLSearchParams();
      if (filtros) {
        Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
      }
      const { data } = await api.get(`/perdcomp/pedidos?${params}`);
      return data;
    },
    buscarPorId: async (id: number): Promise<PerdcompPedido> => {
      const { data } = await api.get(`/perdcomp/pedidos/${id}`);
      return data;
    },
    criar: async (pedido: any): Promise<PerdcompPedido> => {
      const { data } = await api.post('/perdcomp/pedidos', pedido);
      return data;
    },
    atualizarStatus: async (id: number, statusData: any): Promise<PerdcompPedido> => {
      const { data } = await api.put(`/perdcomp/pedidos/${id}/status`, statusData);
      return data;
    },
    excluir: async (id: number): Promise<void> => {
      await api.delete(`/perdcomp/pedidos/${id}`);
    },
  },

  // ===== DASHBOARD =====
  dashboard: async (id_empresa?: number): Promise<PerdcompDashboardData> => {
    const params = id_empresa ? `?id_empresa=${id_empresa}` : '';
    const { data } = await api.get(`/perdcomp/dashboard${params}`);
    return data;
  },

  // ===== SIMULADOR =====
  simular: async (payload: any): Promise<SimulacaoResultado> => {
    const { data } = await api.post('/perdcomp/simulador', payload);
    return data;
  },

  // ===== ALERTAS =====
  alertas: {
    listar: async (filtros?: { lido?: string; tipo?: string; id_empresa?: number; page?: number; limit?: number }): Promise<PaginatedResponse<PerdcompAlerta>> => {
      const params = new URLSearchParams();
      if (filtros) {
        Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
      }
      const { data } = await api.get(`/perdcomp/alertas?${params}`);
      return data;
    },
    marcarLido: async (id: number): Promise<void> => {
      await api.put(`/perdcomp/alertas/${id}/lido`);
    },
    gerar: async (id_empresa: number): Promise<{ message: string }> => {
      const { data } = await api.post('/perdcomp/alertas/gerar', { id_empresa });
      return data;
    },
  },

  // ===== IA =====
  ia: {
    analisar: async (id_empresa: number): Promise<{ analise: string }> => {
      const { data } = await api.post('/perdcomp/ia/analisar', { id_empresa });
      return data;
    },
    sugerir: async (id_empresa: number): Promise<{ sugestao: string }> => {
      const { data } = await api.post('/perdcomp/ia/sugerir', { id_empresa });
      return data;
    },
    risco: async (id_pedido: number): Promise<{ avaliacao: string }> => {
      const { data } = await api.post('/perdcomp/ia/risco', { id_pedido });
      return data;
    },
    chat: async (id_empresa: number, mensagem: string, historico: any[]): Promise<{ resposta: string }> => {
      const { data } = await api.post('/perdcomp/ia/chat', { id_empresa, mensagem, historico });
      return data;
    },
  },
};
