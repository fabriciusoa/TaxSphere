import { Request, Response } from 'express';
import { getAll, getOne } from '../database/connection';
import { log } from '../utils/logger';

export const stripeMetricsController = {
  /**
   * Dashboard de métricas do Stripe
   * Retorna conversão, MRR, top erros, status distribution
   */
  async obterMetricas(req: Request, res: Response) {
    try {
      // 1. Taxa de Conversão (últimos 30 dias)
      const conversao = await getOne<{
        total_assinaturas: number;
        com_subscription: number;
        taxa_conversao: number;
      }>(
        `SELECT 
          COUNT(*) as total_assinaturas,
          SUM(CASE WHEN stripe_subscription_id IS NOT NULL THEN 1 ELSE 0 END) as com_subscription,
          ROUND(
            CAST(SUM(CASE WHEN stripe_subscription_id IS NOT NULL THEN 1 ELSE 0 END) AS FLOAT) / 
            CAST(COUNT(*) AS FLOAT) * 100, 
            2
          ) as taxa_conversao
         FROM adm_assinatura
         WHERE dt_criacao >= datetime('now', '-30 days')
           AND dt_excluido IS NULL`
      );

      // 2. Tempo Médio para Conversão (tempo entre dt_criacao e primeiro subscription_created)
      const tempoMedioConversao = await getOne<{
        tempo_medio_minutos: number;
      }>(
        `SELECT 
          AVG(
            (julianday(audit.dt_criacao) - julianday(assin.dt_criacao)) * 24 * 60
          ) as tempo_medio_minutos
         FROM adm_assinatura assin
         INNER JOIN adm_stripe_audit_log audit 
           ON assin.id = audit.id_assinatura 
           AND audit.evento_tipo = 'subscription_created'
           AND audit.status = 'success'
         WHERE assin.dt_criacao >= datetime('now', '-30 days')
           AND assin.stripe_subscription_id IS NOT NULL`
      );

      // 3. Top 5 Erros (últimos 30 dias)
      const topErros = await getAll<{
        erro_mensagem: string;
        total_ocorrencias: number;
        ultima_ocorrencia: string;
      }>(
        `SELECT 
          erro_mensagem,
          COUNT(*) as total_ocorrencias,
          MAX(dt_criacao) as ultima_ocorrencia
         FROM adm_stripe_audit_log
         WHERE status = 'error'
           AND dt_criacao >= datetime('now', '-30 days')
           AND erro_mensagem IS NOT NULL
         GROUP BY erro_mensagem
         ORDER BY total_ocorrencias DESC
         LIMIT 5`
      );

      // 4. MRR Estimado (assinaturas ativas)
      const mrr = await getOne<{
        mrr_total: number;
        total_assinaturas_ativas: number;
      }>(
        `SELECT 
          COALESCE(SUM(p.valor), 0) as mrr_total,
          COUNT(*) as total_assinaturas_ativas
         FROM adm_assinatura a
         INNER JOIN adm_planos p ON a.id_adm_plano = p.id
         WHERE a.status IN ('ATIVO', 'TRIAL')
           AND a.dt_excluido IS NULL
           AND a.stripe_subscription_id IS NOT NULL`
      );

      // 5. Distribuição por Status
      const distribuicaoStatus = await getAll<{
        status: string;
        total: number;
        percentual: number;
      }>(
        `SELECT 
          status,
          COUNT(*) as total,
          ROUND(CAST(COUNT(*) AS FLOAT) / (SELECT COUNT(*) FROM adm_assinatura WHERE dt_excluido IS NULL) * 100, 2) as percentual
         FROM adm_assinatura
         WHERE dt_excluido IS NULL
         GROUP BY status
         ORDER BY total DESC`
      );

      // 6. Assinaturas Abandonadas (últimos 7 dias)
      const abandonadas = await getOne<{
        total_abandonadas: number;
      }>(
        `SELECT COUNT(*) as total_abandonadas
         FROM adm_assinatura
         WHERE dt_criacao < datetime('now', '-24 hours')
           AND stripe_subscription_id IS NULL
           AND dt_excluido IS NULL`
      );

      // 7. Trials Expirando (próximos 3 dias)
      const trialsExpirando = await getOne<{
        total_expirando: number;
      }>(
        `SELECT COUNT(*) as total_expirando
         FROM adm_assinatura
         WHERE dt_demonstracao BETWEEN datetime('now') AND datetime('now', '+3 days')
           AND stripe_subscription_id IS NULL
           AND dt_excluido IS NULL
           AND status != 'INADIMPLENTE'`
      );

      // 8. Eventos de Webhook (últimos 7 dias)
      const webhookStats = await getAll<{
        tipo: string;
        total: number;
      }>(
        `SELECT 
          tipo,
          COUNT(*) as total
         FROM adm_stripe_webhook_events
         WHERE processado_em >= datetime('now', '-7 days')
         GROUP BY tipo
         ORDER BY total DESC
         LIMIT 10`
      );

      // 9. Histórico de Conversão (últimos 30 dias, agrupado por dia)
      const historicoConversao = await getAll<{
        data: string;
        total_criadas: number;
        total_convertidas: number;
      }>(
        `SELECT 
          DATE(dt_criacao) as data,
          COUNT(*) as total_criadas,
          SUM(CASE WHEN stripe_subscription_id IS NOT NULL THEN 1 ELSE 0 END) as total_convertidas
         FROM adm_assinatura
         WHERE dt_criacao >= datetime('now', '-30 days')
           AND dt_excluido IS NULL
         GROUP BY DATE(dt_criacao)
         ORDER BY data DESC`
      );

      res.json({
        conversao: {
          total_assinaturas: conversao?.total_assinaturas || 0,
          com_subscription: conversao?.com_subscription || 0,
          taxa_conversao: conversao?.taxa_conversao || 0
        },
        tempo_medio_conversao: {
          minutos: tempoMedioConversao?.tempo_medio_minutos || 0,
          formatado: formatarTempo(tempoMedioConversao?.tempo_medio_minutos || 0)
        },
        top_erros: topErros,
        mrr: {
          total: mrr?.mrr_total || 0,
          total_assinaturas: mrr?.total_assinaturas_ativas || 0
        },
        distribuicao_status: distribuicaoStatus,
        abandonadas: abandonadas?.total_abandonadas || 0,
        trials_expirando: trialsExpirando?.total_expirando || 0,
        webhook_stats: webhookStats,
        historico_conversao: historicoConversao
      });
    } catch (error: any) {
      log.error(`Erro ao obter métricas Stripe: ${error.message}`);
      res.status(500).json({ erro: 'Erro ao obter métricas' });
    }
  }
};

/**
 * Formata tempo em minutos para string legível
 */
function formatarTempo(minutos: number): string {
  if (minutos < 1) {
    return 'Menos de 1 minuto';
  }

  if (minutos < 60) {
    return `${Math.round(minutos)} minutos`;
  }

  const horas = Math.floor(minutos / 60);
  const minutosRestantes = Math.round(minutos % 60);

  if (horas < 24) {
    return minutosRestantes > 0 
      ? `${horas}h ${minutosRestantes}min`
      : `${horas}h`;
  }

  const dias = Math.floor(horas / 24);
  const horasRestantes = horas % 24;

  return horasRestantes > 0
    ? `${dias}d ${horasRestantes}h`
    : `${dias} dias`;
}
