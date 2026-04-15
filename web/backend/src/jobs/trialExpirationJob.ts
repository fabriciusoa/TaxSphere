import cron from 'node-cron';
import { getAll, runQuery } from '../database/connection';
import { log } from '../utils/logger';

/**
 * Job para bloquear usuários com período de trial expirado
 * Roda diariamente às 6h da manhã
 * 
 * Critério: dt_demonstracao vencida E sem stripe_subscription_id
 * (usuário não converteu o trial em assinatura paga)
 */
export function startTrialExpirationJob() {
  // Executar diariamente às 6h da manhã
  cron.schedule('0 6 * * *', async () => {
    const inicio = Date.now();
    log.info('Iniciando verificação de trials expirados');

    try {
      // Buscar assinaturas com trial expirado sem subscription
      const trialsExpirados = await getAll<{
        id: number;
        nome: string;
        email: string;
        dt_demonstracao: string;
        status: string;
      }>(
        `SELECT id, nome, email, dt_demonstracao, status
         FROM adm_assinatura
         WHERE dt_demonstracao < NOW()
           AND stripe_subscription_id IS NULL
           AND dt_excluido IS NULL
           AND status != 'INADIMPLENTE'`
      );

      if (trialsExpirados.length === 0) {
        log.info('Nenhum trial expirado encontrado');
        await registrarExecucao('trial_expiration', true, Date.now() - inicio, 0);
        return;
      }

      log.info(`${trialsExpirados.length} trials expirados encontrados`);

      let sucessos = 0;
      let falhas = 0;

      // Bloquear cada assinatura com trial expirado
      for (const assinatura of trialsExpirados) {
        try {
          await runQuery(
            `UPDATE adm_assinatura
             SET status = 'INADIMPLENTE',
                 dt_bloqueio = NOW(),
                 dt_alteracao = NOW()
             WHERE id = $1`,
            [assinatura.id]
          );

          sucessos++;
          log.info(`Assinatura ${assinatura.id} (${assinatura.email}) bloqueada por trial expirado`);

          // TODO Phase 6: Enviar email notificando sobre expiração do trial
          
        } catch (error: any) {
          falhas++;
          log.error(`Erro ao bloquear assinatura ${assinatura.id}: ${error.message}`);
        }
      }

      const duracao = Date.now() - inicio;
      log.info(`Concluído: ${sucessos} bloqueios, ${falhas} falhas em ${duracao}ms`);

      await registrarExecucao('trial_expiration', falhas === 0, duracao, sucessos);
    } catch (error: any) {
      const duracao = Date.now() - inicio;
      log.error(`Erro ao executar job: ${error.message}`);
      await registrarExecucao('trial_expiration', false, duracao, 0, error.message);
    }
  });

  log.info('Agendado para rodar diariamente às 6h');
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
