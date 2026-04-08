import api from './api';
import type { AuthUser } from '../contexts/AuthContext';

export const authService = {
  login: async (email: string, senha: string): Promise<{ user: AuthUser }> => {
    const response = await api.post<{ user: AuthUser }>('/auth/login', { email, senha });
    return response.data;
  },

  refresh: async (): Promise<void> => {
    await api.post('/auth/refresh');
  },

  logout: async (): Promise<void> => {
    await api.post('/auth/logout');
  },

  validate_reset: async (email: string, cpf: string) => {
    const response = await api.post('/auth/validate_reset', { email, cpf });
    return response.data;
  },

  reset_reset: async (email: string, cpf: string, newPassword: string) => {
    const response = await api.post('/auth/reset-password', { email, cpf, newPassword });
    return response.data;
  },
};
