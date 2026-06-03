import { sendErrorToBackend } from '../services/errorLogService';

/**
 * Logger que envia erros tanto para o console quanto para o backend
 */
export const logger = {
  /**
   * Erro REAL que deve aparecer no monitor — vai pro console em dev E para o backend.
   * Use só para falhas inesperadas (crashes, requests que deveriam funcionar, etc).
   */
  error: (message: string, error?: any) => {
    if (import.meta.env.DEV) console.error(message, error);
    sendErrorToBackend({
      error_message: message,
      error_stack: error?.stack || error?.message || String(error),
      url: window.location.href,
      user_agent: navigator.userAgent,
      browser_info: JSON.stringify({
        language: navigator.language,
        platform: navigator.platform,
        vendor: navigator.vendor,
      }),
    });
  },

  /**
   * Aviso de fluxo esperado mas que merece atenção (sessão expirada, fallback, etc).
   * SÓ console — não enviado ao backend para evitar ruído no log_frontend.
   */
  warn: (message: string, extra?: any) => {
    if (import.meta.env.DEV) console.warn(message, extra);
  },
};
