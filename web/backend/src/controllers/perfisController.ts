import { Response } from 'express';
import { AuthRequest } from '../types';
import { getAll, getOne, runQuery } from '../database/connection';
import { log } from '../utils/logger';
import { perfilCreateSchema, perfilUpdateSchema } from '../validators/schemas';

export const perfisController = {
	// Árvore de módulos e funcionalidades
	arvoreMenu: async (req: AuthRequest, res: Response) => {
		try {
			const modulos = await getAll<any>(
				`SELECT m.id, m.modulo, 
          json_agg(json_build_object('id', f.id, 'funcionalidade', f.funcionalidade) ORDER BY f.funcionalidade) AS funcionalidades
         FROM sys_modulo m
         LEFT JOIN sys_funcionalidade f ON f.modulo_id = m.id
         GROUP BY m.id, m.modulo
         ORDER BY m.ordenacao`,
				[]
			);
			res.json(modulos);
		} catch (error: any) {
			log.error(`[perfisController] [arvoreMenu] Erro: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	// Listar perfis
	listar: async (req: AuthRequest, res: Response) => {
		try {
			const { busca, page = 1, limit = 20 } = req.query;
			const where: string[] = ['p.excluded_at IS NULL'];
			const params: any[] = [];

			if (busca) {
				params.push(`%${busca}%`);
				where.push(`p.perfil ILIKE $${params.length}`);
			}

			const userPerfilId = req.user?.adm_system;
			// Verificar se é admin
			if (!userPerfilId) {
				const cliente_id = await getOne<any>(`SELECT cliente_id FROM adm_usuarios WHERE id = $1`, [req.user?.id]);
				params.push(cliente_id);
				where.push(`p.cliente_id = $${params.length}`);
			}

			const whereClause = where.join(' AND ');
			const countResult = await getOne<{ total: string }>(
				`SELECT COUNT(*) AS total FROM adm_perfil p WHERE ${whereClause}`, params
			);

			const offset = (Number(page) - 1) * Number(limit);
			const listParams = [...params, Number(limit), offset];

			const perfis = await getAll<any>(
				`SELECT p.*, c.razao_social AS cliente_nome
         FROM adm_perfil p
         LEFT JOIN adm_clientes c ON c.id = p.cliente_id
         WHERE ${whereClause}
         ORDER BY p.perfil
         LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
				listParams
			);

			const total = parseInt(countResult?.total ?? '0', 10);
			res.json({
				data: perfis,
				pagination: { page: Number(page), limit: Number(limit), total, totalPages: Math.ceil(total / Number(limit)) },
			});
		} catch (error: any) {
			log.error(`[perfisController] [listar] Erro: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	// Buscar perfil por ID com suas permissões
	buscarPorId: async (req: AuthRequest, res: Response) => {
		try {
			const perfil = await getOne<any>(
				`SELECT p.*, c.razao_social AS cliente_nome
         FROM adm_perfil p
         LEFT JOIN adm_clientes c ON c.id = p.cliente_id
         WHERE p.id = $1 AND p.excluded_at IS NULL`,
				[req.params.id]
			);
			if (!perfil) return res.status(404).json({ error: 'Perfil não encontrado' });

			const permissoes = await getAll<any>(
				`SELECT pp.id, pp.funcionalidade_id, pp.inserir, pp.alterar, pp.consultar, pp.excluir
         FROM adm_perfil_permissao pp
         WHERE pp.perfil_id = $1 AND pp.excluded_at IS NULL`,
				[req.params.id]
			);

			res.json({ ...perfil, permissoes });
		} catch (error: any) {
			log.error(`[perfisController] [buscarPorId] Erro: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	// Criar perfil com permissões
	criar: async (req: AuthRequest, res: Response) => {
		try {
			const resultado = perfilCreateSchema.safeParse(req.body);
			if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

			const { perfil, permissoes } = resultado.data;

			// Buscar cliente_id do usuário logado (se não for adm_system)
			let clienteId: number | null = null;
			if (!req.user!.adm_system) {
				const usuario = await getOne<any>('SELECT cliente_id FROM adm_usuarios WHERE id = $1', [req.user!.id]);
				clienteId = usuario?.cliente_id ?? null;
			}

			const existe = await getOne<any>(
				'SELECT id FROM adm_perfil WHERE perfil = $1 AND cliente_id = $2 AND excluded_at IS NULL',
				[perfil, clienteId]
			);
			if (existe) return res.status(409).json({ error: 'Nome de perfil já existe' });

			const row = await runQuery(
				`INSERT INTO adm_perfil (perfil, cliente_id, adm_system) VALUES ($1, $2, $3) RETURNING id`,
				[perfil, clienteId, req.user!.adm_system ?? false]
			);
			const perfilId = row.id;

			// Inserir permissões
			if (permissoes && permissoes.length > 0) {
				for (const perm of permissoes) {
					await runQuery(
						`INSERT INTO adm_perfil_permissao (perfil_id, funcionalidade_id, inserir, alterar, consultar, excluir)
             VALUES ($1, $2, $3, $4, $5, $6)`,
						[perfilId, perm.funcionalidade_id, perm.inserir ?? true, perm.alterar ?? true, perm.consultar ?? true, perm.excluir ?? true]
					);
				}
			}

			const criado = await getOne<any>('SELECT * FROM adm_perfil WHERE id = $1', [perfilId]);
			const permsCreated = await getAll<any>(
				'SELECT * FROM adm_perfil_permissao WHERE perfil_id = $1 AND excluded_at IS NULL',
				[perfilId]
			);
			res.status(201).json({ ...criado, permissoes: permsCreated });
		} catch (error: any) {
			log.error(`Erro: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	// Atualizar perfil e sincronizar permissões
	atualizar: async (req: AuthRequest, res: Response) => {
		try {
			const resultado = perfilUpdateSchema.safeParse(req.body);
			if (!resultado.success) return res.status(400).json({ errors: resultado.error.errors });

			const perfilExistente = await getOne<any>(
				'SELECT * FROM adm_perfil WHERE id = $1 AND excluded_at IS NULL',
				[req.params.id]
			);
			if (!perfilExistente) return res.status(404).json({ error: 'Perfil não encontrado' });

			const { perfil, permissoes } = resultado.data;

			if (perfil && perfil !== perfilExistente.perfil) {
				const dup = await getOne<any>(
					'SELECT id FROM adm_perfil WHERE perfil = $1 AND cliente_id = $2 AND excluded_at IS NULL AND id != $3',
					[perfil, perfilExistente.cliente_id, req.params.id]
				);
				if (dup) return res.status(409).json({ error: 'Nome de perfil já existe' });
				await runQuery('UPDATE adm_perfil SET perfil = $1 WHERE id = $2', [perfil, req.params.id]);
			}

			// Sincronizar permissões: excluir logicamente as existentes e reinserir
			if (permissoes !== undefined) {
				await runQuery(
					'UPDATE adm_perfil_permissao SET excluded_at = NOW() WHERE perfil_id = $1 AND excluded_at IS NULL',
					[req.params.id]
				);
				for (const perm of permissoes) {
					await runQuery(
						`INSERT INTO adm_perfil_permissao (perfil_id, funcionalidade_id, inserir, alterar, consultar, excluir)
             VALUES ($1, $2, $3, $4, $5, $6)`,
						[req.params.id, perm.funcionalidade_id, perm.inserir ?? true, perm.alterar ?? true, perm.consultar ?? true, perm.excluir ?? true]
					);
				}
			}

			const atualizado = await getOne<any>('SELECT * FROM adm_perfil WHERE id = $1', [req.params.id]);
			const permsAtualizadas = await getAll<any>(
				'SELECT * FROM adm_perfil_permissao WHERE perfil_id = $1 AND excluded_at IS NULL',
				[req.params.id]
			);
			res.json({ ...atualizado, permissoes: permsAtualizadas });
		} catch (error: any) {
			log.error(`[perfisController] [atualizar] Erro: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	// Excluir perfil (soft delete)
	excluir: async (req: AuthRequest, res: Response) => {
		try {
			const perfil = await getOne<any>(
				'SELECT id FROM adm_perfil WHERE id = $1 AND excluded_at IS NULL',
				[req.params.id]
			);
			if (!perfil) return res.status(404).json({ error: 'Perfil não encontrado' });

			await runQuery('UPDATE adm_perfil SET excluded_at = NOW() WHERE id = $1', [req.params.id]);
			await runQuery(
				'UPDATE adm_perfil_permissao SET excluded_at = NOW() WHERE perfil_id = $1 AND excluded_at IS NULL',
				[req.params.id]
			);
			res.json({ message: 'Perfil excluído com sucesso' });
		} catch (error: any) {
			log.error(`[perfisController] [excluir] Erro: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},
};
