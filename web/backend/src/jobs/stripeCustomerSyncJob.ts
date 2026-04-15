import cron from 'node-cron';
import { getAll, runQuery } from '../database/connection';
import { createCustomer } from '../services/stripeCustomerService';
import { log } from '../utils/logger';

interface AssinaturaPendente {
    id: number;
    nome: string;
    email: string;
    cpf: string;
    telefone: string;
    cep: string;
    endereco: string;
    numero: string;
    complemento: string | null;
    bairro: string;
    cidade: string;
    uf: string;
    dt_nascimento: string;
    id_adm_plano: number;
    dt_criacao: string;
    status: string;
}

/**
 * Tenta criar Customers no Stripe para assinaturas pendentes
 */
async function syncPendingCustomers() {
    try {
        // Buscar assinaturas sem stripe_customer_id
        const assinaturasPendentes = await getAll<AssinaturaPendente>(
            `SELECT id, nome, email, cpf, telefone, cep, endereco, numero, complemento,
              bairro, cidade, uf, dt_nascimento, id_adm_plano, dt_criacao, status
       FROM adm_assinatura
       WHERE stripe_customer_id IS NULL 
         AND dt_excluido IS NULL
         AND status IN ('DEMONSTRACAO', 'ATIVO')
       LIMIT 10`
        );

        if (assinaturasPendentes.length === 0) {
            return;
        }

        log.info(`Tentando sincronizar ${assinaturasPendentes.length} assinatura(s) pendente(s)`);

        for (const assinatura of assinaturasPendentes) {
            try {
                const customerId = await createCustomer({
                    ...assinatura,
                    complemento: assinatura.complemento || undefined
                });

                await runQuery(
                    'UPDATE adm_assinatura SET stripe_customer_id = $1 WHERE id = $2',
                    [customerId, assinatura.id]
                );

                log.info(`Assinatura ${assinatura.id} sincronizada com Customer ${customerId}`);
                await registrarExecucao('stripe_customer_sync', true, 1, 1);
            } catch (error: any) {
                log.error(`Falha ao sincronizar assinatura ${assinatura.id}: ${error.message}`);
                await registrarExecucao('stripe_customer_sync', false, 1, 1, error.message);
            }
        }
    } catch (error: any) {
        log.error(`Erro ao processar assinaturas pendentes: ${error.message}`);
    }
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
/**
 * Configura cron job para executar a cada 30 minutos
 * Formato: minuto hora dia mês dia-da-semana
 */
export function startStripeCustomerSyncJob() {
    // Executa a cada 30 minutos
    cron.schedule('*/30 * * * *', async () => {
        log.info('Iniciando sincronização de Customers Stripe');
        await syncPendingCustomers();
    });

    log.info('Sincronização Stripe Customers configurado (a cada 30 minutos)');
}
