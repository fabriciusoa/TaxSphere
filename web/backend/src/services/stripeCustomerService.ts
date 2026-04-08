import { getStripeInstance } from '../config/stripeConfig';
import { log } from '../utils/logger';
import Stripe from 'stripe';

interface AssinaturaData {
  id?: number;
  nome: string;
  email: string;
  cpf: string;
  telefone: string;
  cep: string;
  endereco: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  dt_nascimento: string;
  id_adm_plano: number;
  dt_criacao?: string;
  status?: string;
}

/**
 * Cria um Customer no Stripe com dados completos
 */
export async function createCustomer(assinatura: AssinaturaData): Promise<string> {
  try {
    const stripe = await getStripeInstance();

    const customerData: Stripe.CustomerCreateParams = {
      name: assinatura.nome,
      email: assinatura.email,
      phone: assinatura.telefone,
      address: {
        line1: `${assinatura.endereco}, ${assinatura.numero}`,
        line2: assinatura.complemento || undefined,
        city: assinatura.cidade,
        state: assinatura.uf,
        postal_code: assinatura.cep,
        country: 'BR'
      },
      metadata: {
        system_id: assinatura.id?.toString() || '',
        cpf: assinatura.cpf,
        dt_nascimento: assinatura.dt_nascimento,
        id_adm_plano: assinatura.id_adm_plano.toString(),
        dt_criacao: assinatura.dt_criacao || new Date().toISOString(),
        status: assinatura.status || 'DEMONSTRACAO'
      }
    };

    const customer = await stripe.customers.create(customerData);

    log.info(`Customer Stripe criado: ${customer.id} - ${assinatura.email}`);

    return customer.id;
  } catch (error: any) {
    log.error(`Erro ao criar customer no Stripe: ${error.message}`);
    throw new Error(`Stripe API error: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Atualiza dados de um Customer no Stripe
 */
export async function updateCustomer(
  customerId: string,
  assinatura: AssinaturaData
): Promise<void> {
  try {
    const stripe = await getStripeInstance();

    const updateData: Stripe.CustomerUpdateParams = {
      name: assinatura.nome,
      email: assinatura.email,
      phone: assinatura.telefone,
      address: {
        line1: `${assinatura.endereco}, ${assinatura.numero}`,
        line2: assinatura.complemento || undefined,
        city: assinatura.cidade,
        state: assinatura.uf,
        postal_code: assinatura.cep,
        country: 'BR'
      },
      metadata: {
        system_id: assinatura.id?.toString() || '',
        cpf: assinatura.cpf,
        dt_nascimento: assinatura.dt_nascimento,
        id_adm_plano: assinatura.id_adm_plano.toString(),
        status: assinatura.status || 'DEMONSTRACAO'
      }
    };

    await stripe.customers.update(customerId, updateData);

    log.info(`Customer Stripe atualizado: ${customerId}`);
  } catch (error: any) {
    log.error(`Erro ao atualizar customer no Stripe: ${error.message}`);
    throw new Error(`Stripe API error: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Arquiva um Customer no Stripe (soft delete)
 */
export async function archiveCustomer(customerId: string): Promise<void> {
  try {
    const stripe = await getStripeInstance();

    await stripe.customers.del(customerId);

    log.info(`Customer Stripe arquivado: ${customerId}`);
  } catch (error: any) {
    log.error(`Erro ao arquivar customer no Stripe: ${error.message}`);
    throw new Error(`Stripe API error: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Busca Customer por email no Stripe
 * Retorna customer_id se encontrado, null caso contrário
 */
export async function findCustomerByEmail(email: string): Promise<string | null> {
  try {
    const stripe = await getStripeInstance();

    const customers = await stripe.customers.list({
      email: email,
      limit: 1
    });

    if (customers.data.length > 0) {
      log.info(`Customer encontrado no Stripe: ${customers.data[0].id} - ${email}`);
      return customers.data[0].id;
    }

    return null;
  } catch (error: any) {
    log.error(`Erro ao buscar customer no Stripe: ${error.message}`);
    return null;
  }
}
