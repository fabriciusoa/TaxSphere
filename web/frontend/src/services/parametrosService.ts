import api from './api';

export interface Parametro {
  id: number;
  chave: string;
  valor: string;
  descricao: string | null;
  updated_at: string;
}

export const parametrosService = {
  listar: async (): Promise<Parametro[]> => {
    const response = await api.get<Parametro[]>('/parametros');
    return response.data;
  },

  buscarPorId: async (id: number): Promise<Parametro> => {
    const response = await api.get<Parametro>(`/parametros/${id}`);
    return response.data;
  },

  atualizar: async (id: number, data: { valor?: string; descricao?: string }): Promise<Parametro> => {
    const response = await api.put<Parametro>(`/parametros/${id}`, data);
    return response.data;
  }
};
