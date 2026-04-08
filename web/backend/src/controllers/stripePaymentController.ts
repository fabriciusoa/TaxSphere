import { Request, Response } from 'express';
import { getOne } from '../database/connection';
import { getStripeInstance } from '../config/stripeConfig';
import { logStripeSuccess, logStripeFailure } from '../utils/auditLogger';
import { log } from '../utils/logger';

export const stripePaymentController = {
  /**
   * Cria um Setup Intent para capturar método de pagamento do cliente
   * Usado na Etapa 3 do formulário de assinatura público
   */
  async criarSetupIntent(req: Request, res: Response) {
    try {
      const { assinatura_id } = req.body;

      if (!assinatura_id) {
        return res.status(400).json({ erro: 'assinatura_id é obrigatório' });
      }

      // Buscar assinatura
      const assinatura = await getOne<{
        id: number;
        nome: string;
        email: string;
        stripe_customer_id: string | null;
        dt_excluido: string | null;
      }>(
        `SELECT id, nome, email, stripe_customer_id, dt_excluido 
         FROM adm_assinatura 
         WHERE id = ?`,
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
          erro: 'Customer Stripe não criado ainda. Aguarde sincronização.' 
        });
      }

      // Obter instância do Stripe
      const stripe = await getStripeInstance();

      // Criar Setup Intent
      const setupIntent = await stripe.setupIntents.create({
        customer: assinatura.stripe_customer_id,
        payment_method_types: ['card'],
        metadata: {
          assinatura_id: assinatura.id.toString(),
          assinatura_email: assinatura.email,
          sistema: 'mentis'
        }
      });

      // Registrar em audit log
      await logStripeSuccess(
        'setup_intent_created',
        'create',
        'setup_intent',
        setupIntent.id,
        { assinatura_id, customer: assinatura.stripe_customer_id },
        { setup_intent_id: setupIntent.id, status: setupIntent.status },
        {
          id_assinatura: assinatura.id,
          ip_origem: req.ip,
          metadata: { customer_id: assinatura.stripe_customer_id }
        }
      );

      log.info(`Setup Intent criado: ${setupIntent.id} para assinatura ${assinatura.id}`);

      res.json({
        client_secret: setupIntent.client_secret,
        assinatura_id: assinatura.id
      });
    } catch (error: any) {
      log.error(`Erro ao criar Setup Intent: ${error.message}`);

      await logStripeFailure(
        'setup_intent_created',
        'create',
        error.message,
        { assinatura_id: req.body.assinatura_id },
        { error: error.message, code: error.code },
        {
          id_assinatura: req.body.assinatura_id,
          ip_origem: req.ip
        }
      );

      res.status(500).json({ 
        erro: 'Erro ao criar Setup Intent',
        detalhes: error.message 
      });
    }
  }
};
