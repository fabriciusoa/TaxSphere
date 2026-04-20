import { Response } from 'express';
import { getOne, getAll, runQuery, beginTransaction, commitTransaction, rollbackTransaction } from '../database/connection';
import { AuthRequest } from '../types';
import { log } from '../utils/logger';

export const dctfwebController = {
  dashboard: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.query;
      const whereEmp = id_empresa ? 'WHERE d.id_empresa = ?' : '';
      const params = id_empresa ? [id_empresa] : [];

      const totais = await getOne<any>(
        `SELECT
           COUNT(*) as total_declaracoes,
           SUM(CASE WHEN d.situacao = 'Ativa' THEN 1 ELSE 0 END) as ativas,
           SUM(CASE WHEN d.situacao = 'Em Andamento' THEN 1 ELSE 0 END) as em_andamento,
           SUM(CASE WHEN d.situacao = 'Retificada' THEN 1 ELSE 0 END) as retificadas,
           SUM(d.debito_apurado) as total_debito,
           SUM(d.credito_vinculado) as total_credito,
           SUM(d.saldo_pagar) as total_saldo,
           SUM(CASE WHEN d.darf_pago = 1 THEN d.darf_valor ELSE 0 END) as total_pago,
           SUM(CASE WHEN d.darf_gerado = 1 AND d.darf_pago = 0 THEN d.darf_valor ELSE 0 END) as total_pendente
         FROM dctfweb_declaracoes d ${whereEmp}`,
        params
      );

      const porPeriodo = await getAll<any>(
        `SELECT d.periodo_apuracao, COUNT(*) as qtd,
                SUM(d.debito_apurado) as debito, SUM(d.saldo_pagar) as saldo
         FROM dctfweb_declaracoes d ${whereEmp}
         GROUP BY d.periodo_apuracao
         ORDER BY d.periodo_apuracao DESC
         LIMIT 12`,
        params
      );

      const porSituacao = await getAll<any>(
        `SELECT d.situacao, COUNT(*) as qtd
         FROM dctfweb_declaracoes d ${whereEmp}
         GROUP BY d.situacao`,
        params
      );

      const vencimentos = await getAll<any>(
        `SELECT d.id, d.periodo_apuracao, d.darf_vencimento, d.darf_valor, d.categoria,
                e.razao_social, e.cnpj
         FROM dctfweb_declaracoes d
         JOIN perdcomp_empresas e ON e.id = d.id_empresa
         WHERE d.darf_gerado = 1 AND d.darf_pago = 0
           AND d.darf_vencimento >= date('now')
           ${id_empresa ? 'AND d.id_empresa = ?' : ''}
         ORDER BY d.darf_vencimento ASC
         LIMIT 10`,
        id_empresa ? [id_empresa] : []
      );

      res.json({ totais, porPeriodo, porSituacao, vencimentos });
    } catch (error: any) {
      log.error(`Erro dashboard DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
  },

  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, situacao, periodo, busca, page = '1', limit = '15' } = req.query;
      const where: string[] = [];
      const params: any[] = [];

      if (id_empresa) { params.push(id_empresa); where.push(`d.id_empresa = $${params.length}`); }
      if (situacao) { params.push(situacao); where.push(`d.situacao = $${params.length}`); }
      if (periodo) { params.push(periodo); where.push(`d.periodo_apuracao = $${params.length}`); }
      if (busca) {
        const b = `%${busca}%`;
        params.push(b); where.push(`e.razao_social LIKE $${params.length}`);
        params.push(b); where.push(`e.cnpj LIKE $${params.length}`);
        params.push(b); where.push(`d.categoria LIKE $${params.length}`);
        params.push(b); where.push(`d.numero_recibo LIKE $${params.length}`);
        const last4 = where.splice(-4);
        where.push(`(${last4.join(' OR ')})`);
      }

      const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
      const offset = (Number(page) - 1) * Number(limit);

      const countResult = await getOne<{ total: number }>(
        `SELECT COUNT(*) as total FROM dctfweb_declaracoes d JOIN perdcomp_empresas e ON e.id = d.id_empresa ${whereClause}`,
        params
      );

      const listParamsD = [...params];
      listParamsD.push(Number(limit)); const limitIdxD = listParamsD.length;
      listParamsD.push(offset); const offsetIdxD = listParamsD.length;

      const declaracoes = await getAll<any>(
        `SELECT d.*, e.razao_social, e.cnpj
         FROM dctfweb_declaracoes d
         JOIN perdcomp_empresas e ON e.id = d.id_empresa
         ${whereClause}
         ORDER BY d.periodo_apuracao DESC, d.criado_em DESC
         LIMIT $${limitIdxD} OFFSET $${offsetIdxD}`,
        listParamsD
      );

      res.json({
        data: declaracoes,
        pagination: { total: countResult?.total || 0, page: Number(page), limit: Number(limit) },
      });
    } catch (error: any) {
      log.error(`Erro listar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar declarações' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const decl = await getOne<any>(
        `SELECT d.*, e.razao_social, e.cnpj
         FROM dctfweb_declaracoes d
         JOIN perdcomp_empresas e ON e.id = d.id_empresa
         WHERE d.id = $1`,
        [req.params.id]
      );
      if (!decl) return res.status(404).json({ error: 'Declaração não encontrada' });

      const tributos = await getAll<any>(
        'SELECT * FROM dctfweb_tributos WHERE id_declaracao = $1 ORDER BY codigo_receita',
        [req.params.id]
      );

      res.json({ ...decl, tributos });
    } catch (error: any) {
      log.error(`Erro buscar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao buscar declaração' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, categoria, periodo_apuracao, situacao, debito_apurado, credito_vinculado,
              saldo_pagar, data_transmissao, numero_recibo, observacoes, tributos } = req.body;

      if (!id_empresa || !categoria || !periodo_apuracao) {
        return res.status(400).json({ error: 'Empresa, categoria e período são obrigatórios' });
      }

      const txClient = await beginTransaction();
      let lastID: number;
      try {
        const { id: declId } = await runQuery(
          `INSERT INTO dctfweb_declaracoes
           (id_empresa, categoria, periodo_apuracao, situacao, debito_apurado, credito_vinculado,
            saldo_pagar, data_transmissao, numero_recibo, origem, observacoes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'Manual', $10)
           RETURNING id`,
          [id_empresa, categoria, periodo_apuracao, situacao || 'Em Andamento',
           debito_apurado || 0, credito_vinculado || 0, saldo_pagar || 0,
           data_transmissao || null, numero_recibo || null, observacoes || null],
          txClient
        );

        if (tributos && Array.isArray(tributos)) {
          for (const t of tributos) {
            const total = (t.valor_principal || 0) + (t.valor_multa || 0) + (t.valor_juros || 0);
            const saldo = total - (t.compensado || 0) - (t.suspenso || 0);
            await runQuery(
              `INSERT INTO dctfweb_tributos
               (id_declaracao, codigo_receita, descricao, valor_principal, valor_multa,
                valor_juros, valor_total, compensado, suspenso, saldo)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
              [declId, t.codigo_receita, t.descricao || null,
               t.valor_principal || 0, t.valor_multa || 0, t.valor_juros || 0,
               total, t.compensado || 0, t.suspenso || 0, saldo],
              txClient
            );
          }
        }
        await commitTransaction(txClient);
        lastID = declId;
      } catch (txErr) {
        await rollbackTransaction(txClient);
        throw txErr;
      }

      const created = await getOne<any>('SELECT * FROM dctfweb_declaracoes WHERE id = $1', [lastID]);
      res.status(201).json(created);
    } catch (error: any) {
      log.error(`Erro criar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao criar declaração' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const decl = await getOne<any>('SELECT * FROM dctfweb_declaracoes WHERE id = $1', [req.params.id]);
      if (!decl) return res.status(404).json({ error: 'Declaração não encontrada' });

      const campos = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      const allowed = ['situacao', 'debito_apurado', 'credito_vinculado', 'saldo_pagar',
                        'data_transmissao', 'numero_recibo', 'darf_gerado', 'darf_codigo',
                        'darf_vencimento', 'darf_valor', 'darf_pago', 'observacoes'];

      for (const [key, value] of Object.entries(campos)) {
        if (allowed.includes(key) && value !== undefined) {
          vals.push(value);
          sets.push(`${key} = $${vals.length}`);
        }
      }
      if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

      sets.push("atualizado_em = NOW()");
      vals.push(req.params.id);
      await runQuery(`UPDATE dctfweb_declaracoes SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      const updated = await getOne<any>('SELECT * FROM dctfweb_declaracoes WHERE id = $1', [req.params.id]);
      res.json(updated);
    } catch (error: any) {
      log.error(`Erro atualizar DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar declaração' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const decl = await getOne<any>('SELECT id FROM dctfweb_declaracoes WHERE id = $1', [req.params.id]);
      if (!decl) return res.status(404).json({ error: 'Declaração não encontrada' });

      await runQuery('DELETE FROM dctfweb_tributos WHERE id_declaracao = $1', [req.params.id]);
      await runQuery('DELETE FROM dctfweb_declaracoes WHERE id = $1', [req.params.id]);
      res.json({ message: 'Declaração excluída' });
    } catch (error: any) {
      log.error(`Erro excluir DCTFWeb: ${error.message}`);
      res.status(500).json({ error: 'Erro ao excluir declaração' });
    }
  },

  gerarDarf: async (req: AuthRequest, res: Response) => {
    try {
      const { codigo, vencimento, valor } = req.body;
      const decl = await getOne<any>('SELECT * FROM dctfweb_declaracoes WHERE id = $1', [req.params.id]);
      if (!decl) return res.status(404).json({ error: 'Declaração não encontrada' });

      await runQuery(
        `UPDATE dctfweb_declaracoes
         SET darf_gerado = 1, darf_codigo = $1, darf_vencimento = $2, darf_valor = $3,
             atualizado_em = NOW()
         WHERE id = $4`,
        [codigo || '', vencimento || '', valor || decl.saldo_pagar, req.params.id]
      );

      res.json({ message: 'DARF gerado com sucesso' });
    } catch (error: any) {
      log.error(`Erro gerar DARF: ${error.message}`);
      res.status(500).json({ error: 'Erro ao gerar DARF' });
    }
  },

  marcarPago: async (req: AuthRequest, res: Response) => {
    try {
      const decl = await getOne<any>('SELECT * FROM dctfweb_declaracoes WHERE id = $1', [req.params.id]);
      if (!decl) return res.status(404).json({ error: 'Declaração não encontrada' });

      await runQuery(
        `UPDATE dctfweb_declaracoes SET darf_pago = 1, atualizado_em = NOW() WHERE id = $1`,
        [req.params.id]
      );
      res.json({ message: 'DARF marcado como pago' });
    } catch (error: any) {
      log.error(`Erro marcar pago: ${error.message}`);
      res.status(500).json({ error: 'Erro ao marcar como pago' });
    }
  },
};
