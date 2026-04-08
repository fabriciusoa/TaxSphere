import { Response } from 'express';
import { getOne, getAll, runQuery } from '../database/connection';
import { Parametro, AuthRequest } from '../types';
import { atualizarParametroSchema } from '../validators/schemas';
import { getCurrentTimestamp } from '../utils/dateHelpers';
import { log } from '../utils/logger';
  
export const parametrosController = {
  // Listar todos os parâmetros
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const parametros = await getAll<Parametro>(
        'SELECT * FROM parametros ORDER BY chave'
      );
      res.json(parametros);
    } catch (error: any) {
      log.error(`Erro ao listar parâmetros: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar parâmetro por ID
  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parametro = await getOne<Parametro>(
        'SELECT * FROM parametros WHERE id = ?',
        [id]
      );

      if (!parametro) {
        return res.status(404).json({ error: 'Parâmetro não encontrado' });
      }

      res.json(parametro);
    } catch (error: any) {
      log.error(`Erro ao buscar parâmetro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar parâmetro (apenas valor e descrição)
  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const resultado = atualizarParametroSchema.safeParse(req.body);
      if (!resultado.success) {
        return res.status(400).json({ errors: resultado.error.errors });
      }

      // Verificar se parâmetro existe
      const parametro = await getOne<Parametro>(
        'SELECT * FROM parametros WHERE id = ?',
        [id]
      );
      if (!parametro) {
        return res.status(404).json({ error: 'Parâmetro não encontrado' });
      }

      const campos: string[] = [];
      const valores: any[] = [];

      if (resultado.data.valor !== undefined) {
        campos.push('valor = ?');
        valores.push(resultado.data.valor);
      }
      if (resultado.data.descricao !== undefined) {
        campos.push('descricao = ?');
        valores.push(resultado.data.descricao);
      }

      if (campos.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      // Sempre atualizar updated_at
      campos.push('updated_at = ?');
      valores.push(getCurrentTimestamp());

      valores.push(id);
      await runQuery(
        `UPDATE parametros SET ${campos.join(', ')} WHERE id = ?`,
        valores
      );

      const parametroAtualizado = await getOne<Parametro>(
        'SELECT * FROM parametros WHERE id = ?',
        [id]
      );

      res.json(parametroAtualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar parâmetro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Obter Stripe Publishable Key baseado no ambiente
  obterStripePublishableKey: async (req: AuthRequest, res: Response) => {
    try {
      const nodeEnv = await getOne<Parametro>(
        'SELECT valor FROM parametros WHERE chave = ?',
        ['NODE_ENV']
      );

      const isDev = nodeEnv?.valor?.toLowerCase() === 'dev';
      const chaveParam = isDev ? 'DES_STRIPE_CHAVE_PUB' : 'PRD_STRIPE_CHAVE_PUB';

      const publishableKey = await getOne<Parametro>(
        'SELECT valor FROM parametros WHERE chave = ?',
        [chaveParam]
      );

      if (!publishableKey || !publishableKey.valor) {
        return res.status(500).json({ 
          error: 'Stripe publishable key não configurada',
          chave: chaveParam
        });
      }

      res.json({
        publishableKey: publishableKey.valor,
        isTestMode: isDev
      });
    } catch (error: any) {
      log.error(`Erro ao obter Stripe publishable key: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};
