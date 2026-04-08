import { loadStripe, type Stripe } from '@stripe/stripe-js';
import api from '../services/api';
import { logger } from '../utils/logger';

let stripePromise: Promise<Stripe | null> | null = null;

/**
 * Obtém a instância do Stripe carregando a publishable key do backend
 * @returns Promise com instância do Stripe
 */
export const getStripe = (): Promise<Stripe | null> => {
  if (stripePromise) {
    return stripePromise;
  }

  stripePromise = (async () => {
    try {
      // Buscar publishable key do backend
      const response = await api.get<{
        publishableKey: string;
        isTestMode: boolean;
      }>('/parametros/stripe-publishable-key');

      const { publishableKey, isTestMode } = response.data;

      if (!publishableKey) {
        logger.error('Stripe publishable key não configurada');
        return null;
      }

      if (isTestMode) {
        logger.error('🔶 MODO TESTE STRIPE - Usando chave de teste');
      }

      return await loadStripe(publishableKey);
    } catch (error) {
      logger.error('Erro ao carregar Stripe', error);
      return null;
    }
  })();

  return stripePromise;
};

/**
 * Reseta a instância do Stripe (útil para testes)
 */
export const resetStripe = () => {
  stripePromise = null;
};

export default getStripe;
