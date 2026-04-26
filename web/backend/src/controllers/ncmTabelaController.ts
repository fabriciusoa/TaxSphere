import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { ncmTabelaCreateSchema, ncmTabelaUpdateSchema } from '../validators/schemas';

export const ncmTabelaController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { busca, status, page = 1, limit = 20 } = req.query;
      const where: string[] = ['1=1'];
      const params: any[] = [];

      if (busca) {
        const b = `%${busca}%`;
        params.push(b); const i1 = params.length;
        params.push(b); const i2 = params.length;
        where.push(`(n.codigo ILIKE $${i1} OR n.descricao ILIKE $${i2})`);
      }

      if (status !== undefined && status !== '') {
        params.push(status === 'true' || status === '1' ? true : false);
        where.push(`n.status = $${params.length}`);
      }

      const whereClause = where.join(' AND ');
      const countResult = await getOne<{ total: string }>(
        `SELECT COUNT(*) AS total FROM ncm_tabela n WHERE ${whereClause}`, params
      );

      const offset = (Number(page) - 1) * Number(limit);
      const listParams = [...params, Number(limit), offset];
      const limitIdx = listParams.length - 1;
      const offsetIdx = listParams.length;

      const ncms = await getAll<any>(
        `SELECT n.* FROM ncm_tabela n 
         WHERE ${whereClause} 
         ORDER BY n.codigo asc 
         LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        listParams
      );

      const total = parseInt(countResult?.total ?? '0', 10);
      res.json({
        data: ncms,
        pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
      });
    } catch (error: any) {
      log.error(`[ncmTabelaController] [listar] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const ncm = await getOne<any>('SELECT * FROM ncm_tabela WHERE id = $1', [req.params.id]);
      if (!ncm) return res.status(404).json({ error: 'NCM não encontrado' });
      res.json(ncm);
    } catch (error: any) {
      log.error(`[ncmTabelaController] [buscarPorId] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = ncmTabelaCreateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const {
        codigo,
        descricao,
        dt_inicio,
        dt_fim,
        ato_legal,
        numero,
        ano,
        status = true,
      } = resultado.data;

      const existe = await getOne<any>('SELECT id FROM ncm_tabela WHERE codigo = $1', [codigo]);
      if (existe) return res.status(409).json({ error: 'NCM com este código já existe' });

      const row = await runQuery(
        `INSERT INTO ncm_tabela
          (codigo, descricao, dt_inicio, dt_fim, ato_legal, numero, ano, status, dt_atualizacao)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW()::date)
         RETURNING *`,
        [codigo, descricao, dt_inicio || null, dt_fim || null, ato_legal || null, numero || null, ano || null, status]
      );

      log.info(`[ncmTabelaController] [criar] NCM criado: ${row.id}`);
      res.status(201).json(row);
    } catch (error: any) {
      log.error(`[ncmTabelaController] [criar] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro ao criar NCM' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = ncmTabelaUpdateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const ncmExistente = await getOne<any>('SELECT * FROM ncm_tabela WHERE id = $1', [req.params.id]);
      if (!ncmExistente) return res.status(404).json({ error: 'NCM não encontrado' });

      const {
        codigo = ncmExistente.codigo,
        descricao = ncmExistente.descricao,
        dt_inicio = ncmExistente.dt_inicio,
        dt_fim = ncmExistente.dt_fim,
        ato_legal = ncmExistente.ato_legal,
        numero = ncmExistente.numero,
        ano = ncmExistente.ano,
        status = ncmExistente.status,
      } = resultado.data;

      // Verificar se outro NCM já tem este código
      if (codigo !== ncmExistente.codigo) {
        const existe = await getOne<any>('SELECT id FROM ncm_tabela WHERE codigo = $1', [codigo]);
        if (existe) return res.status(409).json({ error: 'NCM com este código já existe' });
      }

      const row = await runQuery(
        `UPDATE ncm_tabela 
         SET codigo = $1, descricao = $2, dt_inicio = $3, dt_fim = $4, 
             ato_legal = $5, numero = $6, ano = $7, status = $8, 
             updated_at = NOW(), dt_atualizacao = NOW()::date
         WHERE id = $9
         RETURNING *`,
        [codigo, descricao, dt_inicio || null, dt_fim || null, ato_legal || null, numero || null, ano || null, status, req.params.id]
      );

      log.info(`[ncmTabelaController] [atualizar] NCM atualizado: ${req.params.id}`);
      res.json(row);
    } catch (error: any) {
      log.error(`[ncmTabelaController] [atualizar] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar NCM' });
    }
  },

  alternarStatus: async (req: AuthRequest, res: Response) => {
    try {
      const ncm = await getOne<any>('SELECT * FROM ncm_tabela WHERE id = $1', [req.params.id]);
      if (!ncm) return res.status(404).json({ error: 'NCM não encontrado' });

      const novoStatus = !ncm.status;
      const row = await runQuery(
        `UPDATE ncm_tabela 
         SET status = $1, updated_at = NOW(), dt_atualizacao = NOW()::date
         WHERE id = $2
         RETURNING *`,
        [novoStatus, req.params.id]
      );

      log.info(`[ncmTabelaController] [alternarStatus] Status alterado para ${novoStatus}`);
      res.json(row);
    } catch (error: any) {
      log.error(`[ncmTabelaController] [alternarStatus] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro ao alterar status' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const existe = await getOne<any>('SELECT id FROM ncm_tabela WHERE id = $1', [req.params.id]);
      if (!existe) return res.status(404).json({ error: 'NCM não encontrado' });

      await runQuery('DELETE FROM ncm_tabela WHERE id = $1', [req.params.id]);

      log.info(`[ncmTabelaController] [excluir] NCM deletado: ${req.params.id}`);
      res.json({ message: 'NCM deletado com sucesso' });
    } catch (error: any) {
      log.error(`[ncmTabelaController] [excluir] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro ao excluir NCM' });
    }
  },
};
