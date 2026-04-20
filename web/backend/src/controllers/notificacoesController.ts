import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { getAll, getOne, runQuery } from '../database/connection';
import { AuthRequest } from '../types';
import { getSMTPConfig, getBaseUrl } from '../utils/parametrosHelper';
import { addMinutes, addHours, format } from 'date-fns';
import { log } from '../utils/logger';
import { getParametros } from '../utils/parametrosHelper';

/**
 * Calcula o timestamp da próxima tentativa de envio com base no contador de tentativas
 * Lógica de exponential backoff:
 * - Tentativa 1: Imediatamente (agora)
 * - Tentativa 2: +30 minutos
 * - Tentativa 3: +2 horas
 */
function calcularProximaTentativa(contadorTentativas: number): Date {
  const agora = new Date();

  switch (contadorTentativas) {
    case 0:
      // Primeira tentativa: imediatamente
      return agora;
    case 1:
      // Segunda tentativa: +30 minutos
      return addMinutes(agora, 30);
    case 2:
      // Terceira tentativa: +2 horas
      return addHours(agora, 2);
    default:
      // Mais de 3 tentativas: marcar como falha (não retornar data)
      return agora;
  }
}

/**
 * Interface para template de email
 */
interface EmailTemplate {
  assunto_confirmacao?: string;
  template_texto_confirmacao?: string;
  assunto_lembrete?: string;
  template_texto_lembrete?: string;
  assinatura?: string;
}

/**
 * Envia um email de notificação
 * @param destinatario - Email do destinatário
 * @param assunto - Assunto do email
 * @param corpo - Corpo do email
 * @param anexo - Anexo opcional
 * @param nomeArquivoAnexo - Nome do arquivo do anexo + extensão
 * @returns Promise<boolean> - true se enviado com sucesso, false caso contrário
 */
async function enviarEmail(
  destinatario: string,
  assunto: string,
  corpo: string,
  anexo?: Buffer,
  nomeArquivoAnexo?: string
): Promise<boolean> {

  // Buscar configurações SMTP
  const smtpConfig = await getSMTPConfig();

  if (!smtpConfig) {
    log.error('Configurações SMTP não encontradas');
    return false;
  }

  // Criar transporter Nodemailer
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: {
      user: smtpConfig.auth.user,
      pass: smtpConfig.auth.pass,
    },
  });

  //buscar se ambinte esta em modo de desenvolvimento ou producao
  //se estiver em desenvolvimento, enviar e-mail para um e-mail fixo de teste
  const config = await getParametros(['NODE_ENV', 'SMTP_USER']);
  if (config.NODE_ENV === 'dev') {
    log.info(`Ambiente de desenvolvimento detectado. Enviando email para endereço de teste: ${config.SMTP_USER}`);
    destinatario = config.SMTP_USER || '';
  }

  // Enviar email
  const mailOptions: any = {
    from: smtpConfig.from,
    to: destinatario,
    subject: assunto,
    text: corpo,
  };

  // Adicionar anexo se fornecido
  if (anexo) {
    mailOptions.attachments = [{
      filename: nomeArquivoAnexo || 'anexo.pdf',
      content: anexo,
    }];
  }

  const info = await transporter.sendMail(mailOptions);

  log.info(`Email enviado com sucesso: ${info.messageId}`);
  return true;
}

/**
 * Busca template de email com fallback para padrões
 */
async function buscarTemplate(idUsuario: number, tipo: 'Confirmacao' | 'Lembrete'): Promise<{
  assunto: string;
  corpo: string;
  assinatura: string;
}> {

  try {
    // Tentar buscar template customizado do usuário
    const template = await getOne<EmailTemplate>(
      `SELECT assunto, template_texto, assinatura 
       FROM adm_email_templates 
       WHERE usuario_id = $1`,
      [idUsuario]
    );

    if (template) {
      if (tipo === 'Confirmacao') {
        return {
          assunto: template.assunto_confirmacao || '',
          corpo: template.template_texto_confirmacao || '',
          assinatura: template.assinatura || '',
        };
      } else {
        return {
          assunto: template.assunto_lembrete || '',
          corpo: template.template_texto_lembrete || '',
          assinatura: template.assinatura || '',
        };
      }
    }
  } catch (error: any) {
    log.error(`Erro ao buscar template customizado: ${error.message}`);
  }
  return {
    assunto: '',
    corpo: '',
    assinatura: '',
  };
}

/**
 * Processa a fila de notificações pendentes
 * Processa até 50 notificações por execução (batch processing)
 * Implementa retry lógico com exponential backoff
 * Registra execução em cron_execucoes
 */
const processarFila = async (req: Request, res: Response) => {
  const inicioExecucao = new Date();
  let totalProcessadas = 0;
  let sucessos = 0;
  let falhas = 0;
  let erros: string[] = [];

  log.info('Iniciando processamento de fila de notificações');

  try {
    // Buscar até 50 notificações pendentes que estão prontas para envio
    const notificacoes = await getAll<{
      id: number;
      contador_tentativas: number;
      tipo_notificacao: string;
      usuario_id?: number;
    }>(
      `SELECT id,  contador_tentativas, tipo_notificacao, usuario_id
       FROM sys_notificacao 
       WHERE status = 'Pendente' 
         AND (enviado_em IS NULL OR enviado_em <= NOW())
         AND contador_tentativas < 3
       ORDER BY enviado_em ASC, id ASC
       LIMIT 50`
    );

    if (!notificacoes || notificacoes.length === 0) {
      log.info('Nenhuma notificação pendente para processar');
      return res.json({
        success: true,
        message: 'Nenhuma notificação pendente para processar',
        processadas: 0,
        sucessos: 0,
        falhas: 0,
      });
    }

    log.info(`${notificacoes.length} notificações encontradas para processamento`);

    // Buscar BASE_URL para links
    const baseUrl = await getBaseUrl();

    // Processar cada notificação
    for (const notificacao of notificacoes) {
      totalProcessadas++;

      try {
        // Marcar notificação como falha
        await runQuery(
          `UPDATE sys_notificacao 
             SET status = 'Falha', 
                 erro_falha = $1, 
                 contador_tentativas = contador_tentativas + 1
             WHERE id = $2`,
          ['Foi cancelado ou não encontrado', notificacao.id]
        );

        falhas++;

        // Buscar template customizado ou usar padrão
        const tipoTemplate = notificacao.tipo_notificacao === 'Confirmacao' ? 'Confirmacao' : 'Lembrete';
        const template = await buscarTemplate(notificacao.usuario_id || 0, tipoTemplate);

        // Substituir variáveis no template
        const assunto = template.assunto;
        const corpo = `${template.corpo}\n\n${template.assinatura}`;

        const enviado = await enviarEmail('', assunto, corpo);

        if (enviado) {
          // Sucesso: atualizar status para Enviado
          await runQuery(
            `UPDATE sys_notificacao 
             SET status = 'Enviado', 
                 entregue_em = NOW(),
                 contador_tentativas = contador_tentativas + 1,                 
                 erro_falha = NULL
             WHERE id = $1`,
            [notificacao.id]
          );

          log.info(`Notificação ${notificacao.id} enviada com sucesso`, {
            tipo_notificacao: notificacao.tipo_notificacao,
            tentativa: notificacao.contador_tentativas + 1
          });

          sucessos++;
        } else {
          // Falha no envio: implementar retry lógico
          const novoContador = notificacao.contador_tentativas + 1;

          if (novoContador >= 3) {
            // Limite de tentativas atingido: marcar como falha definitiva
            await runQuery(
              `UPDATE sys_notificacao 
               SET status = 'Falha', 
                   erro_falha = 'Limite de tentativas atingido (3 tentativas)',
                   contador_tentativas = $1
               WHERE id = $2`,
              [novoContador, notificacao.id]
            );

            log.error('Notificação atingiu limite de tentativas', {
              notificacao_id: notificacao.id,
                tentativas: novoContador
            });

            erros.push(`Notificação ${notificacao.id}: limite de tentativas atingido`);
            falhas++;
          } else {
            // Calcular próxima tentativa com exponential backoff
            const proximaTentativa = calcularProximaTentativa(novoContador);
            const proximaTentativaISO = format(proximaTentativa, "yyyy-MM-dd HH:mm:ss");

            await runQuery(
              `UPDATE sys_notificacao 
               SET contador_tentativas = $1,
                   enviado_em = $2,
                   erro_falha = 'Falha temporária no envio'
               WHERE id = $3`,
              [novoContador, proximaTentativaISO, notificacao.id]
            );

            log.error('Notificação reagendada para nova tentativa', {
              notificacao_id: notificacao.id,
              tentativa: novoContador,
              proxima_tentativa: proximaTentativaISO
            });

            erros.push(`Notificação ${notificacao.id}: reagendada para ${proximaTentativaISO}`);
          }
        }
      } catch (error: any) {
        // Erro no processamento individual
        const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';

        log.error('Erro ao processar notificação individual', {
          notificacao_id: notificacao.id,
          error: mensagemErro,
          stack: error instanceof Error ? error.stack : undefined
        });

        erros.push(`Notificação ${notificacao.id}: ${mensagemErro}`);

        await runQuery(
          `UPDATE sys_notificacao
           SET erro_falha = $1,
               contador_tentativas = contador_tentativas + 1
           WHERE id = $2`,
          [mensagemErro, notificacao.id]
        );

        falhas++;
      }
    }

    // Registrar execução em cron_execucoes
    const fimExecucao = new Date();
    const duracaoMs = fimExecucao.getTime() - inicioExecucao.getTime();

    log.info('Processamento de fila concluído', {
      total_processadas: totalProcessadas,
      sucessos,
      falhas,
      duracao_ms: duracaoMs
    });

    await runQuery(
      `INSERT INTO sys_cron_execucoes (nome_job, executado_em, duracao_ms, registros_processados, sucesso, erro)
       VALUES ($1, NOW(), $2, $3, $4, $5)`,
      [
        'processarFila',
        duracaoMs,
        totalProcessadas,
        falhas === 0 ? 1 : 0,
        erros.length > 0 ? erros.join('; ') : null,
      ]
    );

    return res.json({
      success: true,
      message: `Processamento concluído: ${sucessos} enviadas, ${falhas} falhas`,
      processadas: totalProcessadas,
      sucessos,
      falhas,
      erros: erros.length > 0 ? erros : undefined,
      duracao_ms: duracaoMs,
    });
  } catch (error: any) {
    const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';

    log.error('Erro crítico no processamento da fila', {
      error: mensagemErro,
      stack: error instanceof Error ? error.stack : undefined,
      processadas: totalProcessadas
    });

    // Registrar falha total em cron_execucoes
    const fimExecucao = new Date();
    const duracaoMs = fimExecucao.getTime() - inicioExecucao.getTime();

    await runQuery(
      `INSERT INTO sys_cron_execucoes (nome_job, executado_em, duracao_ms, registros_processados, sucesso, erro)
       VALUES ($1, NOW(), $2, $3, 0, $4)`,
      ['processarFila', duracaoMs, totalProcessadas, mensagemErro]
    );

    log.error(` Erro crítico ao processar fila: ${mensagemErro}`);

    return res.status(500).json({
      error: 'Erro ao processar fila de notificações',
      message: mensagemErro,
      processadas: totalProcessadas,
      sucessos,
      falhas,
    });
  }
};

/**
 * Retorna estatísticas de notificações
 * Inclui contadores por status e taxa de sucesso
 * Filtrado por id_usuario se não for ADMIN (perfil_id !== 1)
 */
const estatisticas = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userPerfilId = req.user?.adm_mindtax

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Construir query com filtro condicional por usuário
    let whereClause = '';
    let params: any[] = [];

    if (!userPerfilId) {
      // Não é ADMIN: filtrar por id_usuario via JOIN com agendamento
      whereClause = `WHERE n.usuario_id = $1`;
      params = [userId];
    }

    // Buscar contadores por status
    const estatisticasStatus = await getAll<{
      status: string;
      total: number;
    }>(
      `SELECT n.status, COUNT(*) as total
       FROM sys_notificacao n      
       ${whereClause}
       GROUP BY n.status`,
      params
    );
    // Calcular taxa de sucesso
    let totalEnviadas = 0;
    let totalPendentes = 0;
    let totalFalhas = 0;

    const statusMap: Record<string, number> = {};

    estatisticasStatus.forEach(stat => {
      statusMap[stat.status] = stat.total;

      if (stat.status === 'Enviado') {
        totalEnviadas = totalEnviadas + stat.total;
      } else if (stat.status === 'Pendente') {
        totalPendentes = totalPendentes + stat.total;
      } else if (stat.status === 'Falha') {
        totalFalhas = totalFalhas + stat.total;
      }
    });

    const totalProcessadas = totalEnviadas + totalFalhas;
    const taxaSucesso = totalProcessadas > 0
      ? ((totalEnviadas / totalProcessadas) * 100).toFixed(2)
      : '0.00';

    // Buscar estatísticas por tipo
    const estatisticasTipo = await getAll<{
      tipo_notificacao: string;
      total: number;
    }>(
      `SELECT n.tipo_notificacao, COUNT(*) as total
       FROM sys_notificacao n       
       ${whereClause}
       GROUP BY n.tipo_notificacao`,
      params
    );

    const tipoMap: Record<string, number> = {};
    estatisticasTipo.forEach(stat => {
      tipoMap[stat.tipo_notificacao] = stat.total;
    });

    return res.json({
      total: totalEnviadas + totalPendentes + totalFalhas,
      pendentes: totalPendentes,
      enviadas: totalEnviadas,
      falhas: totalFalhas,
      taxa_sucesso: `${taxaSucesso}%`
    });
  } catch (error: any) {
    log.error(`Erro ao buscar estatísticas: ${error.message}`);
    return res.status(500).json({
      error: 'Erro ao buscar estatísticas de notificações',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Reprocessa notificações que falharam
 * Reseta contador_tentativas e status para Pendente
 * Apenas para notificações do próprio usuário (se não ADMIN)
 */
const reprocessarFalhas = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userPerfilId = req.user?.adm_mindtax;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Construir query com filtro condicional
    let whereClause = `WHERE n.status = 'Falha'`;
    let params: any[] = [];

    if (!userPerfilId) {
      // Não é ADMIN: reprocessar apenas notificações do próprio usuário
      params.push(userId);
      whereClause += ` AND n.id_usuario = $${params.length}`;
    }

    // Resetar notificações com falha
    const result = await runQuery(
      `UPDATE notificacao 
       SET status = 'Pendente',
           contador_tentativas = 0,
           enviado_em = NOW(),
           erro_falha = NULL
         ${whereClause}
       `,
      params
    );

    const totalReprocessadas = result.changes || 0;

    return res.json({
      success: true,
      message: `${totalReprocessadas} notificação(ões) marcada(s) para reprocessamento`,
      total_reprocessadas: totalReprocessadas,
    });
  } catch (error: any) {
    log.error(`Erro ao reprocessar falhas: ${error.message}`);
    return res.status(500).json({
      error: 'Erro ao reprocessar notificações com falha',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

/**
 * Lista notificações com paginação e filtros
 * Filtrado por id_usuario se não for ADMIN
 */
const listar = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const userPerfilId = req.user?.adm_mindtax;

    if (!userId) {
      log.error(`Usuário não autenticado tentou acessar lista de notificações: ${userId}`);
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { status, tipo, limite = 50, offset = 0 } = req.query;

    let whereClause = ` 1=1 `;
    const params: any[] = [];

    // Filtrar por usuário se não ADMIN
    if (!userPerfilId) {
      params.push(userId);
      whereClause += ` AND n.usuario_id = $${params.length}`;
    }

    // Filtros opcionais
    if (status) {
      params.push(status);
      whereClause += ` AND n.status = $${params.length}`;
    }

    if (tipo) {
      params.push(tipo);
      whereClause += ` AND n.tipo_notificacao = $${params.length}`;
    }

    params.push(Number(limite));
    const limiteIdx = params.length;
    params.push(Number(offset));
    const offsetIdx = params.length;

    const notificacoes = await getAll(
      ` SELECT n.id,
                n.usuario_id,  
                n.tipo_notificacao,
                n.status,
                n.destinatario,
                n.assunto,
                n.mensagem,
                n.enviado_em,
                n.erro_falha,
                n.contador_tentativas,
                n.maximo_tentativas,
                n.created_at,
                n.updated_at
              FROM sys_notificacao n
        WHERE ${whereClause}
        ORDER BY n.enviado_em DESC
        LIMIT $${limiteIdx} OFFSET $${offsetIdx}`,
      params
    );

    return res.json(notificacoes);
  } catch (error: any) {
    log.error(`Erro ao listar notificações: ${error.message}`);
    return res.status(500).json({
      error: 'Erro ao listar notificações',
      message: error instanceof Error ? error.message : 'Erro desconhecido',
    });
  }
};

export default {
  processarFila,
  estatisticas,
  reprocessarFalhas,
  listar,
  enviarEmail,
};
