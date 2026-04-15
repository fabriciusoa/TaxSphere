import { Request, Response } from 'express';
import Stripe from 'stripe';
import { getStripeInstance } from '../config/stripeConfig';
import { runQuery, getOne } from '../database/connection';
import { getParametro } from '../utils/parametrosHelper';
import { log } from '../utils/logger';

export const stripeWebhookController = {
  /**
   * Processa eventos do Stripe Webhook
   * IMPORTANTE: Esta rota deve usar express.raw() ao invés de express.json()
   */
  async handleWebhook(req: Request, res: Response) {
    const stripe = await getStripeInstance();
    const sig = req.headers['stripe-signature'];

    if (!sig) {
      log.error('Webhook recebido sem signature');
      return res.status(400).json({ erro: 'Signature ausente' });
    }

    let event: Stripe.Event;

    try {
      // 1. Obter webhook secret baseado no ambiente
      const webhookSecret = process.env.NODE_ENV === 'production'
        ? await getParametro('PRD_STRIPE_WEBHOOK_SECRET')
        : await getParametro('DES_STRIPE_WEBHOOK_SECRET');

      if (!webhookSecret) {
        log.error('Webhook secret não configurado');
        return res.status(500).json({ erro: 'Configuração inválida' });
      }

      // 2. Validar assinatura do webhook
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        webhookSecret
      );

      log.info(`Webhook recebido: ${event.type}`);
    } catch (err: any) {
      log.error(`Erro ao validar webhook: ${err.message}`);
      return res.status(400).json({ erro: `Webhook Error: ${err.message}` });
    }

    try {
      // 3. Verificar idempotência (evitar processar evento duplicado)
      const eventoExistente = await getOne(
        `SELECT id FROM adm_stripe_webhook_events WHERE stripe_event_id = $1`,
        [event.id]
      );

      if (eventoExistente) {
        log.info(`Evento ${event.id} já processado anteriormente`);
        return res.json({ received: true, status: 'already_processed' });
      }

      // 4. Processar evento baseado no tipo
      let resultado: string;
      switch (event.type) {
        case 'invoice.payment_succeeded':
          resultado = await handlePaymentSucceeded(event);
          break;

        case 'invoice.payment_failed':
          resultado = await handlePaymentFailed(event);
          break;

        case 'customer.subscription.deleted':
          resultado = await handleSubscriptionDeleted(event);
          break;

        case 'customer.subscription.updated':
          resultado = await handleSubscriptionUpdated(event);
          break;

        case 'customer.subscription.trial_will_end':
          resultado = await handleTrialWillEnd(event);
          break;

        default:
          log.info(`Evento ${event.type} não tratado (ok)`);
          resultado = 'ignored';
      }

      // 5. Registrar evento como processado
      await runQuery(
        `INSERT INTO adm_stripe_webhook_events 
         (stripe_event_id, tipo, processado_em, resultado)
         VALUES ($1, $2, NOW(), $3)`,
        [event.id, event.type, resultado]
      );

      res.json({ received: true, status: resultado });
    } catch (error: any) {
      log.error(`Erro ao processar webhook ${event.type}: ${error.message}`);

      // Registrar falha
      await runQuery(
        `INSERT INTO adm_stripe_webhook_events 
         (stripe_event_id, tipo, processado_em, resultado, erro)
         VALUES ($1, $2, NOW(), 'error', $3)`,
        [event.id, event.type, error.message]
      );

      // Retornar 200 para evitar reenvio do webhook
      res.json({ received: true, status: 'error', message: error.message });
    }
  }
};

/**
 * Pagamento bem-sucedido (após período de trial ou renovação)
 */
async function handlePaymentSucceeded(event: Stripe.Event): Promise<string> {
  const invoice = event.data.object as any;
  const subscription = invoice.subscription;
  const subscriptionId = typeof subscription === 'string' 
    ? subscription 
    : subscription?.id;

  if (!subscriptionId) {
    log.info('Invoice sem subscription_id');
    return 'no_subscription';
  }

  // Buscar assinatura no banco
  const assinatura = await getOne<{ id: number; status: string }>(
    `SELECT id, status FROM adm_assinatura 
     WHERE stripe_subscription_id = $1 AND dt_excluido IS NULL`,
    [subscriptionId]
  );

  if (!assinatura) {
    log.info(`Assinatura não encontrada para subscription ${subscriptionId}`);
    return 'not_found';
  }

  // Se é pagamento de ciclo de cobrança (não o trial)
  if (invoice.billing_reason === 'subscription_cycle') {
    await runQuery(
      `UPDATE adm_assinatura 
       SET status = 'ATIVO',
           dt_demonstracao = NULL,
           dt_bloqueio = NULL,
           dt_alteracao = NOW()
       WHERE id = $1`,
      [assinatura.id]
    );

    log.info(`Assinatura ${assinatura.id} ativada após pagamento bem-sucedido`);
    return 'activated';
  }

  return 'success';
}

/**
 * Falha no pagamento
 */
async function handlePaymentFailed(event: Stripe.Event): Promise<string> {
  const invoice = event.data.object as any;
  const subscription = invoice.subscription;
  const subscriptionId = typeof subscription === 'string' 
    ? subscription 
    : subscription?.id;

  if (!subscriptionId) {
    return 'no_subscription';
  }

  const assinatura = await getOne<{ id: number }>(
    `SELECT id FROM adm_assinatura 
     WHERE stripe_subscription_id = $1 AND dt_excluido IS NULL`,
    [subscriptionId]
  );

  if (!assinatura) {
    log.info(`Assinatura não encontrada para subscription ${subscriptionId}`);
    return 'not_found';
  }

  // Marcar como inadimplente e bloquear
  await runQuery(
    `UPDATE adm_assinatura 
     SET status = 'INADIMPLENTE',
         dt_bloqueio = NOW(),
         dt_alteracao = NOW()
     WHERE id = $1`,
    [assinatura.id]
  );

  log.info(`Assinatura ${assinatura.id} marcada como inadimplente após falha no pagamento`);
  
  // TODO Phase 6: Enviar email de cobrança
  
  return 'marked_overdue';
}

/**
 * Subscription cancelada/deletada no Stripe
 */
async function handleSubscriptionDeleted(event: Stripe.Event): Promise<string> {
  const subscription = event.data.object as Stripe.Subscription;

  const assinatura = await getOne<{ id: number }>(
    `SELECT id FROM adm_assinatura 
     WHERE stripe_subscription_id = $1 AND dt_excluido IS NULL`,
    [subscription.id]
  );

  if (!assinatura) {
    return 'not_found';
  }

  // Soft delete da assinatura
  await runQuery(
    `UPDATE adm_assinatura 
     SET dt_excluido = NOW(),
         dt_alteracao = NOW()
     WHERE id = $1`,
    [assinatura.id]
  );

  log.info(`Assinatura ${assinatura.id} marcada como excluída após cancelamento no Stripe`);
  
  return 'deleted';
}

/**
 * Subscription atualizada (mudanças de status, plano, etc)
 */
async function handleSubscriptionUpdated(event: Stripe.Event): Promise<string> {
  const subscription = event.data.object as Stripe.Subscription;

  const assinatura = await getOne<{ id: number; status: string }>(
    `SELECT id, status FROM adm_assinatura 
     WHERE stripe_subscription_id = $1 AND dt_excluido IS NULL`,
    [subscription.id]
  );

  if (!assinatura) {
    return 'not_found';
  }

  // Mapear status do Stripe para status interno
  let novoStatus = assinatura.status;
  
  switch (subscription.status) {
    case 'active':
      novoStatus = 'ATIVO';
      break;
    case 'past_due':
      novoStatus = 'INADIMPLENTE';
      break;
    case 'canceled':
    case 'unpaid':
      novoStatus = 'CANCELADO';
      break;
    case 'trialing':
      novoStatus = 'TRIAL';
      break;
  }

  if (novoStatus !== assinatura.status) {
    await runQuery(
      `UPDATE adm_assinatura 
       SET status = $1,
           dt_alteracao = NOW()
       WHERE id = $2`,
      [novoStatus, assinatura.id]
    );

    log.info(`Assinatura ${assinatura.id} status atualizado: ${assinatura.status} → ${novoStatus}`);
  }

  return 'updated';
}

/**
 * Trial expirando em breve (3 dias antes por padrão)
 */
async function handleTrialWillEnd(event: Stripe.Event): Promise<string> {
  const subscription = event.data.object as Stripe.Subscription;

  const assinatura = await getOne<{ id: number; email: string; nome: string }>(
    `SELECT id, email, nome FROM adm_assinatura 
     WHERE stripe_subscription_id = $1 AND dt_excluido IS NULL`,
    [subscription.id]
  );

  if (!assinatura) {
    return 'not_found';
  }

  log.info(`Trial da assinatura ${assinatura.id} expirará em breve`);
  
  // TODO Phase 6: Enviar email de lembrete
  
  return 'reminder_sent';
}
