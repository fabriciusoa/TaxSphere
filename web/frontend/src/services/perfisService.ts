import api from './api';

interface Perfil {
  id: number;
  perfil: string;
}

export const perfisService = {
  listar: async (): Promise<Perfil[]> => {
    const response = await api.get<Perfil[]>('/perfis');
    return response.data;
  },

  buscarPorId: async (id: number): Promise<Perfil> => {
    const response = await api.get<Perfil>(`/perfis/${id}`);
    return response.data;
  },

  criar: async (perfil: string): Promise<Perfil> => {
    const response = await api.post<Perfil>('/perfis', { perfil });
    return response.data;
  },

  atualizar: async (id: number, perfil: string): Promise<Perfil> => {
    const response = await api.put<Perfil>(`/perfis/${id}`, { perfil });
    return response.data;
  },

  deletar: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/perfis/${id}`);
    return response.data;
  }
};
