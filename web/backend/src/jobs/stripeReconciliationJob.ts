import cron from 'node-cron';
import { getAll, runQuery } from '../database/connection';
import { getSubscriptionStatus } from '../services/stripeSubscriptionService';
import { log } from '../utils/logger';

/**
 * Job de reconciliação entre banco de dados e Stripe
 * Roda diariamente às 3h da manhã
 * 
 * Verifica discrepâncias entre status local e status no Stripe
 * e atualiza o banco de dados para refletir a realidade do Stripe
 */
export function startStripeReconciliationJob() {
  // Executar diariamente às 3h da manhã
  cron.schedule('0 3 * * *', async () => {
    const inicio = Date.now();
    log.info('Iniciando reconciliação Stripe');

    try {
      // Buscar todas assinaturas ativas com subscription no Stripe
      const assinaturas = await getAll<{
        id: number;
        nome: string;
        email: string;
        stripe_subscription_id: string;
        status: string;
      }>(
        `SELECT id, nome, email, stripe_subscription_id, status
         FROM adm_assinatura
         WHERE stripe_subscription_id IS NOT NULL
           AND dt_excluido IS NULL`
      );

      if (assinaturas.length === 0) {
        log.info('Nenhuma assinatura para reconciliar');
        await registrarExecucao('stripe_reconciliation', true, Date.now() - inicio, 0);
        return;
      }

      log.info(`${assinaturas.length} assinaturas para verificar`);

      let sucessos = 0;
      let falhas = 0;
      let divergencias = 0;

      // Verificar cada assinatura
      for (const assinatura of assinaturas) {
        try {
          // Buscar status no Stripe
          const subscriptionStripe = await getSubscriptionStatus(assinatura.stripe_subscription_id);

          if (!subscriptionStripe) {
            log.error(`Subscription ${assinatura.stripe_subscription_id} não encontrada no Stripe`);
            falhas++;
            continue;
          }

          // Mapear status do Stripe para status interno
          let statusEsperado = assinatura.status;
          
          switch (subscriptionStripe.status) {
            case 'active':
              statusEsperado = 'ATIVO';
              break;
            case 'trialing':
              statusEsperado = 'TRIAL';
              break;
            case 'past_due':
              statusEsperado = 'INADIMPLENTE';
              break;
            case 'canceled':
            case 'unpaid':
              statusEsperado = 'CANCELADO';
              break;
          }

          // Se houver divergência, atualizar banco
          if (statusEsperado !== assinatura.status) {
            await runQuery(
              `UPDATE adm_assinatura
               SET status = $1,
                   dt_alteracao = NOW()
               WHERE id = $2`,
              [statusEsperado, assinatura.id]
            );

            divergencias++;
            log.info(
              `Assinatura ${assinatura.id} atualizada: ` +
              `${assinatura.status} → ${statusEsperado} (Stripe: ${subscriptionStripe.status})`
            );
          }

          sucessos++;
        } catch (error: any) {
          falhas++;
          log.error(`Erro ao reconciliar assinatura ${assinatura.id}: ${error.message}`);
        }
      }

      const duracao = Date.now() - inicio;
      log.info(`Concluído: ${sucessos} verificadas, ${divergencias} atualizadas, ${falhas} falhas em ${duracao}ms`);

      await registrarExecucao('stripe_reconciliation', falhas === 0, duracao, divergencias);
    } catch (error: any) {
      const duracao = Date.now() - inicio;
      log.error(`Erro ao executar job: ${error.message}`);
      await registrarExecucao('stripe_reconciliation', false, duracao, 0, error.message);
    }
  });

  log.info('Agendado para rodar diariamente às 3h');
}

/**
 * Registra execução do job na tabela cron_execucoes
 */
async function registrarExecucao(
  nome: string,
  sucesso: boolean,
  duracaoMs: number,
  registrosProcessados: number,
  erro?: string
) {
  try {
    await runQuery(
      `INSERT INTO cron_execucoes 
       (nome_job, executado_em, sucesso, duracao_ms, registros_processados, erro)
       VALUES ($1, NOW(), $2, $3, $4, $5)`,
      [nome, sucesso ? 1 : 0, duracaoMs, registrosProcessados, erro || null]
    );
  } catch (error: any) {
    log.error(`Erro ao registrar execução: ${error.message}`);
  }
}
