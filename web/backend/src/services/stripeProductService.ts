import { getStripeInstance } from '../config/stripeConfig';
import { log } from '../utils/logger';

interface PlanoItem {
  descricao: string;
  ativo: string;
}

interface Plano {
  id?: number;
  descricao: string;
  valor: number;
  ativo: string;
  dt_inclusao?: string;
}

interface CreateProductResult {
  productId: string;
  priceId: string;
}

/**
 * Formata itens do plano para descrição legível
 */
function formatarDescricao(itens: PlanoItem[]): string {
  const itensAtivos = itens.filter(item => item.ativo === 'S');
  
  if (itensAtivos.length === 0) {
    return 'Plano de assinatura';
  }

  return itensAtivos.map(item => `• ${item.descricao}`).join('\n');
}

/**
 * Cria um produto e preço no Stripe
 */
export async function createProduct(
  plano: Plano,
  itens: PlanoItem[] = []
): Promise<CreateProductResult> {
  try {
    const stripe = await getStripeInstance();

    // Criar Product
    const product = await stripe.products.create({
      name: plano.descricao,
      description: formatarDescricao(itens),
      metadata: {
        system_id: plano.id?.toString() || '',
        system_status: plano.ativo,
        system_created_at: plano.dt_inclusao || new Date().toISOString(),
        items_count: itens.filter(i => i.ativo === 'S').length.toString()
      },
      active: plano.ativo === 'S'
    });

    log.info(`Product Stripe criado: ${product.id} - ${plano.descricao}`);

    // Criar Price (em centavos)
    const valorEmCentavos = Math.round(plano.valor * 100);
    
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'brl',
      unit_amount: valorEmCentavos,
      recurring: {
        interval: 'month'
      },
      tax_behavior: 'exclusive', // Para Stripe Tax calcular impostos separadamente
      metadata: {
        system_plano_id: plano.id?.toString() || ''
      }
    });

    log.info(`Price Stripe criado: ${price.id} - R$ ${plano.valor}`);

    return {
      productId: product.id,
      priceId: price.id
    };
  } catch (error: any) {
    log.error(`Erro ao criar produto no Stripe: ${error.message}`);
    throw new Error(`Stripe API error: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Cria um novo preço para um produto existente
 * Usado quando o valor do plano é alterado
 */
export async function createNewPrice(
  productId: string,
  novoValor: number,
  planoId?: number
): Promise<string> {
  try {
    const stripe = await getStripeInstance();

    const valorEmCentavos = Math.round(novoValor * 100);

    const price = await stripe.prices.create({
      product: productId,
      currency: 'brl',
      unit_amount: valorEmCentavos,
      recurring: {
        interval: 'month'
      },
      tax_behavior: 'exclusive',
      metadata: {
        system_plano_id: planoId?.toString() || '',
        created_at: new Date().toISOString()
      }
    });

    log.info(`Novo Price criado: ${price.id} - R$ ${novoValor} para produto ${productId}`);

    return price.id;
  } catch (error: any) {
    log.error(`Erro ao criar novo preço no Stripe: ${error.message}`);
    throw new Error(`Stripe API error: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Atualiza metadados e descrição de um produto
 * Usado quando descrição ou itens do plano são alterados
 */
export async function updateProduct(
  productId: string,
  descricao: string,
  itens: PlanoItem[] = [],
  ativo: string = 'S',
  planoId?: number
): Promise<void> {
  try {
    const stripe = await getStripeInstance();

    await stripe.products.update(productId, {
      name: descricao,
      description: formatarDescricao(itens),
      metadata: {
        system_id: planoId?.toString() || '',
        system_status: ativo,
        items_count: itens.filter(i => i.ativo === 'S').length.toString(),
        updated_at: new Date().toISOString()
      },
      active: ativo === 'S'
    });

    log.info(`Product Stripe atualizado: ${productId}`);
  } catch (error: any) {
    log.error(`Erro ao atualizar produto no Stripe: ${error.message}`);
    throw new Error(`Stripe API error: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Arquiva um produto no Stripe
 * Produtos arquivados não podem ser usados em novas subscriptions
 */
export async function archiveProduct(productId: string): Promise<void> {
  try {
    const stripe = await getStripeInstance();

    await stripe.products.update(productId, {
      active: false
    });

    log.info(`Product Stripe arquivado: ${productId}`);
  } catch (error: any) {
    log.error(`Erro ao arquivar produto no Stripe: ${error.message}`);
    throw new Error(`Stripe API error: ${error.message || 'Unknown error'}`);
  }
}
