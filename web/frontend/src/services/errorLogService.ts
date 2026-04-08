import api from './api';

interface FrontendErrorData {
  error_message: string;
  error_stack?: string;
  component_stack?: string;
  url: string;
  user_agent: string;
  browser_info: string;
}

export async function sendErrorToBackend(errorData: FrontendErrorData) {
  try {
    await api.post('/logs/frontend-error', errorData);
  } catch (err) {
    // Falhou ao enviar log - não fazer nada (evitar loop infinito)
    console.error('Falha ao enviar erro para backend:', err);
  }
}
