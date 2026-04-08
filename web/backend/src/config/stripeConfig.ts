import Stripe from 'stripe';
import { getParametros } from '../utils/parametrosHelper';
import logger from '../utils/logger';

let stripeInstance: Stripe | null = null;

/**
 * Inicializa e retorna instância do Stripe configurada
 * Usa chaves da tabela parametros baseado em NODE_ENV
 */
export async function getStripeInstance(): Promise<Stripe> {
  if (stripeInstance) {
    return stripeInstance;
  }

  try {
    const config = await getParametros([
      'NODE_ENV',
      'DES_STRIPE_CHAVE_SEC',
      'PRD_STRIPE_CHAVE_SEC'
    ]);

    const isProduction = config.NODE_ENV === 'prd';
    const secretKey = isProduction 
      ? config.PRD_STRIPE_CHAVE_SEC 
      : config.DES_STRIPE_CHAVE_SEC;

    if (!secretKey) {
      logger.error(`[stripeConfig.ts] [getStripeInstance] Chave Stripe não configurada para ambiente: ${config.NODE_ENV}`);
      throw new Error(
        `Chave Stripe não configurada para ambiente: ${config.NODE_ENV}`
      );
    }

    stripeInstance = new Stripe(secretKey, {
      apiVersion: '2026-02-25.clover',
      appInfo: {
        name: 'System',
        version: '1.0.0'
      }
    });

    logger.info(`[stripeConfig.ts] [getStripeInstance] Stripe inicializado em modo: ${isProduction ? 'PRODUÇÃO' : 'TESTE'}`);

    return stripeInstance;
  } catch (error) {
    logger.error('[stripeConfig.ts] [getStripeInstance] Erro ao inicializar Stripe:', error);
    throw new Error('Falha ao configurar Stripe. Verifique as chaves na tabela parametros.');
  }
}

/**
 * Reseta instância do Stripe (útil para testes ou reload de configuração)
 */
export function resetStripeInstance(): void {
  stripeInstance = null;
}

/**
 * Verifica se está em modo de produção
 */
export async function isProductionMode(): Promise<boolean> {
  const nodeEnv = await getParametros(['NODE_ENV']);
  return nodeEnv.NODE_ENV === 'prd';
}
