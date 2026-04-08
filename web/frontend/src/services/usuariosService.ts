import api from './api';

interface Usuario {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  perfil: string;
  perfil_id: number;
  status: string;
  criado?: string | null;
  dt_inativacao?: string | null;
  dt_nascimento?: string | null;
  dt_ativacao?: string | null;
  ultimo_login?: string | null;
  tentativas_login?: number;
  dt_bloqueio?: string | null;
}

interface UsuariosResponse {
  data: Usuario[];
  totalRecords: number;
  page: number;
  limit: number;
}

interface CriarUsuarioDTO {
  nome: string;
  email: string;
  cpf: string;
  senha: string;
  perfil: number;
  dt_nascimento?: string;
  status?: string;
}

interface AtualizarUsuarioDTO {
  nome?: string;
  email?: string;
  cpf?: string;
  senha?: string;
  perfil?: number;
  dt_nascimento?: string;
  status?: string;
}

export const usuariosService = {
  listar: async (filtros?: { 
    status?: string; 
    busca?: string;
    data_criacao_inicio?: string;
    data_criacao_fim?: string;
    page?: number;
    limit?: number;
  }): Promise<UsuariosResponse> => {
    const params = new URLSearchParams();
    if (filtros?.status) params.append('status', filtros.status);
    if (filtros?.busca) params.append('busca', filtros.busca);
    if (filtros?.data_criacao_inicio) params.append('data_criacao_inicio', filtros.data_criacao_inicio);
    if (filtros?.data_criacao_fim) params.append('data_criacao_fim', filtros.data_criacao_fim);
    if (filtros?.page) params.append('page', String(filtros.page));
    if (filtros?.limit) params.append('limit', String(filtros.limit));
    
    const response = await api.get<UsuariosResponse>(`/usuarios?${params}`);
    return response.data;
  },

  buscarPorId: async (id: number): Promise<Usuario> => {
    const response = await api.get<Usuario>(`/usuarios/${id}`);
    return response.data;
  },

  criar: async (data: CriarUsuarioDTO): Promise<Usuario> => {
    const response = await api.post<Usuario>('/usuarios', data);
    return response.data;
  },

  atualizar: async (id: number, data: AtualizarUsuarioDTO): Promise<Usuario> => {
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
  }
};
