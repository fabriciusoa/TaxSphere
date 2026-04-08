import cron from 'node-cron';
import { getAll, runQuery } from '../database/connection';
import { deleteAbandonedSubscription } from '../services/stripeSubscriptionService';
import { log } from '../utils/logger';

/**
 * Job para deletar assinaturas abandonadas
 * Roda diariamente às 2h da manhã
 * 
 * Critério: Assinatura criada há mais de 24h sem stripe_subscription_id
 * (usuário iniciou processo mas não confirmou pagamento)
 */
export function startAbandonedSubscriptionsJob() {
  // Executar diariamente às 2h da manhã
  cron.schedule('0 2 * * *', async () => {
    const inicio = Date.now();
    log.info('Iniciando verificação de assinaturas abandonadas');

    try {
      // Buscar assinaturas abandonadas (criadas há mais de 24h sem subscription)
      const assinaturasAbandonadas = await getAll<{
        id: number;
        nome: string;
        email: string;
        stripe_customer_id: string | null;
        dt_criacao: string;
      }>(
        `SELECT id, nome, email, stripe_customer_id, dt_criacao
         FROM adm_assinatura
         WHERE dt_criacao < datetime('now', '-24 hours')
           AND stripe_subscription_id IS NULL
           AND dt_excluido IS NULL`
      );

      if (assinaturasAbandonadas.length === 0) {
        log.info('Nenhuma assinatura abandonada encontrada');
        await registrarExecucao('abandoned_subscriptions', true, Date.now() - inicio, 0);
        return;
      }

      log.info(`${assinaturasAbandonadas.length} assinaturas abandonadas encontradas`);

      let sucessos = 0;
      let falhas = 0;

      // Processar cada assinatura abandonada
      for (const assinatura of assinaturasAbandonadas) {
        try {
          await deleteAbandonedSubscription(assinatura);
          sucessos++;
          
          log.info(`Assinatura ${assinatura.id} (${assinatura.email}) deletada com sucesso`);
          
          // TODO Phase 6: Enviar email notificando sobre exclusão
          
        } catch (error: any) {
          falhas++;
          log.error(`Erro ao deletar assinatura ${assinatura.id}: ${error.message}`);
        }
      }

      const duracao = Date.now() - inicio;
      log.info(`Concluído: ${sucessos} sucessos, ${falhas} falhas em ${duracao}ms`);

      await registrarExecucao('abandoned_subscriptions', falhas === 0, duracao, sucessos);
    } catch (error: any) {
      const duracao = Date.now() - inicio;
      log.error(`Erro ao executar job: ${error.message}`);
      await registrarExecucao('abandoned_subscriptions', false, duracao, 0, error.message);
    }
  });

  log.info('Agendado para rodar diariamente às 2h');
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
       VALUES (?, datetime('now'), ?, ?, ?, ?)`,
      [nome, sucesso ? 1 : 0, duracaoMs, registrosProcessados, erro || null]
    );
  } catch (error: any) {
    log.error(`Erro ao registrar execução: ${error.message}`);
  }
}
