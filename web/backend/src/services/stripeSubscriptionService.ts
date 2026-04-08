import Stripe from 'stripe';
import { getStripeInstance } from '../config/stripeConfig';
import { archiveCustomer } from './stripeCustomerService';
import { runQuery, getOne } from '../database/connection';
import { logStripeSuccess, logStripeFailure } from '../utils/auditLogger';
import { log } from '../utils/logger';

/**
 * Cria uma Subscription no Stripe com período de trial
 */
export async function createSubscription(
  customerId: string,
  priceId: string,
  paymentMethodId: string,
  trialDays: number,
  metadata: Record<string, string> = {}
): Promise<string> {
  try {
    const stripe = await getStripeInstance();

    // 1. Anexar payment method ao customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customerId
    });

    log.info(`Payment method ${paymentMethodId} anexado ao customer ${customerId}`);

    // 2. Definir como payment method padrão
    await stripe.customers.update(customerId, {
      invoice_settings: {
        default_payment_method: paymentMethodId
      }
    });

    log.info(`Payment method ${paymentMethodId} definido como padrão para ${customerId}`);

    // 3. Criar subscription com trial
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: trialDays,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription'
      },
      expand: ['latest_invoice.payment_intent'],
      metadata
    });

    log.info(`Subscription ${subscription.id} criada para customer ${customerId} com ${trialDays} dias de trial`);

    return subscription.id;
  } catch (error: any) {
    log.error(`Erro ao criar subscription: ${error.message}`);
    throw new Error(`Falha ao criar subscription: ${error.message}`);
  }
}

/**
 * Cancela uma Subscription no Stripe
 */
export async function cancelSubscription(subscriptionId: string): Promise<void> {
  try {
    const stripe = await getStripeInstance();

    await stripe.subscriptions.cancel(subscriptionId);

    log.info(`Subscription ${subscriptionId} cancelada`);
  } catch (error: any) {
    log.error(`Erro ao cancelar subscription: ${error.message}`);
    throw new Error(`Falha ao cancelar subscription: ${error.message}`);
  }
}

/**
 * Obtém status de uma Subscription no Stripe
 */
export async function getSubscriptionStatus(subscriptionId: string): Promise<Stripe.Subscription> {
  try {
    const stripe = await getStripeInstance();

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    return subscription;
  } catch (error: any) {
    log.error(`Erro ao buscar subscription: ${error.message}`);
    throw new Error(`Falha ao buscar subscription: ${error.message}`);
  }
}

/**
 * Deleta assinatura abandonada (sem subscription criada após 24h)
 * Remove Customer do Stripe e deleta registro do banco
 */
export async function deleteAbandonedSubscription(assinatura: {
  id: number;
  nome: string;
  email: string;
  stripe_customer_id: string | null;
}): Promise<void> {
  try {
    // 1. Arquivar customer no Stripe se existir
    if (assinatura.stripe_customer_id) {
      try {
        await archiveCustomer(assinatura.stripe_customer_id);
        log.info(`Customer Stripe ${assinatura.stripe_customer_id} arquivado (assinatura ${assinatura.id})`);
      } catch (error: any) {
        log.error(`Erro ao arquivar Customer Stripe ${assinatura.stripe_customer_id}: ${error.message}`);
        // Continua mesmo se falhar
      }
    }

    // 2. DELETE físico no banco
    await runQuery(
      'DELETE FROM adm_assinatura WHERE id = ?',
      [assinatura.id]
    );

    log.info(`Assinatura ${assinatura.id} (${assinatura.email}) deletada por abandono`);

    // 3. Enviar email de notificação (será implementado no job)
    // A notificação será enviada pelo abandonedSubscriptionsJob

    // 4. Registrar em audit log
    await logStripeSuccess(
      'subscription_abandoned',
      'delete',
      'assinatura',
      assinatura.id.toString(),
      { assinatura_id: assinatura.id, email: assinatura.email },
      { deleted: true, reason: 'abandoned_24h' },
      {
        id_assinatura: assinatura.id,
        metadata: {
          customer_id: assinatura.stripe_customer_id,
          nome: assinatura.nome,
          email: assinatura.email
        }
      }
    );
  } catch (error: any) {
    log.error(`Erro ao deletar assinatura abandonada: ${error.message}`);

    await logStripeFailure(
      'subscription_abandoned',
      'delete',
      error.message,
      { assinatura_id: assinatura.id },
      { error: error.message },
      { id_assinatura: assinatura.id }
    );

    throw error;
  }
}

export default {
  createSubscription,
  cancelSubscription,
  getSubscriptionStatus,
  deleteAbandonedSubscription
};
