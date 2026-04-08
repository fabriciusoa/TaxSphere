import axios from 'axios';

const api = axios.create({
  baseURL: `/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true // envia o cookie httpOnly em todas as requisições (SEC-04)
});

// Interceptor de resposta: redirecionar para login se sessão expirar
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const errorData = error.response.data;
      // Evitar loop infinito na própria rota de login/me
      const url = error.config?.url ?? '';
      const jaNoLogin = window.location.pathname.startsWith('/login');
      if (!url.includes('/auth/login') && !url.includes('/auth/me') && !jaNoLogin) {
        if (errorData.error === 'sessao_expirada' || errorData.error === 'Token não fornecido' || errorData.error === 'Token inválido') {
          window.location.href = '/login?sessao_expirada=true';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
