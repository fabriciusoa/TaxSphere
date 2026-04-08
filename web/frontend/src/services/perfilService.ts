import api from './api';

export interface DadosMedico {
  especialidade?: number;
  inscricao?: string;
  tempo_sessao?: number;
  endereco?: string;
  numero?: number;
  complemento?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
  cep?: string;
  nacionalidade?: string;
  estado_civil?: string;
  telefone?: string;
  logo?: string;
  assinatura?: string;
}

export interface PerfilUsuario {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  perfil: string;
  dt_nascimento?: string;
  dados_medico?: DadosMedico | null;
}

export interface AtualizarPerfilDTO {
  nome: string;
  email: string;
  cpf: string;
  dt_nascimento?: string;
  dados_medico?: DadosMedico;
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
