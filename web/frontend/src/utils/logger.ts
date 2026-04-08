import { sendErrorToBackend } from '../services/errorLogService';

/**
 * Logger que envia erros tanto para o console quanto para o backend
 */
export const logger = {
  error: (message: string, error?: any) => {
    // Log no console APENAS em desenvolvimento
    if (import.meta.env.DEV) {
      console.error(message, error);
    }
    
    // Enviar para backend (sempre)
    sendErrorToBackend({
      error_message: message,
      error_stack: error?.stack || error?.message || String(error),
      url: window.location.href,
      user_agent: navigator.userAgent,
      browser_info: JSON.stringify({
        language: navigator.language,
        platform: navigator.platform,
        vendor: navigator.vendor
      })
    });
  }
};
