import { getAll, runQuery } from '../database/connection';
import { createProduct } from '../services/stripeProductService';
import { log } from '../utils/logger';

interface Plano {
  id: number;
  descricao: string;
  valor: number;
  ativo: string;
  dt_inclusao: string;
}

interface PlanoItem {
  descricao: string;
  ativo: string;
}

/**
 * Script para sincronizar planos existentes com Stripe
 * Busca planos sem id_product_stripe e cria no Stripe
 */
async function syncPlansToStripe() {
  try {
    log.info('🔄 Iniciando sincronização de planos com Stripe...');

    // Buscar planos ativos sem Stripe Product ID
    const planosParaSincronizar = await getAll<Plano>(
      `SELECT id, descricao, valor, ativo, dt_inclusao
       FROM adm_planos
       WHERE id_product_stripe IS NULL AND ativo = 'S'
       ORDER BY id ASC`
    );

    if (planosParaSincronizar.length === 0) {
      log.info('✅ Todos os planos já estão sincronizados com Stripe.');
      return;
    }

    log.info(`📦 Encontrados ${planosParaSincronizar.length} plano(s) para sincronizar:`);
    let sucessos = 0;
    let falhas = 0;

    for (const plano of planosParaSincronizar) {
      try {
        log.info(`Processando: [${plano.id}] ${plano.descricao} - R$ ${plano.valor}`);

        // Buscar itens do plano
        const itens = await getAll<PlanoItem>(
          `SELECT descricao, ativo
           FROM adm_plano_itens
           WHERE id_adm_plano = ? AND dt_exclusao IS NULL`,
          [plano.id]
        );

        // Criar no Stripe
        const resultado = await createProduct(plano, itens);

        // Atualizar banco
        await runQuery(
          `UPDATE adm_planos
           SET id_product_stripe = ?, id_price_stripe = ?
           WHERE id = ?`,
          [resultado.productId, resultado.priceId, plano.id]
        );

        log.info(`✅ Sincronizado: Product ${resultado.productId} | Price ${resultado.priceId}`);
        sucessos++;

      } catch (error: any) {
        log.error(`❌ Erro ao sincronizar plano ${plano.id}: ${error.message}`);
        log.error(`❌ Erro ao sincronizar plano ${plano.id}: ${error.stack}`);
        falhas++;
      }
    }

    log.info('\n📊 Relatório de Sincronização:');
    log.info(`   ✅ Sucessos: ${sucessos}`);
    log.info(`   ❌ Falhas: ${falhas}`);
    log.info(`   📦 Total: ${planosParaSincronizar.length}`);

  } catch (error: any) {
    log.error(`❌ Erro fatal na sincronização: ${error.message}`);
    log.error(`❌ Erro fatal na sincronização: ${error.stack}`);
    process.exit(1);
  }
}

// Executar script
syncPlansToStripe()
  .then(() => {
    log.info('\n✅ Sincronização concluída com sucesso!');
    process.exit(0);
  })
  .catch((error: any) => {
    log.error(`\n❌ Sincronização falhou: ${error.message}`);
    log.error(`\n❌ Sincronização falhou: ${error.stack}`);
    process.exit(1);
  });
