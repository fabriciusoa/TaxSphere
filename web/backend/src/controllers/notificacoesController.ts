import { Request, Response } from 'express';
import nodemailer from 'nodemailer';
import { getAll, getOne, runQuery } from '../database/connection';
import { AuthRequest } from '../types';
import { getSMTPConfig, getBaseUrl, getParametro } from '../utils/parametrosHelper';
import { formatToBrazilian } from '../utils/dateHelpers';
import { addMinutes, addHours, parseISO, format } from 'date-fns';
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
 * Interface para dados completos de agendamento
 */
interface DadosAgendamentoCompleto {
  id: number;
  id_usuario: number;
  id_paciente: number;
  data_inicio: string;
  data_fim: string;
  tipo: string;
  status: string;
  notas?: string;
  paciente_nome: string;
  paciente_email: string;
  usuario_nome: string;
  token_confirmacao: string;
  token_remarcar: string;
  token_cancelar: string;
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
 * Substitui variáveis no template de email
 */
function substituirVariaveis(
  texto: string,
  dados: DadosAgendamentoCompleto,
  baseUrl: string
): string {
  const dataHoraFormatada = formatToBrazilian(dados.data_inicio);

  const variaveis: Record<string, string> = {
    '{{nome_paciente}}': dados.paciente_nome,
    '{{nome_profissional}}': dados.usuario_nome,
    '{{data_hora}}': dataHoraFormatada || '-',
    '{{tipo}}': dados.tipo,
    '{{link_confirmar}}': `${baseUrl}api/agendamentos/link/${dados.token_confirmacao}/confirmar`,
    '{{link_remarcar}}': `${baseUrl}api/agendamentos/link/${dados.token_remarcar}/remarcar`,
    '{{link_cancelar}}': `${baseUrl}api/agendamentos/link/${dados.token_cancelar}/cancelar`,
  };

  let resultado = texto;
  for (const [chave, valor] of Object.entries(variaveis)) {
    resultado = resultado.replace(new RegExp(chave, 'g'), valor);
  }

  return resultado;
}

/**
 * Busca template de email com fallback para padrões
 */
async function buscarTemplate(idUsuario: number, tipo: 'Confirmacao' | 'Lembrete'): Promise<{
  assunto: string;
  corpo: string;
  assinatura: string;
}> {
  // Templates padrão (fallback)
  const TEMPLATE_DEFAULT_CONFIRMACAO = {
    assunto: 'Confirmação de Agendamento',
    corpo: `Olá {{nome_paciente}},

Seu agendamento foi confirmado!

📅 Data e Hora: {{data_hora}}
👤 Profissional: {{nome_profissional}}

Você pode gerenciar seu agendamento através dos links abaixo:

✅ Confirmar Presença: {{link_confirmar}}
❌ Cancelar: {{link_cancelar}}

Por favor, confirme sua presença ou solicite remarcação com antecedência mínima de 48 horas.`,
    assinatura: 'Atenciosamente,\nEquipe de Atendimento',
  };

  const TEMPLATE_DEFAULT_LEMBRETE = {
    assunto: 'Lembrete: Agendamento Próximo',
    corpo: `Olá {{nome_paciente}},

Este é um lembrete sobre seu agendamento:

📅 Data e Hora: {{data_hora}}
👤 Profissional: {{nome_profissional}}

Caso precise remarcar ou cancelar, utilize os links abaixo:

❌ Cancelar: {{link_cancelar}}

Aguardamos você!`,
    assinatura: 'Atenciosamente,\nEquipe de Atendimento',
  };

  try {
    // Tentar buscar template customizado do usuário
    const template = await getOne<EmailTemplate>(
      `SELECT assunto_confirmacao, template_texto_confirmacao, assunto_lembrete, template_texto_lembrete, assinatura 
       FROM email_templates 
       WHERE id_usuario = ?`,
      [idUsuario]
    );

    if (template) {
      if (tipo === 'Confirmacao') {
        return {
          assunto: template.assunto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.assunto,
          corpo: template.template_texto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.corpo,
          assinatura: template.assinatura || TEMPLATE_DEFAULT_CONFIRMACAO.assinatura,
        };
      } else {
        return {
          assunto: template.assunto_lembrete || TEMPLATE_DEFAULT_LEMBRETE.assunto,
          corpo: template.template_texto_lembrete || TEMPLATE_DEFAULT_LEMBRETE.corpo,
          assinatura: template.assinatura || TEMPLATE_DEFAULT_LEMBRETE.assinatura,
        };
      }
    }
  } catch (error: any) {
    log.error(`Erro ao buscar template customizado: ${error.message}`);
  }

  // Fallback para templates padrão
  return tipo === 'Confirmacao' ? TEMPLATE_DEFAULT_CONFIRMACAO : TEMPLATE_DEFAULT_LEMBRETE;
}
/**
 * Processa os aniversáriantes do dia
 * Envia email de felicitações
 */
const processarAniversariantes = async (req: Request, res: Response) => {
  const inicioExecucao = new Date();
  let totalProcessadas = 0;
  let sucessos = 0;
  let falhas = 0;
  let erros: string[] = [];

  // Verificar se já foi executado hoje
  const executadoHoje = await getOne<any>(
    `SELECT id FROM cron_execucoes WHERE nome_job = 'processarAniversariantes' AND strftime('%Y-%m-%d', executado_em) = strftime('%Y-%m-%d', datetime('now', 'localtime'))`);

  if (!executadoHoje) {
    try {
      const hoje = new Date();
      const dia = hoje.getDate();
      const mes = hoje.getMonth() + 1; // Janeiro é 0
      // Buscar pacientes aniversariantes hoje
      const pacientes = await getAll<{
        id: number;
        nome: string;
        email: string;
        data_nascimento: string;
        nome_medico: string;
      }>(
        `SELECT p.id, p.nome, p.email, p.dt_nascimento, u.nome nome_medico
        FROM paciente p, usuarios u
       where p.id_usuario = u.id 
         and strftime('%d', p.dt_nascimento) = ? 
         AND strftime('%m', p.dt_nascimento) = ?`,
        [dia.toString().padStart(2, '0'), mes.toString().padStart(2, '0')]
      );

      // Enviar emails de felicitações
      for (const paciente of pacientes) {
        totalProcessadas++;
        if (paciente.email) {
          const assunto = 'Feliz Aniversário!';
          const corpo = `Olá ${paciente.nome},\n\n\n\n\nDesejo a você um feliz aniversário cheio de saúde e alegria!\n\n\n\nAtenciosamente,\n\n\n\n ${paciente.nome_medico}`;

          try {
            await enviarEmail(paciente.email, assunto, corpo);
            log.info(`Email de aniversário enviado para ${paciente.email}`);
            sucessos++;
          } catch (error: any) {
            falhas++;
            erros.push(`Erro ao enviar email para ${paciente.email}: ${error.message}`);
            log.error(`Erro ao enviar email para ${paciente.email}: ${error.message}`);
          }
        }
      }
      res.json({ success: true, message: 'Processamento de aniversariantes concluído' });
    } catch (error: any) {
      log.error(`[notificacoesController] Erro ao processar aniversariantes: ${error.message}`);
      res.status(500).json({ success: false, message: 'Erro ao processar aniversariantes' });
    }

    // Registrar execução em cron_execucoes
    const fimExecucao = new Date();
    const duracaoMs = fimExecucao.getTime() - inicioExecucao.getTime();

    log.info('Processamento dos aniversáriantes', {
      total_processadas: totalProcessadas,
      sucessos,
      falhas,
      duracao_ms: duracaoMs
    });
    await runQuery(
      `INSERT INTO cron_execucoes (nome_job, executado_em, duracao_ms, registros_processados, sucesso, erro)
            VALUES (?, datetime('now'), ?, ?, ?, ?)`,
      [
        'processarAniversariantes',
        duracaoMs,
        totalProcessadas,
        falhas === 0 ? 1 : 0,
        erros.length > 0 ? erros.join('; ') : null,
      ]
    );
  }
};

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
      id_agendamento: number;
      tipo: string;
      contador_tentativas: number;
      tipo_notificacao: string;
      id_usuario?: number;
    }>(
      `SELECT id, id_agendamento, tipo, contador_tentativas, tipo_notificacao, id_usuario
       FROM notificacao 
       WHERE status = 'Pendente' 
         AND (enviado_em IS NULL OR enviado_em <= datetime('now'))
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
        // Buscar dados completos do agendamento com JOINs
        const agendamento = await getOne<DadosAgendamentoCompleto>(
          `SELECT 
            a.*,
            p.nome as paciente_nome, p.email as paciente_email,
            u.nome as usuario_nome
           FROM agendamento a
           INNER JOIN paciente p ON a.id_paciente = p.id
           INNER JOIN usuarios u ON a.id_usuario = u.id
           WHERE a.id = ?`,
          [notificacao.id_agendamento]
        );

        if (!agendamento) {
          erros.push(`Agendamento ${notificacao.id_agendamento} não encontrado`);
          log.error(`Agendamento ${notificacao.id_agendamento} não encontrado`);

          // Marcar notificação como falha
          await runQuery(
            `UPDATE notificacao 
             SET status = 'Falha', 
                 erro_falha = ?, 
                 contador_tentativas = contador_tentativas + 1
             WHERE id = ?`,
            ['Agendamento foi cancelado ou não encontrado', notificacao.id]
          );

          falhas++;
          continue;
        }

        // Validar email do paciente
        if (!agendamento.paciente_email) {
          erros.push(`Paciente ${agendamento.paciente_nome} não possui email cadastrado`);
          log.error(`Paciente ${agendamento.paciente_nome} não possui email cadastrado`);
          await runQuery(
            `UPDATE notificacao 
             SET status = 'Falha', 
                 erro = ?,
                 contador_tentativas = contador_tentativas + 1,
                 ultima_tentativa_notificacao = datetime('now')
             WHERE id = ?`,
            ['Paciente sem email cadastrado', notificacao.id]
          );

          falhas++;
          continue;
        }

        // Buscar template customizado ou usar padrão
        const tipoTemplate = notificacao.tipo_notificacao === 'Confirmacao' ? 'Confirmacao' : 'Lembrete';
        const template = await buscarTemplate(agendamento.id_usuario, tipoTemplate);

        // Substituir variáveis no template
        const assunto = substituirVariaveis(template.assunto, agendamento, baseUrl);
        const corpo = substituirVariaveis(
          `${template.corpo}\n\n${template.assinatura}`,
          agendamento,
          baseUrl
        );

        const enviado = await enviarEmail(agendamento.paciente_email, assunto, corpo);

        if (enviado) {
          // Sucesso: atualizar status para Enviado
          await runQuery(
            `UPDATE notificacao 
             SET status = 'Enviado', 
                 entregue_em = datetime('now'),
                 contador_tentativas = contador_tentativas + 1,                 
                 erro_falha = NULL
             WHERE id = ?`,
            [notificacao.id]
          );

          // Atualizar timestamp no agendamento
          await runQuery(
            `UPDATE agendamento 
             SET ultima_tentativa_notificacao = datetime('now') 
             WHERE id = ?`,
            [notificacao.id_agendamento]
          );

          log.info(`Notificação ${notificacao.id} enviada com sucesso`, {
            tipo_notificacao: notificacao.tipo_notificacao,
            agendamento_id: notificacao.id_agendamento,
            tentativa: notificacao.contador_tentativas + 1
          });

          sucessos++;
        } else {
          // Falha no envio: implementar retry lógico
          const novoContador = notificacao.contador_tentativas + 1;

          if (novoContador >= 3) {
            // Limite de tentativas atingido: marcar como falha definitiva
            await runQuery(
              `UPDATE notificacao 
               SET status = 'Falha', 
                   erro_falha = 'Limite de tentativas atingido (3 tentativas)',
                   contador_tentativas = ?
               WHERE id = ?`,
              [novoContador, notificacao.id]
            );

            log.error('Notificação atingiu limite de tentativas', {
              notificacao_id: notificacao.id,
              agendamento_id: notificacao.id_agendamento,
              tentativas: novoContador
            });

            erros.push(`Notificação ${notificacao.id}: limite de tentativas atingido`);
            falhas++;
          } else {
            // Calcular próxima tentativa com exponential backoff
            const proximaTentativa = calcularProximaTentativa(novoContador);
            const proximaTentativaISO = format(proximaTentativa, "yyyy-MM-dd HH:mm:ss");

            await runQuery(
              `UPDATE notificacao 
               SET contador_tentativas = ?,
                   enviado_em = ?,
                   erro_falha = 'Falha temporária no envio'
               WHERE id = ?`,
              [novoContador, proximaTentativaISO, notificacao.id]
            );

            log.error('Notificação reagendada para nova tentativa', {
              notificacao_id: notificacao.id,
              agendamento_id: notificacao.id_agendamento,
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
          stack: error instanceof Error ? error.stack : undefined,
          agendamento_id: notificacao.id_agendamento
        });

        erros.push(`Notificação ${notificacao.id}: ${mensagemErro}`);

        await runQuery(
          `UPDATE notificacao 
           SET erro_falha = ?,
               contador_tentativas = contador_tentativas + 1
           WHERE id = ?`,
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
      `INSERT INTO cron_execucoes (nome_job, executado_em, duracao_ms, registros_processados, sucesso, erro)
       VALUES (?, datetime('now'), ?, ?, ?, ?)`,
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
      `INSERT INTO cron_execucoes (nome_job, executado_em, duracao_ms, registros_processados, sucesso, erro)
       VALUES (?, datetime('now'), ?, ?, 0, ?)`,
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
    const userPerfilId = req.user?.perfil_id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Construir query com filtro condicional por usuário
    let whereClause = '';
    let params: any[] = [];

    if (userPerfilId !== 1) {
      // Não é ADMIN: filtrar por id_usuario via JOIN com agendamento
      whereClause = `WHERE n.id_usuario = ?`;
      params = [userId];
    }

    // Buscar contadores por status
    const estatisticasStatus = await getAll<{
      status: string;
      total: number;
    }>(
      `SELECT n.status, COUNT(*) as total
       FROM notificacao n      
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
      tipo: string;
      total: number;
    }>(
      `SELECT n.tipo, COUNT(*) as total
       FROM notificacao n       
       ${whereClause}
       GROUP BY n.tipo`,
      params
    );

    const tipoMap: Record<string, number> = {};
    estatisticasTipo.forEach(stat => {
      tipoMap[stat.tipo] = stat.total;
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
    const userPerfilId = req.user?.perfil_id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    // Construir query com filtro condicional
    let whereClause = `WHERE n.status = 'Falha'`;
    let params: any[] = [];

    if (userPerfilId !== 1) {
      // Não é ADMIN: reprocessar apenas notificações do próprio usuário
      whereClause += ` AND n.id_usuario = ?`;
      params.push(userId);
    }

    // Resetar notificações com falha
    const result = await runQuery(
      `UPDATE notificacao 
       SET status = 'Pendente',
           contador_tentativas = 0,
           enviado_em = datetime('now'),
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
 * Executa processamento catch-up sem limite de 50 notificações
 * Útil para processar notificações atrasadas após downtime
 * Apenas ADMIN pode executar
 */
const catchUp = async (req: AuthRequest, res: Response) => {
  try {
    const userPerfilId = req.user?.perfil_id;

    if (userPerfilId !== 1) {
      return res.status(403).json({
        error: 'Acesso negado',
        message: 'Apenas administradores podem executar catch-up',
      });
    }

    const inicioExecucao = new Date();
    let totalProcessadas = 0;
    let sucessos = 0;
    let falhas = 0;
    const erros: string[] = [];

    // Buscar TODAS as notificações pendentes (sem LIMIT)
    const notificacoes = await getAll<{
      id: number;
      id_agendamento: number;
      tipo: string;
      contador_tentativas: number;
      tipo_notificacao: string;
      id_usuario?: number;
    }>(
      `SELECT id, id_agendamento, tipo, contador_tentativas, tipo_notificacao, id_usuario
       FROM notificacao 
       WHERE status = 'Pendente' 
         AND (enviado_em IS NULL OR enviado_em <= datetime('now'))
         AND contador_tentativas < 3
       ORDER BY enviado_em ASC, id ASC`
    );

    if (!notificacoes || notificacoes.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhuma notificação atrasada para processar',
        processadas: 0,
      });
    }

    const baseUrl = await getBaseUrl();

    // Processar todas (mesma lógica do processarFila)
    for (const notificacao of notificacoes) {
      totalProcessadas++;

      try {
        const agendamento = await getOne<DadosAgendamentoCompleto>(
          `SELECT 
            a.*,
            p.nome as paciente_nome, p.email as paciente_email,
            u.nome as usuario_nome
           FROM agendamento a
           INNER JOIN paciente p ON a.id_paciente = p.id
           INNER JOIN usuarios u ON a.id_usuario = u.id
           WHERE a.id = ?`,
          [notificacao.id_agendamento]
        );

        if (!agendamento || !agendamento.paciente_email) {
          await runQuery(
            `UPDATE notificacao 
             SET status = 'Falha', erro_falha = 'Dados inválidos',
                 contador_tentativas = contador_tentativas + 1
             WHERE id = ?`,
            [notificacao.id]
          );
          falhas++;
          continue;
        }

        const tipoTemplate = notificacao.tipo_notificacao === 'Confirmacao' ? 'Confirmacao' : 'Lembrete';
        const template = await buscarTemplate(agendamento.id_usuario, tipoTemplate);
        const assunto = substituirVariaveis(template.assunto, agendamento, baseUrl);
        const corpo = substituirVariaveis(
          `${template.corpo}\n\n${template.assinatura}`,
          agendamento,
          baseUrl
        );

        const enviado = await enviarEmail(agendamento.paciente_email, assunto, corpo);

        if (enviado) {
          await runQuery(
            `UPDATE notificacao 
             SET status = 'Enviado', entregue_em = datetime('now'),
                 contador_tentativas = contador_tentativas + 1
             WHERE id = ?`,
            [notificacao.id]
          );
          sucessos++;
        } else {
          const novoContador = notificacao.contador_tentativas + 1;
          if (novoContador >= 3) {
            await runQuery(
              `UPDATE notificacao 
               SET status = 'Falha', erro_falha = 'Limite de tentativas',
                   contador_tentativas = ?
               WHERE id = ?`,
              [novoContador, notificacao.id]
            );
          }
          falhas++;
        }
      } catch (error: any) {
        log.error(`Erro ao processar notificação ${notificacao.id} no catch-up: ${error.message}`);
        erros.push(`Notificação ${notificacao.id}: ${error.message}`);
        falhas++;
      }
    }

    const fimExecucao = new Date();
    const duracaoMs = fimExecucao.getTime() - inicioExecucao.getTime();

    await runQuery(
      `INSERT INTO cron_execucoes (nome_job, executado_em, duracao_ms, registros_processados, sucesso, erro)
       VALUES (?, datetime('now'), ?, ?, ?, ?)`,
      ['catchUp', duracaoMs, totalProcessadas, falhas === 0 ? 1 : 0, erros.join('; ') || null]
    );

    log.info(`Catch-up concluído: ${totalProcessadas} processadas, ${sucessos} enviadas, ${falhas} falhas`);

    return res.json({
      success: true,
      message: 'Catch-up concluído',
      total_processadas: totalProcessadas,
      sucessos,
      falhas,
      duracao_ms: duracaoMs,
    });
  } catch (error: any) {
    log.error(`Erro no catch-up: ${error.message}`);
    return res.status(500).json({
      error: 'Erro ao executar catch-up',
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
    const userPerfilId = req.user?.perfil_id;

    if (!userId) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    const { status, tipo, limite = 50, offset = 0 } = req.query;

    let whereClause = ` pm.chave = 'NODE_ENV' `;
    const params: any[] = [];

    // Filtrar por usuário se não ADMIN
    if (userPerfilId !== 1) {
      whereClause += ` AND a.id_usuario = ?`;
      params.push(userId);
    }

    // Filtros opcionais
    if (status) {
      whereClause += ` AND n.status = ?`;
      params.push(status);
    }

    if (tipo) {
      whereClause += ` AND n.tipo = ?`;
      params.push(tipo);
    }

    const notificacoes = await getAll(
       ` SELECT n.id,
                n.id_usuario,  
                n.tipo_notificacao,
                n.status,
                n.assunto,
                n.mensagem,
                n.enviado_em,
                n.entregue_em,
                n.erro_falha,
                n.id_externo,
                n.contador_tentativas,
                n.maximo_tentativas,
                n.criado_em,
                n.atualizado_em,
                n.id_agendamento,
                n.tipo,
                n.id_paciente,
                    p.nome as paciente_nome, 
                    case valor
                      when 'dev' then p.email
                      else n.destinatario
                    end as destinatario,
                    a.data_inicio
              FROM notificacao n
              left JOIN agendamento a ON n.id_agendamento = a.id
              left JOIN paciente p ON n.id_paciente = p.id
              left join parametros pm on pm.id = pm.id
        WHERE ${whereClause}
        ORDER BY n.enviado_em DESC
        LIMIT ? OFFSET ?`,
      [...params, Number(limite), Number(offset)]
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
  catchUp,
  listar,
  processarAniversariantes,
  enviarEmail,
};
