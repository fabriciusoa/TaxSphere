import { Request, Response } from 'express';
import { getOne, runQuery } from '../database/connection';
import { createSubscription } from '../services/stripeSubscriptionService';
import { logStripeSuccess, logStripeFailure } from '../utils/auditLogger';
import { getParametro } from '../utils/parametrosHelper';
import { log } from '../utils/logger';

export const stripeSubscriptionController = {
  /**
   * Cria uma Subscription no Stripe após captura do payment method
   * Chamado após confirmação do Setup Intent no frontend
   */
  async criarSubscription(req: Request, res: Response) {
    try {
      const { assinatura_id, payment_method_id } = req.body;

      if (!assinatura_id || !payment_method_id) {
        return res.status(400).json({ 
          erro: 'assinatura_id e payment_method_id são obrigatórios' 
        });
      }

      // 1. Buscar assinatura com informações do plano
      const assinatura = await getOne<{
        id: number;
        nome: string;
        email: string;
        id_adm_plano: number;
        stripe_customer_id: string | null;
        stripe_subscription_id: string | null;
        dt_excluido: string | null;
        plano_descricao: string;
        id_price_stripe: string | null;
      }>(
        `SELECT 
          a.id, a.nome, a.email, a.id_adm_plano,
          a.stripe_customer_id, a.stripe_subscription_id, a.dt_excluido,
          p.descricao as plano_descricao, p.id_price_stripe
         FROM adm_assinatura a
         INNER JOIN adm_planos p ON a.id_adm_plano = p.id
         WHERE a.id = $1`,
        [assinatura_id]
      );

      if (!assinatura) {
        return res.status(404).json({ erro: 'Assinatura não encontrada' });
      }

      if (assinatura.dt_excluido) {
        return res.status(400).json({ erro: 'Assinatura foi excluída' });
      }

      if (!assinatura.stripe_customer_id) {
        return res.status(400).json({ 
          erro: 'Customer Stripe não criado. Aguarde sincronização.' 
        });
      }

      if (assinatura.stripe_subscription_id) {
        return res.status(400).json({ 
          erro: 'Subscription já foi criada para esta assinatura',
          subscription_id: assinatura.stripe_subscription_id
        });
      }

      if (!assinatura.id_price_stripe) {
        return res.status(400).json({ 
          erro: 'Plano não possui Price ID do Stripe configurado' 
        });
      }

      // 2. Obter período de trial dos parâmetros
      const trialDaysStr = await getParametro('STRIPE_TRIAL_PERIOD_DAYS');
      const trialDays = parseInt(trialDaysStr || '7');

      // 3. Criar subscription no Stripe
      let subscriptionId: string;
      try {
        subscriptionId = await createSubscription(
          assinatura.stripe_customer_id,
          assinatura.id_price_stripe,
          payment_method_id,
          trialDays,
          {
            assinatura_id: assinatura.id.toString(),
            plano_id: assinatura.id_adm_plano.toString(),
            sistema: 'mentis'
          }
        );
      } catch (stripeError: any) {
        await logStripeFailure(
          'subscription_created',
          'create',
          stripeError.message,
          {
            assinatura_id,
            customer_id: assinatura.stripe_customer_id,
            price_id: assinatura.id_price_stripe,
            payment_method_id
          },
          { error: stripeError.message },
          {
            id_assinatura: assinatura.id,
            ip_origem: req.ip
          }
        );
        log.error(`Erro ao criar subscription: ${stripeError.message}`);
        return res.status(500).json({ 
          erro: 'Erro ao criar subscription no Stripe',
          detalhes: stripeError.message 
        });
      }

      // 4. Atualizar banco de dados
      await runQuery(
        `UPDATE adm_assinatura 
         SET stripe_subscription_id = $1,
             stripe_payment_method_id = $2
         WHERE id = $3`,
        [subscriptionId, payment_method_id, assinatura.id]
      );

      // 5. Registrar em audit log
      await logStripeSuccess(
        'subscription_created',
        'create',
        'subscription',
        subscriptionId,
        {
          assinatura_id,
          customer_id: assinatura.stripe_customer_id,
          price_id: assinatura.id_price_stripe,
          payment_method_id,
          trial_days: trialDays
        },
        {
          subscription_id: subscriptionId,
          status: 'trialing'
        },
        {
          id_assinatura: assinatura.id,
          ip_origem: req.ip,
          metadata: {
            plano: assinatura.plano_descricao,
            email: assinatura.email
          }
        }
      );

      log.info(`Subscription ${subscriptionId} criada para assinatura ${assinatura.id}`);

      res.json({
        success: true,
        subscription_id: subscriptionId,
        trial_days: trialDays,
        message: 'Subscription criada com sucesso'
      });
    } catch (error: any) {
      log.error(`Erro ao criar subscription: ${error.message}`);

      await logStripeFailure(
        'subscription_created',
        'create',
        error.message,
        { assinatura_id: req.body.assinatura_id },
        { error: error.message },
        {
          id_assinatura: req.body.assinatura_id,
          ip_origem: req.ip
        }
      );

      res.status(500).json({ 
        erro: 'Erro ao criar subscription',
        detalhes: error.message 
      });
    }
  }
};
