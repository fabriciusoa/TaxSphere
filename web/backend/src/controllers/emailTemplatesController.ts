import { Response } from 'express';
import { getOne, runQuery } from '../database/connection';
import { AuthRequest, EmailTemplate } from '../types';
import { getCurrentTimestamp } from '../utils/dateHelpers';
import { emailTemplateSchema } from '../validators/schemas';
import { getSMTPConfig, getBaseUrl } from '../utils/parametrosHelper';
import nodemailer from 'nodemailer';
import { format } from 'date-fns';
import sanitizeHtml from 'sanitize-html';
import { log } from '../utils/logger';

// Tags HTML permitidas nos templates de e-mail (whitelist mínima)
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['b', 'i', 'em', 'strong', 'br', 'p', 'ul', 'ol', 'li', 'span'],
  allowedAttributes: {},
  disallowedTagsMode: 'discard'
};

// Templates padrão hardcoded como fallback
const TEMPLATE_DEFAULT_CONFIRMACAO = {
  assunto: 'Confirmação de Agendamento',
  corpo: `Olá {{nome_paciente}},

Seu agendamento foi confirmado com sucesso!

Detalhes:
- Data/Hora: {{data_hora}}
- Tipo: {{tipo}}
- Profissional: {{nome_profissional}}

Para confirmar sua presença, clique no link abaixo:
{{link_confirmar}}

Caso precise remarcar ou cancelar, utilize os links:
- Remarcar: {{link_remarcar}}
- Cancelar: {{link_cancelar}}

Importante: Os links acima expiram 48 horas antes da consulta.

{{assinatura}}`,
  assinatura: 'Atenciosamente,\nEquipe de Atendimento'
};

const TEMPLATE_DEFAULT_LEMBRETE = {
  assunto: 'Lembrete de Consulta',
  corpo: `Olá {{nome_paciente}},

Este é um lembrete da sua consulta agendada:

Data/Hora: {{data_hora}}
Tipo: {{tipo}}
Profissional: {{nome_profissional}}

Caso precise remarcar ou cancelar, utilize os links:
- Remarcar: {{link_remarcar}}
- Cancelar: {{link_cancelar}}

Aguardamos você!

{{assinatura}}`,
  assinatura: 'Atenciosamente,\nEquipe de Atendimento'
};

export const emailTemplatesController = {
  /**
   * Busca template de email do usuário
   * Retorna template personalizado ou fallback para padrão
   */
  buscarPorUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      try {
        // Tentar buscar template personalizado do banco
        const template = await getOne<EmailTemplate>(
          'SELECT * FROM email_templates WHERE id_usuario = ?',
          [userId]
        );

        if (template) {
          return res.json({
            ...template,
            // Garantir que campos vazios retornem os padrões
            assunto_confirmacao: template.assunto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.assunto,
            template_texto_confirmacao: template.template_texto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.corpo,
            assunto_lembrete: template.assunto_lembrete || TEMPLATE_DEFAULT_LEMBRETE.assunto,
            template_texto_lembrete: template.template_texto_lembrete || TEMPLATE_DEFAULT_LEMBRETE.corpo,
            assinatura: template.assinatura || TEMPLATE_DEFAULT_CONFIRMACAO.assinatura
          });
        }

        // Se não encontrou no banco, retornar templates padrão
        return res.json({
          id: 0,
          id_usuario: userId,
          assunto_confirmacao: TEMPLATE_DEFAULT_CONFIRMACAO.assunto,
          template_texto_confirmacao: TEMPLATE_DEFAULT_CONFIRMACAO.corpo,
          assunto_lembrete: TEMPLATE_DEFAULT_LEMBRETE.assunto,
          template_texto_lembrete: TEMPLATE_DEFAULT_LEMBRETE.corpo,
          assinatura: TEMPLATE_DEFAULT_CONFIRMACAO.assinatura,
          criado_em: null,
          atualizado_em: null
        });

      } catch (dbError: any) {
        log.error(`Erro ao buscar template do banco, usando fallback: ${dbError.message}`);
        
        // Fallback para templates hardcoded em caso de erro no banco
        return res.json({
          id: 0,
          id_usuario: userId,
          assunto_confirmacao: TEMPLATE_DEFAULT_CONFIRMACAO.assunto,
          template_texto_confirmacao: TEMPLATE_DEFAULT_CONFIRMACAO.corpo,
          assunto_lembrete: TEMPLATE_DEFAULT_LEMBRETE.assunto,
          template_texto_lembrete: TEMPLATE_DEFAULT_LEMBRETE.corpo,
          assinatura: TEMPLATE_DEFAULT_CONFIRMACAO.assinatura,
          criado_em: null,
          atualizado_em: null
        });
      }

    } catch (error: any) {
      log.error(`Erro ao buscar template: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * Atualiza template de email do usuário
   * Valida limites de caracteres e sanitiza HTML
   */
  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      // Validar com schema Zod
      const validatedData = emailTemplateSchema.parse(req.body);

      // Sanitizar: permitir apenas tags seguras da whitelist (previne XSS)
      const sanitize = (text: string | undefined): string | undefined => {
        if (!text) return text;
        return sanitizeHtml(text, SANITIZE_OPTIONS);
      };

      const assuntoConfirmacao = sanitize(validatedData.assunto_confirmacao);
      const templateTextoConfirmacao = sanitize(validatedData.template_texto_confirmacao);
      const assuntoLembrete = sanitize(validatedData.assunto_lembrete);
      const templateTextoLembrete = sanitize(validatedData.template_texto_lembrete);
      const assinatura = sanitize(validatedData.assinatura);

      // Verificar se já existe template para o usuário
      const templateExistente = await getOne<EmailTemplate>(
        'SELECT id FROM email_templates WHERE id_usuario = ?',
        [userId]
      );

      const now = getCurrentTimestamp();

      if (templateExistente) {
        // UPDATE
        const campos: string[] = [];
        const valores: any[] = [];

        if (assuntoConfirmacao !== undefined) {
          campos.push('assunto_confirmacao = ?');
          valores.push(assuntoConfirmacao);
        }
        if (templateTextoConfirmacao !== undefined) {
          campos.push('template_texto_confirmacao = ?');
          valores.push(templateTextoConfirmacao);
        }
        if (assuntoLembrete !== undefined) {
          campos.push('assunto_lembrete = ?');
          valores.push(assuntoLembrete);
        }
        if (templateTextoLembrete !== undefined) {
          campos.push('template_texto_lembrete = ?');
          valores.push(templateTextoLembrete);
        }
        if (assinatura !== undefined) {
          campos.push('assinatura = ?');
          valores.push(assinatura);
        }

        if (campos.length === 0) {
          return res.status(400).json({ error: 'Nenhum campo para atualizar' });
        }

        campos.push('atualizado_em = ?');
        valores.push(now);
        valores.push(userId);

        await runQuery(
          `UPDATE email_templates SET ${campos.join(', ')} WHERE id_usuario = ?`,
          valores
        );

      } else {
        // INSERT
        await runQuery(
          `INSERT INTO email_templates (
            id_usuario, assunto_confirmacao, template_texto_confirmacao,
            assunto_lembrete, template_texto_lembrete, assinatura,
            criado_em, atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            assuntoConfirmacao || null,
            templateTextoConfirmacao || null,
            assuntoLembrete || null,
            templateTextoLembrete || null,
            assinatura || null,
            now,
            now
          ]
        );
      }

      // Buscar template atualizado para retornar
      const templateAtualizado = await getOne<EmailTemplate>(
        'SELECT * FROM email_templates WHERE id_usuario = ?',
        [userId]
      );

      res.json({
        message: 'Template atualizado com sucesso',
        template: templateAtualizado
      });

    } catch (error: any) {
      log.error(`Erro ao atualizar template: ${error.message}`);
      
      if (error.name === 'ZodError') {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }

      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  /**
   * Envia email de teste para o usuário logado
   * Usa dados fictícios de agendamento
   */
  testar: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const userEmail = req.user?.email;
      const userName = req.user?.nome || 'Profissional';

      if (!userEmail) {
        return res.status(400).json({ 
          error: 'Email do usuário não encontrado' 
        });
      }

      // Buscar template do usuário
      let template: EmailTemplate | undefined;
      try {
        template = await getOne<EmailTemplate>(
          'SELECT * FROM email_templates WHERE id_usuario = ?',
          [userId]
        );
      } catch (dbError: any) {
        log.error(`Erro ao buscar template do banco, usando fallback: ${dbError.message}`);
      }

      // Usar template do banco ou fallback
      const assunto = template?.assunto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.assunto;
      let corpo = template?.template_texto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.corpo;
      const assinatura = template?.assinatura || TEMPLATE_DEFAULT_CONFIRMACAO.assinatura;

      // Gerar dados fictícios de agendamento
      const dataHoraFicticia = format(new Date(Date.now() + 24 * 60 * 60 * 1000), 'dd/MM/yyyy HH:mm'); // Amanhã
      const baseUrl = await getBaseUrl();
      const tokenFicticio = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx';

      // Substituir variáveis no template
      const variaveis: Record<string, string> = {
        '{{nome_paciente}}': 'João da Silva (TESTE)',
        '{{nome_profissional}}': userName,
        '{{data_hora}}': dataHoraFicticia,
        '{{tipo}}': 'Consulta',
        '{{link_confirmar}}': `${baseUrl}/agendamentos/link/${tokenFicticio}/confirmar`,
        '{{link_remarcar}}': `${baseUrl}/agendamentos/link/${tokenFicticio}/remarcar`,
        '{{link_cancelar}}': `${baseUrl}/agendamentos/link/${tokenFicticio}/cancelar`,
        '{{assinatura}}': assinatura
      };

      for (const [chave, valor] of Object.entries(variaveis)) {
        corpo = corpo.replace(new RegExp(chave, 'g'), valor);
      }

      // Buscar configurações SMTP
      const smtpConfig = await getSMTPConfig();

      // Criar transporter
      const transporter = nodemailer.createTransport({
        host: smtpConfig.host,
        port: smtpConfig.port,
        secure: smtpConfig.secure,
        auth: {
          user: smtpConfig.auth.user,
          pass: smtpConfig.auth.pass
        }
      });

      // Enviar email de teste
      try {
        await transporter.sendMail({
          from: smtpConfig.from,
          to: userEmail,
          subject: `[TESTE] ${assunto}`,
          text: `*** ESTE É UM EMAIL DE TESTE ***\n\n${corpo}\n\n*** FIM DO TESTE ***`
        });

        res.json({
          success: true,
          message: `Email de teste enviado com sucesso para ${userEmail}`
        });

      } catch (emailError: any) {
        log.error(`Erro ao enviar email de teste: ${emailError.message}`);
        
        res.status(500).json({
          success: false,
          message: 'Erro ao enviar email de teste',
          error: emailError.message || 'Erro desconhecido ao enviar email'
        });
      }

    } catch (error: any) {
      log.error(`Erro ao testar template: ${error.message}`);
      
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message || 'Erro desconhecido'
      });
    }
  },

  /**
   * Reseta template para os valores padrão
   */
  resetarPadrao: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const now = getCurrentTimestamp();

      // Verificar se já existe template
      const templateExistente = await getOne<EmailTemplate>(
        'SELECT id FROM email_templates WHERE id_usuario = ?',
        [userId]
      );

      if (templateExistente) {
        // UPDATE para valores padrão
        await runQuery(
          `UPDATE email_templates SET 
            assunto_confirmacao = ?,
            template_texto_confirmacao = ?,
            assunto_lembrete = ?,
            template_texto_lembrete = ?,
            assinatura = ?,
            atualizado_em = ?
          WHERE id_usuario = ?`,
          [
            TEMPLATE_DEFAULT_CONFIRMACAO.assunto,
            TEMPLATE_DEFAULT_CONFIRMACAO.corpo,
            TEMPLATE_DEFAULT_LEMBRETE.assunto,
            TEMPLATE_DEFAULT_LEMBRETE.corpo,
            TEMPLATE_DEFAULT_CONFIRMACAO.assinatura,
            now,
            userId
          ]
        );
      } else {
        // INSERT com valores padrão
        await runQuery(
          `INSERT INTO email_templates (
            id_usuario, assunto_confirmacao, template_texto_confirmacao,
            assunto_lembrete, template_texto_lembrete, assinatura,
            criado_em, atualizado_em
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            userId,
            TEMPLATE_DEFAULT_CONFIRMACAO.assunto,
            TEMPLATE_DEFAULT_CONFIRMACAO.corpo,
            TEMPLATE_DEFAULT_LEMBRETE.assunto,
            TEMPLATE_DEFAULT_LEMBRETE.corpo,
            TEMPLATE_DEFAULT_CONFIRMACAO.assinatura,
            now,
            now
          ]
        );
      }

      // Buscar template atualizado
      const template = await getOne<EmailTemplate>(
        'SELECT * FROM email_templates WHERE id_usuario = ?',
        [userId]
      );

      res.json({
        message: 'Template resetado para o padrão',
        template
      });

    } catch (error: any) {
      log.error(`Erro ao resetar template: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};
