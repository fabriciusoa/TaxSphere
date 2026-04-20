import { Response } from 'express';
import { getAll, getOne, runQuery } from '../database/connection';
import { AuthRequest } from '../types';
import { getCurrentTimestamp } from '../utils/dateHelpers';
import { criarManutencaoSchema, atualizarManutencaoSchema } from '../validators/schemas';
import { log } from '../utils/logger';

interface Manutencao {
  id: number;
  descricao: string;
  dt_inicio: string;
  dt_fim: string | null;
  status: 'planejada' | 'em_execucao' | 'terminado';
  dt_excluido_em: string | null;
  created_at: string;
  updated_at: string;
}

export const manutencaoController = {

  listar: async (req: AuthRequest, res: Response) => {
    try {
      const manutencoes = await getAll<Manutencao>(
        `SELECT * FROM sys_manutencao
         WHERE excluded_at IS NULL
         ORDER BY dt_inicio DESC`
      );
      res.json(manutencoes);
    } catch (error: any) {
      log.error(`Erro ao listar manutenções: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const parse = criarManutencaoSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ error: parse.error.errors[0].message });
      }

      const { descricao, dt_inicio, dt_fim, status } = parse.data;
      const statusFinal = status || 'planejada';

      const now = getCurrentTimestamp();
      const result = await runQuery(
        `INSERT INTO sys_manutencao (descricao, dt_inicio, dt_fim, status,usuario_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [descricao, dt_inicio, dt_fim || null, statusFinal, req.user?.id]
      );

      const novaManutencao = await getOne<Manutencao>(
        'SELECT * FROM sys_manutencao WHERE id = $1',
        [result.id]
      );

      res.status(201).json(novaManutencao);
    } catch (error: any) {
      log.error(`Erro ao criar manutenção: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const parse = atualizarManutencaoSchema.safeParse(req.body);
      if (!parse.success) {
        return res.status(400).json({ error: parse.error.errors[0].message });
      }

      const { descricao, dt_inicio, dt_fim, status } = parse.data;

      const manutencao = await getOne<Manutencao>(
        'SELECT * FROM sys_manutencao WHERE id = $1 AND excluded_at IS NULL',
        [id]
      );

      if (!manutencao) {
        return res.status(404).json({ error: 'Manutenção não encontrada' });
      }

      await runQuery(
        `UPDATE sys_manutencao
         SET descricao = $1, dt_inicio = $2, dt_fim = $3, status = $4, updated_at = $5
         WHERE id = $6`,
        [
          descricao   !== undefined ? descricao   : manutencao.descricao,
          dt_inicio   !== undefined ? dt_inicio   : manutencao.dt_inicio,
          dt_fim      !== undefined ? (dt_fim || null) : manutencao.dt_fim,
          status      !== undefined ? status       : manutencao.status,
          getCurrentTimestamp(),
          id
        ]
      );

      const atualizada = await getOne<Manutencao>(
        'SELECT * FROM sys_manutencao WHERE id = $1',
        [id]
      );

      res.json(atualizada);
    } catch (error: any) {
      log.error(`Erro ao atualizar manutenção: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const manutencao = await getOne<Manutencao>(
        'SELECT * FROM sys_manutencao WHERE id = $1 AND excluded_at IS NULL',
        [id]
      );

      if (!manutencao) {
        return res.status(404).json({ error: 'Manutenção não encontrada' });
      }

      const now = getCurrentTimestamp();
      await runQuery(
        'UPDATE sys_manutencao SET excluded_at = $1, updated_at = $2 WHERE id = $3',
        [now, now, id]
      );

      res.json({ message: 'Manutenção arquivada com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao arquivar manutenção: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  ativas: async (req: AuthRequest, res: Response) => {
    try {
      const manutencoes = await getAll<Manutencao>(
        `SELECT * FROM sys_manutencao
         WHERE excluded_at IS NULL
           AND (
             status = 'em_execucao'
             OR (status = 'planejada' AND dt_inicio <= NOW() + INTERVAL '5 days')
           )
         ORDER BY dt_inicio ASC`
      );
      res.json(manutencoes);
    } catch (error: any) {
      log.error(`Erro ao buscar manutenções ativas: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

};
