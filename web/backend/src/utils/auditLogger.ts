import { runQuery } from '../database/connection';
import { log } from '../utils/logger';

interface AuditLogData {
  id_assinatura?: number | null;
  evento_tipo: string;
  stripe_objeto_tipo?: string | null;
  stripe_objeto_id?: string | null;
  acao: string;
  status: 'success' | 'failed' | 'pending';
  dados_request?: any;
  dados_response?: any;
  erro_mensagem?: string | null;
  usuario_id?: number | null;
  ip_origem?: string | null;
  metadata?: any;
}

/**
 * Registra uma ação relacionada ao Stripe na tabela de auditoria
 * @param data Dados da ação a ser registrada
 */
export async function logStripeAction(data: AuditLogData): Promise<void> {
  try {
    const {
      id_assinatura,
      evento_tipo,
      stripe_objeto_tipo,
      stripe_objeto_id,
      acao,
      status,
      dados_request,
      dados_response,
      erro_mensagem,
      usuario_id,
      ip_origem,
      metadata
    } = data;

    await runQuery(
      `INSERT INTO adm_stripe_audit_log (
        id_assinatura,
        evento_tipo,
        stripe_objeto_tipo,
        stripe_objeto_id,
        acao,
        status,
        dados_request,
        dados_response,
        erro_mensagem,
        usuario_id,
        ip_origem,
        metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id_assinatura || null,
        evento_tipo,
        stripe_objeto_tipo || null,
        stripe_objeto_id || null,
        acao,
        status,
        dados_request ? JSON.stringify(dados_request) : null,
        dados_response ? JSON.stringify(dados_response) : null,
        erro_mensagem || null,
        usuario_id || null,
        ip_origem || null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );

    log.info(`Stripe Audit Log: ${evento_tipo} - ${acao} - ${status}`, {
      id_assinatura,
      stripe_objeto_id,
      status
    });
  } catch (error: any) {
    log.error(`Erro ao registrar audit log: ${error.message}`);
    // Não propagar erro para não quebrar fluxo principal
  }
}

/**
 * Registra sucesso de uma ação Stripe
 */
export async function logStripeSuccess(
  evento_tipo: string,
  acao: string,
  stripe_objeto_tipo: string,
  stripe_objeto_id: string,
  dados_request?: any,
  dados_response?: any,
  options?: {
    id_assinatura?: number;
    usuario_id?: number;
    ip_origem?: string;
    metadata?: any;
  }
): Promise<void> {
  await logStripeAction({
    evento_tipo,
    acao,
    stripe_objeto_tipo,
    stripe_objeto_id,
    status: 'success',
    dados_request,
    dados_response,
    ...options
  });
}

/**
 * Registra falha de uma ação Stripe
 */
export async function logStripeFailure(
  evento_tipo: string,
  acao: string,
  erro_mensagem: string,
  dados_request?: any,
  dados_response?: any,
  options?: {
    id_assinatura?: number;
    stripe_objeto_tipo?: string;
    stripe_objeto_id?: string;
    usuario_id?: number;
    ip_origem?: string;
    metadata?: any;
  }
): Promise<void> {
  await logStripeAction({
    evento_tipo,
    acao,
    status: 'failed',
    erro_mensagem,
    dados_request,
    dados_response,
    ...options
  });
}

export default {
  logStripeAction,
  logStripeSuccess,
  logStripeFailure
};
