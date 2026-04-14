import api from './api';

export interface PerfilUsuario {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  perfil: string;
  dt_nascimento?: string;
}

export interface AtualizarPerfilDTO {
  nome: string;
  email: string;
  cpf: string;
  dt_nascimento?: string;
}

const perfilService = {
  buscarMeuPerfil: async (): Promise<PerfilUsuario> => {
    const response = await api.get<PerfilUsuario>('/perfil/me');
    return response.data;
  },

  buscarPerfilUsuario: async (userId: number): Promise<PerfilUsuario> => {
    const response = await api.get<PerfilUsuario>(`/perfil/usuario/${userId}`);
    return response.data;
  },

  atualizarMeuPerfil: async (data: AtualizarPerfilDTO): Promise<{ message: string; usuario: PerfilUsuario }> => {
    const response = await api.put<{ message: string; usuario: PerfilUsuario }>('/perfil/me', data);
    return response.data;
  }
};

export default perfilService;
