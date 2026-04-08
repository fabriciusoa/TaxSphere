import api from './api';
import { logger } from '../utils/logger';

export interface UsuarioParametros {
  id?: number;
  id_usuario?: number;
  duracao_sessao: number;
  tempo_entre_sessao: number;
  enviar_email: boolean;
  enviar_whats: boolean;
  tempo_lembrete: number;
  permite_paciente_remarcar: boolean;
  tempo_remarcacao: number;
  permite_paciente_cancelar: boolean;
  tempo_cancelamento: number;
  criado_em?: string;
  atualizado_em?: string;
  // Cores do calendário (opcionais para atualização)
  cor_agendado?: string;
  cor_confirmado?: string;
  cor_cancelado?: string;
  cor_realizado?: string;
  cor_faltou?: string;
  cor_reagendado?: string;
}

export interface CoresCalendario {
  cor_agendado: string;
  cor_confirmado: string;
  cor_cancelado: string;
  cor_realizado: string;
  cor_faltou: string;
  cor_reagendado: string;
}

const usuarioParametrosService = {
  // Buscar parâmetros do usuário logado
  buscarMeus: async (): Promise<UsuarioParametros | null> => {
    try {
      const response = await api.get<UsuarioParametros>('/usuario-parametros/me');
      return response.data;
    } catch (error: any) {
      logger.error('Erro ao buscar parâmetros do usuário logado', { error });

      // Se retornar 404, significa que o usuário ainda não tem parâmetros
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // Atualizar parâmetros do usuário logado
  // Aceita campos parciais, incluindo cores do calendário
  atualizar: async (data: Partial<UsuarioParametros>): Promise<UsuarioParametros> => {
    const response = await api.put<UsuarioParametros>('/usuario-parametros/me', data);
    return response.data;
  },

  // Criar parâmetros do usuário (se ainda não existirem)
  criar: async (data: UsuarioParametros): Promise<UsuarioParametros> => {
    const response = await api.post<UsuarioParametros>('/usuario-parametros', data);
    return response.data;
  },

  // Buscar cores do calendário do usuário logado
  buscarCores: async (): Promise<CoresCalendario> => {
    const response = await api.get<CoresCalendario>('/usuario-parametros/cores');
    return response.data;
  },

  // Admin: Buscar parâmetros de um usuário específico
  buscarPorUsuario: async (userId: number): Promise<UsuarioParametros | null> => {
    try {
      const response = await api.get<UsuarioParametros>(`/usuario-parametros/usuario/${userId}`);
      return response.data;
    } catch (error: any) {
      logger.error(`Erro ao buscar parâmetros do usuário ${userId}`, { error });
      if (error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  },

  // Admin: Atualizar parâmetros de um usuário específico
  atualizarPorUsuario: async (userId: number, data: Partial<UsuarioParametros>): Promise<UsuarioParametros> => {
    const response = await api.put<UsuarioParametros>(`/usuario-parametros/usuario/${userId}`, data);
    return response.data;
  },

  // Admin: Criar parâmetros para um usuário específico
  criarParaUsuario: async (userId: number, data: UsuarioParametros): Promise<UsuarioParametros> => {
    const response = await api.post<UsuarioParametros>(`/usuario-parametros/usuario/${userId}`, data);
    return response.data;
  }
};

export default usuarioParametrosService;
