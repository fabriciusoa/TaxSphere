import { getAll, runQuery } from '../database/connection';
import { createCustomer } from '../services/stripeCustomerService';
import { log } from '../utils/logger';

interface Assinatura {
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
 * Script para sincronizar assinaturas existentes com Stripe Customers
 * Busca assinaturas sem stripe_customer_id e cria Customer no Stripe
 */
async function syncCustomersToStripe() {
  try {
    log.info('🔄 Iniciando sincronização de assinaturas com Stripe Customers.');

    // Buscar assinaturas ativas sem Stripe Customer ID
    const assinaturasParaSincronizar = await getAll<Assinatura>(
      `SELECT id, nome, email, cpf, telefone, cep, endereco, numero, complemento,
              bairro, cidade, uf, dt_nascimento, id_adm_plano, dt_criacao, status
       FROM adm_assinatura
       WHERE stripe_customer_id IS NULL 
         AND dt_excluido IS NULL
         AND status IN ('DEMONSTRACAO', 'ATIVO')
       ORDER BY dt_criacao DESC`
    );

    if (assinaturasParaSincronizar.length === 0) {
      log.info('✅ Todas as assinaturas já estão sincronizadas com Stripe.');
      return;
    }

    log.info(`📦 Encontradas ${assinaturasParaSincronizar.length} assinatura(s) para sincronizar`);

    let sucessos = 0;
    let falhas = 0;

    for (const assinatura of assinaturasParaSincronizar) {
      try {
        log.info(`Processando: [${assinatura.id}] ${assinatura.nome} - ${assinatura.email}`);

        // Criar Customer no Stripe
        const customerId = await createCustomer({
          ...assinatura,
          complemento: assinatura.complemento || undefined
        });

        // Atualizar banco
        await runQuery(
          'UPDATE adm_assinatura SET stripe_customer_id = ? WHERE id = ?',
          [customerId, assinatura.id]
        );

        log.info(`✅ Sincronizado: Customer ${customerId}\n`);
        sucessos++;

      } catch (error: any) {
        log.error(`❌ Erro ao sincronizar assinatura ${assinatura.id}: ${error.message}`);
        log.error(`❌ Erro ao sincronizar assinatura ${assinatura.id}: ${error.stack}`);
        falhas++;
      }
    }

    log.info('\n📊 Relatório de Sincronização:');
    log.info(`   ✅ Sucessos: ${sucessos}`);
    log.info(`   ❌ Falhas: ${falhas}`);
    log.info(`   📦 Total: ${assinaturasParaSincronizar.length}`);

  } catch (error: any) {
    log.error(`❌ Erro fatal na sincronização: ${error.message}`);
    log.error(`❌ Erro fatal na sincronização: ${error.stack}`);
    process.exit(1);
  }
}

// Executar script
syncCustomersToStripe()
  .then(() => {
    log.info('\n✅ Sincronização concluída com sucesso!');
    process.exit(0);
  })
  .catch((error: any) => {
    log.error(`\n❌ Sincronização falhou: ${error.message}`);
    log.error(`\n❌ Sincronização falhou: ${error.stack}`);
    process.exit(1);
  });
