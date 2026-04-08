import api from './api';

export interface PlanoItem {
  id?: number;
  id_adm_plano?: number;
  descricao: string;
  ativo: string;
  dt_inclusao?: string;
  dt_exclusao?: string | null;
}

export interface Plano {
  id?: number;
  descricao: string;
  valor: number;
  ativo: string;
  dt_inclusao?: string;
  dt_alteracao?: string | null;
  itens?: PlanoItem[];
  id_product_stripe?: string | null;
  id_price_stripe?: string | null;
}

const admPlanosService = {
  listar: async (): Promise<Plano[]> => {
    const response = await api.get<Plano[]>('/adm-planos');
    return response.data;
  },

  listarAtivos: async (): Promise<Plano[]> => {
    const response = await api.get<Plano[]>('/adm-planos/ativos');
    return response.data;
  },

  buscarPorId: async (id: number): Promise<Plano> => {
    const response = await api.get<Plano>(`/adm-planos/${id}`);
    return response.data;
  },

  criar: async (plano: Plano): Promise<Plano> => {
    const response = await api.post<Plano>('/adm-planos', plano);
    return response.data;
  },

  atualizar: async (id: number, plano: Plano): Promise<Plano> => {
    const response = await api.put<Plano>(`/adm-planos/${id}`, plano);
    return response.data;
  },

  excluir: async (id: number): Promise<void> => {
    await api.delete(`/adm-planos/${id}`);
  }
};

export default admPlanosService;
