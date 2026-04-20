import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { clienteCreateSchema, clienteUpdateSchema } from '../validators/schemas';

export const clientesController = {
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { busca, regime, uf, ativo, page = 1, limit = 20 } = req.query;
      const where: string[] = ['1=1'];
      const params: any[] = [];

      if (busca) {
        const b = `%${busca}%`;
        params.push(b); const i1 = params.length;
        params.push(b); const i2 = params.length;
        params.push(b); const i3 = params.length;
        where.push(`(c.razao_social ILIKE $${i1} OR c.cnpj ILIKE $${i2} OR c.nome_fantasia ILIKE $${i3})`);
      }
      if (regime) { params.push(regime); where.push(`c.regime_tributario = $${params.length}`); }
      if (uf) { params.push(uf); where.push(`c.uf = $${params.length}`); }
      if (ativo !== undefined && ativo !== '') {
        params.push(ativo === 'true' || ativo === '1' ? 1 : 0);
        where.push(`c.ativo = $${params.length}`);
      }

      const whereClause = where.join(' AND ');
      const countResult = await getOne<{ total: string }>(
        `SELECT COUNT(*) AS total FROM adm_clientes c WHERE ${whereClause}`, params
      );

      const offset = (Number(page) - 1) * Number(limit);
      const listParams = [...params, Number(limit), offset];
      const limitIdx = listParams.length - 1;
      const offsetIdx = listParams.length;

      const clientes = await getAll<any>(
        `SELECT c.* FROM adm_clientes c WHERE ${whereClause} ORDER BY c.razao_social LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
        listParams
      );

      const total = parseInt(countResult?.total ?? '0', 10);
      res.json({
        data: clientes,
        pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
      });
    } catch (error: any) {
      log.error(`[clientesController] [listar] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const cliente = await getOne<any>('SELECT * FROM adm_clientes WHERE id = $1', [req.params.id]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });
      res.json(cliente);
    } catch (error: any) {
      log.error(`[clientesController] [buscarPorId] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = clienteCreateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const {
        cnpj, razao_social, nome_fantasia, inscricao_estadual, matriz,
        regime_tributario, endereco, numero, complemento, bairro,
        municipio, uf, cep,
      } = resultado.data;

      const existe = await getOne<any>('SELECT id FROM adm_clientes WHERE cnpj = $1', [cnpj]);
      if (existe) return res.status(409).json({ error: 'CNPJ já cadastrado' });

      const row = await runQuery(
        `INSERT INTO adm_clientes
          (cnpj, razao_social, nome_fantasia, inscricao_estadual, matriz,
           regime_tributario, endereco, numero, complemento, bairro,
           municipio, uf, cep, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,1)
         RETURNING id`,
        [
          cnpj, razao_social, nome_fantasia ?? null, inscricao_estadual ?? null,
          matriz ?? 'S', regime_tributario, endereco ?? null, numero ?? null,
          complemento ?? null, bairro ?? null, municipio ?? null, uf ?? null, cep ?? null,
        ]
      );

      const clienteId = row.id;

      // Replicar para adm_empresas
      await runQuery(
        `INSERT INTO adm_empresas
          (usuario_responsavel_id, cliente_id, cnpj, razao_social, nome_fantasia,
           inscricao_estadual, matriz, regime_tributario, endereco, numero,
           complemento, bairro, municipio, uf, cep, ativo)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,1)`,
        [
          req.user!.id, clienteId, cnpj, razao_social, nome_fantasia ?? null,
          inscricao_estadual ?? null, matriz ?? 'S', regime_tributario,
          endereco ?? null, numero ?? null, complemento ?? null, bairro ?? null,
          municipio ?? null, uf ?? null, cep ?? null,
        ]
      );

      const criado = await getOne<any>('SELECT * FROM adm_clientes WHERE id = $1', [clienteId]);
      res.status(201).json(criado);
    } catch (error: any) {
      log.error(`[clientesController] [criar] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = clienteUpdateSchema.safeParse(req.body);
      if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

      const cliente = await getOne<any>('SELECT * FROM adm_clientes WHERE id = $1', [req.params.id]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      // Verificar duplicidade de CNPJ em outro registro
      if (resultado.data.cnpj) {
        const dup = await getOne<any>(
          'SELECT id FROM adm_clientes WHERE cnpj = $1 AND id != $2',
          [resultado.data.cnpj, req.params.id]
        );
        if (dup) return res.status(409).json({ error: 'CNPJ já cadastrado em outro cliente' });
      }

      const sets: string[] = [];
      const vals: any[] = [];
      for (const [key, value] of Object.entries(resultado.data)) {
        if (value !== undefined) { vals.push(value); sets.push(`${key} = $${vals.length}`); }
      }
      if (sets.length === 0) return res.status(400).json({ error: 'Nenhum campo para atualizar' });

      sets.push('atualizado_em = NOW()');
      vals.push(req.params.id);
      await runQuery(`UPDATE adm_clientes SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);

      // Replicar atualização para adm_empresas (pelo cliente_id)
      const camposEmpresa = Object.entries(resultado.data).filter(([key]) =>
        ['cnpj','razao_social','nome_fantasia','inscricao_estadual','matriz',
         'regime_tributario','endereco','numero','complemento','bairro',
         'municipio','uf','cep'].includes(key)
      );
      if (camposEmpresa.length > 0) {
        const empSets: string[] = [];
        const empVals: any[] = [];
        for (const [key, value] of camposEmpresa) {
          if (value !== undefined) { empVals.push(value); empSets.push(`${key} = $${empVals.length}`); }
        }
        empSets.push('atualizado_em = NOW()');
        empVals.push(req.params.id);
        await runQuery(
          `UPDATE adm_empresas SET ${empSets.join(', ')} WHERE cliente_id = $${empVals.length}`,
          empVals
        );
      }

      const atualizado = await getOne<any>('SELECT * FROM adm_clientes WHERE id = $1', [req.params.id]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`[clientesController] [atualizar] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const cliente = await getOne<any>('SELECT id FROM adm_clientes WHERE id = $1', [req.params.id]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      // Inativar empresas vinculadas antes de excluir o cliente
      await runQuery(
        'UPDATE adm_empresas SET ativo = 0, atualizado_em = NOW() WHERE cliente_id = $1',
        [req.params.id]
      );

      await runQuery('DELETE FROM adm_clientes WHERE id = $1', [req.params.id]);
      res.json({ message: 'Cliente excluído com sucesso' });
    } catch (error: any) {
      log.error(`[clientesController] [excluir] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  alternarAtivo: async (req: AuthRequest, res: Response) => {
    try {
      const cliente = await getOne<any>('SELECT id, ativo FROM adm_clientes WHERE id = $1', [req.params.id]);
      if (!cliente) return res.status(404).json({ error: 'Cliente não encontrado' });

      const novoAtivo = cliente.ativo === 1 ? 0 : 1;
      await runQuery('UPDATE adm_clientes SET ativo = $1, atualizado_em = NOW() WHERE id = $2', [novoAtivo, req.params.id]);

      // Replicar status ativo para adm_empresas
      await runQuery(
        'UPDATE adm_empresas SET ativo = $1, atualizado_em = NOW() WHERE cliente_id = $2',
        [novoAtivo, req.params.id]
      );

      const atualizado = await getOne<any>('SELECT * FROM adm_clientes WHERE id = $1', [req.params.id]);
      res.json(atualizado);
    } catch (error: any) {
      log.error(`[clientesController] [alternarAtivo] Erro: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};
