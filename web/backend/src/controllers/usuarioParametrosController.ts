import { Response } from 'express';
import { getOne, runQuery } from '../database/connection';
import { AuthRequest } from '../types';
import { getCurrentTimestamp } from '../utils/dateHelpers';
import { log } from '../utils/logger';

export const usuarioParametrosController = {
  // Buscar parâmetros do usuário logado
  buscarMeus: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const parametros = await getOne<any>(
        `SELECT * FROM usuario_parametros WHERE id_usuario = $1`,
        [userId]
      );

      if (!parametros) {
        return res.status(404).json({ error: 'Parâmetros não encontrados' });
      }

      res.json(parametros);
    } catch (error: any) {
      log.error(`Erro ao buscar parâmetros: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar parâmetros para o usuário logado
  criar: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const {
        duracao_sessao = 50,
        tempo_entre_sessao = 10,
        enviar_email = true,
        enviar_whats = false,
        tempo_lembrete = 24,
        permite_paciente_remarcar = true,
        tempo_remarcacao = 24,
        permite_paciente_cancelar = true,
        tempo_cancelamento = 24
      } = req.body;

      // Verificar se já existe registro
      const existe = await getOne<any>(
        'SELECT id FROM usuario_parametros WHERE id_usuario = $1',
        [userId]
      );

      if (existe) {
        return res.status(409).json({ error: 'Parâmetros já existem para este usuário' });
      }

      const resultado = await runQuery(
        `INSERT INTO usuario_parametros (
          id_usuario, duracao_sessao, tempo_entre_sessao, enviar_email,
          enviar_whats, tempo_lembrete, permite_paciente_remarcar,
          tempo_remarcacao, permite_paciente_cancelar, tempo_cancelamento, criado_em
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          userId, duracao_sessao, tempo_entre_sessao, enviar_email ? 1 : 0,
          enviar_whats ? 1 : 0, tempo_lembrete, permite_paciente_remarcar ? 1 : 0,
          tempo_remarcacao, permite_paciente_cancelar ? 1 : 0, tempo_cancelamento,
          getCurrentTimestamp()
        ]
      );

      const parametros = await getOne<any>(
        'SELECT * FROM usuario_parametros WHERE id_usuario = $1',
        [userId]
      );

      res.status(201).json(parametros);
    } catch (error: any) {
      log.error(`Erro ao criar parâmetros: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar parâmetros do usuário logado
  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const {
        duracao_sessao,
        tempo_entre_sessao,
        enviar_email,
        enviar_whats,
        tempo_lembrete,
        permite_paciente_remarcar,
        tempo_remarcacao,
        permite_paciente_cancelar,
        tempo_cancelamento
      } = req.body;

      // Montar query de update dinamicamente apenas com campos fornecidos
      const fields: string[] = [];
      const values: any[] = [];

      if (duracao_sessao !== undefined) {
        values.push(duracao_sessao);
        fields.push(`duracao_sessao = $${values.length}`);
      }
      if (tempo_entre_sessao !== undefined) {
        values.push(tempo_entre_sessao);
        fields.push(`tempo_entre_sessao = $${values.length}`);
      }
      if (enviar_email !== undefined) {
        values.push(enviar_email ? 1 : 0);
        fields.push(`enviar_email = $${values.length}`);
      }
      if (enviar_whats !== undefined) {
        values.push(enviar_whats ? 1 : 0);
        fields.push(`enviar_whats = $${values.length}`);
      }
      if (tempo_lembrete !== undefined) {
        values.push(tempo_lembrete);
        fields.push(`tempo_lembrete = $${values.length}`);
      }
      if (permite_paciente_remarcar !== undefined) {
        values.push(permite_paciente_remarcar ? 1 : 0);
        fields.push(`permite_paciente_remarcar = $${values.length}`);
      }
      if (tempo_remarcacao !== undefined) {
        values.push(tempo_remarcacao);
        fields.push(`tempo_remarcacao = $${values.length}`);
      }
      if (permite_paciente_cancelar !== undefined) {
        values.push(permite_paciente_cancelar ? 1 : 0);
        fields.push(`permite_paciente_cancelar = $${values.length}`);
      }
      if (tempo_cancelamento !== undefined) {
        values.push(tempo_cancelamento);
        fields.push(`tempo_cancelamento = $${values.length}`);
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      values.push(getCurrentTimestamp());
      fields.push(`atualizado_em = $${values.length}`);
      values.push(userId);

      await runQuery(
        `UPDATE usuario_parametros SET ${fields.join(', ')} WHERE id_usuario = $${values.length}`,
        values
      );

      const parametros = await getOne<any>(
        'SELECT * FROM usuario_parametros WHERE id_usuario = $1',
        [userId]
      );

      if (!parametros) {
        return res.status(404).json({ error: 'Parâmetros não encontrados' });
      }

      res.json(parametros);
    } catch (error: any) {
      log.error(`Erro ao atualizar parâmetros: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar cores do calendário do usuário logado
  buscarCores: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const parametros = await getOne<any>(
        `SELECT 
          cor_agendado, 
          cor_confirmado, 
          cor_cancelado, 
          cor_realizado, 
          cor_faltou, 
          cor_reagendado 
        FROM usuario_parametros 
        WHERE id_usuario = $1`,
        [userId]
      );

      if (!parametros) {
        return res.status(404).json({ error: 'Parâmetros não encontrados' });
      }

      res.json(parametros);
    } catch (error: any ) {
      log.error(`Erro ao buscar cores: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // ADMIN: Buscar parâmetros de um usuário específico
  buscarPorUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const parametros = await getOne<any>(
        `SELECT * FROM usuario_parametros WHERE id_usuario = $1`,
        [userId]
      );

      if (!parametros) {
        return res.status(404).json({ error: 'Parâmetros não encontrados' });
      }

      res.json(parametros);
    } catch (error: any) {
      log.error(`Erro ao buscar parâmetros do usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // ADMIN: Criar parâmetros para um usuário específico
  criarParaUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const {
        duracao_sessao = 50,
        tempo_entre_sessao = 10,
        enviar_email = true,
        enviar_whats = false,
        tempo_lembrete = 24,
        permite_paciente_remarcar = true,
        tempo_remarcacao = 24,
        permite_paciente_cancelar = true,
        tempo_cancelamento = 24,
        cor_agendado,
        cor_confirmado,
        cor_cancelado,
        cor_realizado,
        cor_faltou,
        cor_reagendado
      } = req.body;

      // Verificar se já existe registro
      const existe = await getOne<any>(
        'SELECT id FROM usuario_parametros WHERE id_usuario = $1',
        [userId]
      );

      if (existe) {
        return res.status(409).json({ error: 'Parâmetros já existem para este usuário' });
      }

      await runQuery(
        `INSERT INTO usuario_parametros (
          id_usuario, duracao_sessao, tempo_entre_sessao, enviar_email,
          enviar_whats, tempo_lembrete, permite_paciente_remarcar,
          tempo_remarcacao, permite_paciente_cancelar, tempo_cancelamento,
          cor_agendado, cor_confirmado, cor_cancelado, cor_realizado, cor_faltou, cor_reagendado,
          criado_em
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          userId, duracao_sessao, tempo_entre_sessao, enviar_email ? 1 : 0,
          enviar_whats ? 1 : 0, tempo_lembrete, permite_paciente_remarcar ? 1 : 0,
          tempo_remarcacao, permite_paciente_cancelar ? 1 : 0, tempo_cancelamento,
          cor_agendado, cor_confirmado, cor_cancelado, cor_realizado, cor_faltou, cor_reagendado,
          getCurrentTimestamp()
        ]
      );

      const parametros = await getOne<any>(
        'SELECT * FROM usuario_parametros WHERE id_usuario = $1',
        [userId]
      );

      res.status(201).json(parametros);
    } catch (error: any) {
      log.error(`Erro ao criar parâmetros: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // ADMIN: Atualizar parâmetros de um usuário específico
  atualizarPorUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const {
        duracao_sessao,
        tempo_entre_sessao,
        enviar_email,
        enviar_whats,
        tempo_lembrete,
        permite_paciente_remarcar,
        tempo_remarcacao,
        permite_paciente_cancelar,
        tempo_cancelamento,
        cor_agendado,
        cor_confirmado,
        cor_cancelado,
        cor_realizado,
        cor_faltou,
        cor_reagendado
      } = req.body;

      // Montar query de update dinamicamente apenas com campos fornecidos
      const fields: string[] = [];
      const values: any[] = [];

      if (duracao_sessao !== undefined) {
        values.push(duracao_sessao);
        fields.push(`duracao_sessao = $${values.length}`);
      }
      if (tempo_entre_sessao !== undefined) {
        values.push(tempo_entre_sessao);
        fields.push(`tempo_entre_sessao = $${values.length}`);
      }
      if (enviar_email !== undefined) {
        values.push(enviar_email ? 1 : 0);
        fields.push(`enviar_email = $${values.length}`);
      }
      if (enviar_whats !== undefined) {
        values.push(enviar_whats ? 1 : 0);
        fields.push(`enviar_whats = $${values.length}`);
      }
      if (tempo_lembrete !== undefined) {
        values.push(tempo_lembrete);
        fields.push(`tempo_lembrete = $${values.length}`);
      }
      if (permite_paciente_remarcar !== undefined) {
        values.push(permite_paciente_remarcar ? 1 : 0);
        fields.push(`permite_paciente_remarcar = $${values.length}`);
      }
      if (tempo_remarcacao !== undefined) {
        values.push(tempo_remarcacao);
        fields.push(`tempo_remarcacao = $${values.length}`);
      }
      if (permite_paciente_cancelar !== undefined) {
        values.push(permite_paciente_cancelar ? 1 : 0);
        fields.push(`permite_paciente_cancelar = $${values.length}`);
      }
      if (tempo_cancelamento !== undefined) {
        values.push(tempo_cancelamento);
        fields.push(`tempo_cancelamento = $${values.length}`);
      }
      if (cor_agendado !== undefined) {
        values.push(cor_agendado);
        fields.push(`cor_agendado = $${values.length}`);
      }
      if (cor_confirmado !== undefined) {
        values.push(cor_confirmado);
        fields.push(`cor_confirmado = $${values.length}`);
      }
      if (cor_cancelado !== undefined) {
        values.push(cor_cancelado);
        fields.push(`cor_cancelado = $${values.length}`);
      }
      if (cor_realizado !== undefined) {
        values.push(cor_realizado);
        fields.push(`cor_realizado = $${values.length}`);
      }
      if (cor_faltou !== undefined) {
        values.push(cor_faltou);
        fields.push(`cor_faltou = $${values.length}`);
      }
      if (cor_reagendado !== undefined) {
        values.push(cor_reagendado);
        fields.push(`cor_reagendado = $${values.length}`);
      }

      if (fields.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      values.push(getCurrentTimestamp());
      fields.push(`atualizado_em = $${values.length}`);
      values.push(userId);

      await runQuery(
        `UPDATE usuario_parametros SET ${fields.join(', ')} WHERE id_usuario = $${values.length}`,
        values
      );

      const parametros = await getOne<any>(
        'SELECT * FROM usuario_parametros WHERE id_usuario = $1',
        [userId]
      );

      if (!parametros) {
        return res.status(404).json({ error: 'Parâmetros não encontrados' });
      }

      res.json(parametros);
    } catch (error: any) {
      log.error(`Erro ao atualizar parâmetros: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};
