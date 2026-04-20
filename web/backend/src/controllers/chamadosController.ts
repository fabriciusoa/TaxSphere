import { Response } from 'express';
import { getOne, getAll, runQuery, beginTransaction, commitTransaction, rollbackTransaction } from '../database/connection';
import { AuthRequest, Chamado, ChamadoComentario, ALLOWED_MIME_TYPES, MAX_FILE_SIZE, MAX_FILES_PER_COMMENT } from '../types';
import { getCurrentTimestamp } from '../utils/dateHelpers';
import { processImage, isImage, formatBytes } from '../utils/imageProcessor';
import { getSMTPConfig, getBaseUrl, getParametro } from '../utils/parametrosHelper';
import nodemailer from 'nodemailer';
import logger, { log } from '../utils/logger';

/**
 * Envia email de notificação sobre chamado
 */
async function enviarEmailNotificacaoChamado(
	idChamado: number,
	tipoNotificacao: 'novo_comentario' | 'mudanca_status',
	dadosExtras?: { comentario?: string; novoStatus?: string }
): Promise<boolean> {
	try {
		// 1. Buscar dados do chamado e usuário
		const chamado = await getOne<any>(`
      SELECT c.*, u.email, u.nome as nome_usuario
      from sys_chamado c
      INNER JOIN adm_usuarios u ON c.usuario_id = u.id
      WHERE c.id = $1
    `, [idChamado]);

		if (!chamado || !chamado.email) {
			log.error(`Email não encontrado para chamado ${idChamado}`);
			return false;
		}

		// 2. Buscar BASE_URL e NODE_ENV dos parâmetros
		const baseUrl = await getBaseUrl();
		const nodeEnv = await getParametro('NODE_ENV');

		// 3. Montar assunto e corpo do email
		let assunto = '';
		let corpo = '';

		if (tipoNotificacao === 'novo_comentario') {
			assunto = `💬 Novo comentário no Chamado #${chamado.id} - ${chamado.titulo}`;
			corpo = `Olá ${chamado.nome_usuario},

Houve uma atualização no seu chamado:

📌 Chamado: #${chamado.id}
📝 Título: ${chamado.titulo}
🔄 Status: ${chamado.status}
📅 Categoria: ${chamado.categoria}

💬 Novo comentário da equipe de suporte:
"${dadosExtras?.comentario || ''}"

Para visualizar os detalhes completos e responder, acesse:
${baseUrl}suporte/chamado

---
Atenciosamente,
Equipe de Suporte - Sistema Mentis`;

		} else if (tipoNotificacao === 'mudanca_status') {
			assunto = `🔄 Status atualizado: Chamado #${chamado.id}`;
			corpo = `Olá ${chamado.nome_usuario},

O status do seu chamado foi atualizado:

📌 Chamado: #${chamado.id}
📝 Título: ${chamado.titulo}
🔄 Novo Status: ${dadosExtras?.novoStatus || chamado.status}
📅 Categoria: ${chamado.categoria}

Para visualizar os detalhes completos, acesse:
${baseUrl}suporte/chamado

---
Atenciosamente,
Equipe de Suporte - Sistema Mentis`;
		}

		// 4. Enviar email usando configuração SMTP
		const smtpConfig = await getSMTPConfig();
		const transporter = nodemailer.createTransport({
			host: smtpConfig.host,
			port: smtpConfig.port,
			secure: smtpConfig.secure,
			auth: smtpConfig.auth,
		});


		let destinatario = chamado.email;
		// Modo DEV: redirecionar para email de teste desativado
		if (nodeEnv === 'dev') {
			destinatario = smtpConfig.auth.user;
			logger.info(`[DEV] Email redirecionado para ${destinatario}`);
		}

		await transporter.sendMail({
			from: smtpConfig.from,
			to: destinatario,
			subject: assunto,
			text: corpo,
		});

		// Notificação de confirmação
		await runQuery(
			`INSERT INTO sys_notificacao (
              usuario_id, tipo_notificacao, status, destinatario, assunto, mensagem, enviado_em,
              erro_falha, contador_tentativas, maximo_tentativas, criado_em, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
			[
				chamado.usuario_id,
				'Chamado',
				'Enviado',
				chamado.email,
				'Chamado',
				corpo,
				getCurrentTimestamp(),
				'',
				0,
				3,
				getCurrentTimestamp(),
				getCurrentTimestamp()
			]
		);

		log.info(`Email de chamado enviado: ${assunto}`);
		return true;

	} catch (error: any) {
		log.error(`Erro ao enviar email de chamado: ${error.message}`);
		return false;
	}
}

export const chamadosController = {
	/**
	 * GET /chamados - Listar chamados
	 */
	listar: async (req: AuthRequest, res: Response) => {
		try {
			const { status, categoria, prioridade, busca, page = 1, limit = 10 } = req.query;
			const userId = req.user?.id;
			const userPerfilId = req.user?.adm_mindtax;

			let whereConditions = ['1=1'];
			const params: any[] = [];

			// Se não for ADMIN, filtrar apenas chamados do usuário
			if (!userPerfilId) {
				params.push(userId);
				whereConditions.push(`c.usuario_id = $${params.length}`);
			}

			// Filtros
			if (status) {
				params.push(status);
				whereConditions.push(`c.status = $${params.length}`);
			}

			if (categoria) {
				params.push(categoria);
				whereConditions.push(`c.categoria = $${params.length}`);
			}

			if (prioridade) {
				params.push(prioridade);
				whereConditions.push(`c.prioridade = $${params.length}`);
			}

			if (busca) {
				const buscaParam = `%${busca}%`;
				params.push(buscaParam);
				const p1 = params.length;
				params.push(buscaParam);
				const p2 = params.length;
				whereConditions.push(`(c.titulo LIKE $${p1} OR c.descricao LIKE $${p2})`);
			}

			const whereClause = whereConditions.join(' AND ');

			// Contar total
			const countSql = `
        SELECT COUNT(*) as total 
        from sys_chamado c
        WHERE ${whereClause}
      `;
			const countResult = await getOne<{ total: number }>(countSql, params);
			const total = countResult?.total || 0;

			// Query com paginação
			const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
			params.push(parseInt(limit as string));
			const limitIdx = params.length;
			params.push(offset);
			const offsetIdx = params.length;
			const sql = `
        SELECT 
          c.*,
          u.nome as usuario_nome,
          u.email as usuario_email,
          ua.nome as atribuido_nome
        from sys_chamado c
        INNER JOIN adm_usuarios u ON c.usuario_id = u.id
        LEFT JOIN adm_usuarios ua ON c.usuario_atribuido_id = ua.id
        WHERE ${whereClause}
        ORDER BY 
          CASE c.status
            WHEN 'Aberto' THEN 1
            WHEN 'Em Andamento' THEN 2
            WHEN 'Aguardando Resposta' THEN 3
            WHEN 'Resolvido' THEN 4
            WHEN 'Fechado' THEN 5
            WHEN 'Cancelado' THEN 6
          END,
          c.criado_em DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `;

			const data = await getAll<Chamado>(sql, params);

			res.json({ data, total, page: parseInt(page as string), limit: parseInt(limit as string) });
		} catch (error: any) {
			log.error(`Erro ao listar chamados: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * GET /chamados/:id - Buscar chamado por ID
	 */
	buscarPorId: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;
			const userId = req.user?.id;
			const userPerfilId = req.user?.adm_mindtax;

			const sql = `
        SELECT 
          c.*,
          u.nome as usuario_nome,
          u.email as usuario_email,
          ua.nome as atribuido_nome
        from sys_chamado c
        INNER JOIN adm_usuarios u ON c.usuario_id = u.id
        LEFT JOIN adm_usuarios ua ON c.usuario_id_atribuido = ua.id
        WHERE c.id = $1
      `;

			const chamado = await getOne<Chamado>(sql, [id]);

			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão: admin ou criador
			if (!userPerfilId && chamado.usuario_id !== userId) {
				return res.status(403).json({ error: 'Sem permissão para visualizar este chamado' });
			}

			res.json(chamado);
		} catch (error: any) {
			log.error(`Erro ao buscar chamado: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * POST /chamados - Criar chamado
	 */
	criar: async (req: AuthRequest, res: Response) => {
		try {
			const { titulo, descricao, categoria, prioridade } = req.body;
			const userId = req.user?.id;

			if (!titulo || !descricao || !categoria || !prioridade) {
				return res.status(400).json({ error: 'Campos obrigatórios faltando' });
			}

			const agora = getCurrentTimestamp();

			const sql = `
        INSERT INTO sys_chamado (
          usuario_id, titulo, descricao, categoria, prioridade, status,
          criado_em, atualizado_em
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id
      `;

			const result = await runQuery(sql, [
				userId,
				titulo,
				descricao,
				categoria,
				prioridade,
				'Aberto',
				agora,
				agora
			]);

			res.status(201).json({
				id: result.id,
				message: 'Chamado criado com sucesso'
			});
		} catch (error: any) {
			log.error(`Erro ao criar chamado: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * PUT /chamados/:id - Atualizar chamado
	 */
	atualizar: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;
			const { titulo, descricao, categoria, prioridade, status, usuario_id_atribuido } = req.body;
			const userId = req.user?.id;
			const userPerfilId = req.user?.adm_mindtax;

			// Buscar chamado atual
			const chamadoAtual = await getOne<Chamado>('SELECT * from sys_chamado WHERE id = $1', [id]);

			if (!chamadoAtual) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão: admin ou criador
			if (!userPerfilId && chamadoAtual.usuario_id !== userId) {
				return res.status(403).json({ error: 'Sem permissão para atualizar este chamado' });
			}

			const agora = getCurrentTimestamp();
			const updates: string[] = [];
			const params: any[] = [];

			if (titulo !== undefined) {
				params.push(titulo);
				updates.push(`titulo = $${params.length}`);
			}

			if (descricao !== undefined) {
				params.push(descricao);
				updates.push(`descricao = $${params.length}`);
			}

			if (categoria !== undefined) {
				params.push(categoria);
				updates.push(`categoria = $${params.length}`);
			}

			if (prioridade !== undefined) {
				params.push(prioridade);
				updates.push(`prioridade = $${params.length}`);
			}

			if (status !== undefined) {
				params.push(status);
				updates.push(`status = $${params.length}`);

				// Se foi resolvido ou fechado, atualizar data
				if (status === 'Resolvido' || status === 'Fechado') {
					params.push(agora);
					updates.push(`fechado_em = $${params.length}`);
				}
			}

			if (usuario_id_atribuido !== undefined) {
				params.push(usuario_id_atribuido);
				updates.push(`usuario_atribuido_id = $${params.length}`);
			}

			params.push(agora);
			updates.push(`atualizado_em = $${params.length}`);

			params.push(id);
			const idIdx = params.length;

			const sql = `UPDATE sys_chamado SET ${updates.join(', ')} WHERE id = $${idIdx}`;
			await runQuery(sql, params);

			// Enviar email se status mudou e é admin mudando
			if (status !== undefined && status !== chamadoAtual.status && userPerfilId) {
				await enviarEmailNotificacaoChamado(
					parseInt(id),
					'mudanca_status',
					{ novoStatus: status }
				);
			}

			res.json({ message: 'Chamado atualizado com sucesso' });
		} catch (error: any) {
			log.error(`Erro ao atualizar chamado: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * DELETE /chamados/:id - Deletar chamado
	 */
	deletar: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;
			const userId = req.user?.id;
			const userPerfilId = req.user?.adm_mindtax;

			// Buscar chamado
			const chamado = await getOne<Chamado>('SELECT * from sys_chamado WHERE id = $1', [id]);

			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão: admin ou criador
			if (!userPerfilId && chamado.usuario_id !== userId) {
				return res.status(403).json({ error: 'Sem permissão para deletar este chamado' });
			}

			// Deletar comentários e anexos associados
			await runQuery('DELETE from sys_chamados_anexos WHERE chamado_comentario_id IN (SELECT id from sys_chamado_comentario WHERE chamado_id = $1)', [id]);
			await runQuery('DELETE from sys_chamado_comentario WHERE chamado_id = $1', [id]);
			await runQuery('DELETE from sys_chamado WHERE id = $1', [id]);

			res.json({ message: 'Chamado deletado com sucesso' });
		} catch (error: any) {
			log.error(`Erro ao deletar chamado: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * GET /chamados/:id/comentarios - Listar comentários de um chamado
	 */
	listarComentarios: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;
			const userId = req.user?.id;
			const userPerfilId = req.user?.adm_mindtax;

			// Verificar se usuário tem permissão para ver este chamado
			const chamado = await getOne<Chamado>('SELECT * from sys_chamado WHERE id = $1', [id]);
			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			if (!userPerfilId && chamado.usuario_id !== userId) {
				return res.status(403).json({ error: 'Sem permissão' });
			}

			// Buscar comentários com anexos
			const comentariosSql = `
        SELECT 
          cc.id,
          cc.chamado_id,
          cc.usuario_id,
          cc.comentario,
          cc.criado_em,
          u.nome as usuario_nome,
          u.email as usuario_email
        from sys_chamado_comentario cc
        INNER JOIN adm_usuarios u ON cc.usuario_id = u.id
        WHERE cc.chamado_id = $1
        ORDER BY cc.criado_em ASC
      `;

			const comentarios = await getAll<ChamadoComentario>(comentariosSql, [id]);

			// Buscar anexos de cada comentário
			for (const comentario of comentarios) {
				const anexosSql = `
          SELECT id, chamado_comentario_id, nome_arquivo, tipo_arquivo, tamanho_bytes,
                 anexo_thumbnail, anexo
          from sys_chamados_anexos
          WHERE chamado_comentario_id = $1
          ORDER BY id ASC
        `;
				const anexosRaw = await getAll<any>(anexosSql, [comentario.id]);
				// Converter buffers para base64, igual ao padrão do MeuPerfil
				comentario.anexos = anexosRaw.map((a) => ({
					id: a.id,
					chamado_comentario_id: a.chamado_comentario_id,
					nome_arquivo: a.nome_arquivo,
					tipo_arquivo: a.tipo_arquivo,
					tamanho_bytes: a.tamanho_bytes,
					thumbnail_base64: a.anexo_thumbnail ? Buffer.from(a.anexo_thumbnail).toString('base64') : null,
					preview_base64: a.anexo ? Buffer.from(a.anexo).toString('base64') : null,
				}));
			}

			res.json(comentarios);
		} catch (error: any) {
			log.error(`Erro ao listar comentários: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * POST /chamados/:id/comentarios - Criar comentário
	 */
	criarComentario: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;
			const { comentario } = req.body;
			const userId = req.user?.id;
			const userPerfilId = req.user?.adm_mindtax;

			if (!comentario || !comentario.trim()) {
				return res.status(400).json({ error: 'Comentário é obrigatório' });
			}

			// Verificar se chamado existe
			const chamado = await getOne<Chamado>('SELECT * from sys_chamado WHERE id = $1', [id]);
			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão
			if (!userPerfilId && chamado.usuario_id !== userId) {
				return res.status(403).json({ error: 'Sem permissão' });
			}

			const agora = getCurrentTimestamp();

			const sql = `
        INSERT INTO sys_chamado_comentario (chamado_id, usuario_id, comentario, criado_em)
        VALUES ($1, $2, $3, $4)
        RETURNING id
      `;

			const txClient = await beginTransaction();
			let commentId: number;
			try {
				const result = await runQuery(sql, [id, userId, comentario, agora], txClient);
				commentId = result.id;
				// Atualizar data de atualização do chamado
				await runQuery('UPDATE sys_chamado SET atualizado_em = $1 WHERE id = $2', [agora, id], txClient);
				await commitTransaction(txClient);
			} catch (txErr) {
				await rollbackTransaction(txClient);
				throw txErr;
			}

			// Enviar email se for admin comentando
			if (userPerfilId && chamado.usuario_id !== userId) {
				await enviarEmailNotificacaoChamado(
					parseInt(id),
					'novo_comentario',
					{ comentario }
				);
			}

			res.status(201).json({
				id: commentId!,
				message: 'Comentário adicionado com sucesso'
			});
		} catch (error: any) {
			log.error(`Erro ao criar comentário: ${error.message}`);
			res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * POST /chamados/comentarios/:idComentario/anexos - Upload de anexos
	 */
	uploadAnexos: async (req: AuthRequest, res: Response) => {
		try {
			const { idComentario } = req.body;
			const userId = req.user?.id;
			const files = req.files as Express.Multer.File[];

			if (!userId) {
				return res.status(401).json({ error: 'Não autorizado' });
			}

			if (!idComentario) {
				return res.status(400).json({ error: 'ID do comentário é obrigatório' });
			}

			if (!files || !Array.isArray(files) || files.length === 0) {
				return res.status(400).json({ error: 'Nenhum arquivo enviado' });
			}

			if (files.length > MAX_FILES_PER_COMMENT) {
				return res.status(400).json({ error: `Máximo de ${MAX_FILES_PER_COMMENT} arquivos por comentário` });
			}

			// Verificar se comentário existe
			const comentario = await getOne<ChamadoComentario>(
				'SELECT * from sys_chamado_comentario WHERE id = $1',
				[idComentario]
			);

			if (!comentario) {
				return res.status(404).json({ error: 'Comentário não encontrado' });
			}

			const results = [];
			const errors = [];

			// Processar cada arquivo
			for (const file of files) {
				try {
					// Validar tamanho
					if (file.size > MAX_FILE_SIZE) {
						errors.push({
							file: file.originalname,
							error: `Arquivo muito grande (máx ${formatBytes(MAX_FILE_SIZE)})`
						});
						continue;
					}

					// Detectar tipo MIME real do arquivo
					const { fileTypeFromBuffer } = await import('file-type');
					const fileType = await fileTypeFromBuffer(file.buffer);
					const mimeType = fileType?.mime || file.mimetype;

					// Validar tipo de arquivo
					if (!ALLOWED_MIME_TYPES[mimeType]) {
						errors.push({
							file: file.originalname,
							error: 'Tipo de arquivo não permitido'
						});
						continue;
					}

					let preview: Buffer;
					let thumbnail: Buffer | null = null;

					// Processar imagem com Sharp
					if (isImage(mimeType)) {
						const processed = await processImage(file.buffer, mimeType);

						if (processed) {
							preview = processed.preview;      // 800x600, quality 90%
							thumbnail = processed.thumbnail;  // 200x200, quality 85%
						} else {
							// Fallback se processamento falhar
							preview = file.buffer;
						}
					} else {
						// Não é imagem (PDF, DOC, etc) - armazenar original
						preview = file.buffer;
						// Thumbnail fica null para não-imagens
					}

					// Inserir no banco
					const sql = `
            INSERT INTO sys_chamados_anexos (
              chamado_comentario_id,
              anexo,
              anexo_thumbnail,
              nome_arquivo,
              tipo_arquivo,
              tamanho_bytes
            ) VALUES ($1, $2, $3, $4, $5, $6)
          `;

					await runQuery(sql, [
						idComentario,
						preview,
						thumbnail,
						file.originalname,
						mimeType,
						file.size
					]);

					results.push({
						filename: file.originalname,
						size: file.size,
						type: mimeType,
						processed: isImage(mimeType)
					});

				} catch (error: any) {
					log.error(`Erro ao processar arquivo ${file.originalname}: ${error.message}`);
					errors.push({
						file: file.originalname,
						error: error instanceof Error ? error.message : 'Erro desconhecido'
					});
				}
			}

			// Retornar resultado
			if (results.length === 0 && errors.length > 0) {
				return res.status(400).json({
					error: 'Nenhum arquivo foi processado com sucesso',
					errors
				});
			}

			return res.status(201).json({
				message: `${results.length} arquivo(s) enviado(s) com sucesso`,
				results,
				errors: errors.length > 0 ? errors : undefined
			});

		} catch (error: any) {
			log.error(`Erro ao fazer upload de anexos: ${error.message}`);
			return res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * GET /chamados/anexos/:id - Buscar anexo (thumbnail ou preview)
	 */
	getAnexo: async (req: AuthRequest, res: Response) => {
		try {
			const { id } = req.params;
			const { version } = req.query; // 'thumbnail' ou 'preview'
			const userId = req.user?.id;

			const anexo = await getOne<any>(
				'SELECT * from sys_chamados_anexos WHERE id = $1',
				[id]
			);

			if (!anexo) {
				return res.status(404).json({ error: 'Anexo não encontrado' });
			}

			// Selecionar versão correta
			let buffer: Buffer;
			let filename: string;

			if (version === 'thumbnail' && anexo.anexo_thumbnail) {
				buffer = anexo.anexo_thumbnail;
				filename = `thumb_${anexo.nome_arquivo || 'anexo.jpg'}`;
			} else {
				buffer = anexo.anexo;
				filename = anexo.nome_arquivo || 'anexo.bin';
			}

			// Definir headers
			res.setHeader('Content-Type', anexo.tipo_arquivo || 'application/octet-stream');
			res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
			res.setHeader('Cache-Control', 'public, max-age=86400'); // 24 horas
			res.send(buffer);

		} catch (error: any) {
			log.error(`Erro ao buscar anexo: ${error.message}`);
			return res.status(500).json({ error: 'Erro interno do servidor' });
		}
	},

	/**
	 * GET /chamados/admin/dashboard - Dashboard para administradores
	 */
	dashboardAdmin: async (req: AuthRequest, res: Response) => {
		try {
			const userPerfilId = req.user?.adm_mindtax;

			// Verificar se é admin
			if (!userPerfilId) {
				return res.status(403).json({ error: 'Acesso negado' });
			}

			// 1. Estatísticas gerais
			const estatisticas = await getOne<any>(`
        SELECT 
          COUNT(*) as total_chamados,
          SUM(CASE WHEN status = 'Aberto' THEN 1 ELSE 0 END) as abertos,
          SUM(CASE WHEN status = 'Em Andamento' THEN 1 ELSE 0 END) as em_andamento,
          SUM(CASE WHEN status = 'Resolvido' THEN 1 ELSE 0 END) as resolvidos,
          SUM(CASE WHEN status = 'Fechado' THEN 1 ELSE 0 END) as fechados,
          AVG(
            CASE 
              WHEN status IN ('Resolvido', 'Fechado') AND fechado_em IS NOT NULL
              THEN EXTRACT(EPOCH FROM (fechado_em::timestamp - criado_em::timestamp)) / 3600
            END
          ) as tempo_medio_resolucao_horas,
          SUM(CASE WHEN criado_em::date = CURRENT_DATE THEN 1 ELSE 0 END) as criados_hoje,
          SUM(CASE WHEN fechado_em::date = CURRENT_DATE THEN 1 ELSE 0 END) as resolvidos_hoje
        from sys_chamado
        WHERE criado_em >= CURRENT_DATE - INTERVAL '30 days'
      `);

			// 2. Por status
			const porStatus = await getAll<any>(`
        SELECT status, COUNT(*) as total
        from sys_chamado
        WHERE criado_em >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY status
      `);

			// 3. Por categoria
			const porCategoria = await getAll<any>(`
        SELECT categoria, COUNT(*) as total
        from sys_chamado
        WHERE criado_em >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY categoria
        ORDER BY total DESC
      `);

			// 4. Top usuários
			const topUsuarios = await getAll<any>(`
        SELECT 
          u.nome,
          u.email,
          COUNT(c.id) as total_chamados,
          SUM(CASE WHEN c.status = 'Aberto' THEN 1 ELSE 0 END) as abertos,
          SUM(CASE WHEN c.status IN ('Resolvido', 'Fechado') THEN 1 ELSE 0 END) as resolvidos
        from sys_chamado c
        INNER JOIN adm_usuarios u ON c.usuario_id = u.id
        WHERE c.criado_em >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY u.id, u.nome, u.email
        ORDER BY total_chamados DESC
        LIMIT 10
      `);

			res.json({
				estatisticas: estatisticas || {},
				por_status: porStatus || [],
				por_categoria: porCategoria || [],
				top_usuarios: topUsuarios || []
			});

		} catch (error: any) {
			log.error(`Erro ao buscar dashboard de chamados: ${error.message}`);
			res.status(500).json({ error: 'Erro ao buscar dashboard' });
		}
	},

	/**
	 * GET /chamados/minhas-estatisticas - Estatísticas do usuário logado
	 */
	minhasEstatisticas: async (req: AuthRequest, res: Response) => {
		try {
			const userId = req.user?.id;

			const estatisticas = await getOne<any>(`
        SELECT 
          COUNT(*) as total_chamados,
          SUM(CASE WHEN status = 'Aberto' THEN 1 ELSE 0 END) as abertos,
          SUM(CASE WHEN status = 'Em Andamento' THEN 1 ELSE 0 END) as em_andamento,
          SUM(CASE WHEN status = 'Resolvido' THEN 1 ELSE 0 END) as resolvidos,
          SUM(CASE WHEN status = 'Fechado' THEN 1 ELSE 0 END) as fechados
        from sys_chamado
        WHERE usuario_id = $1
      `, [userId]);

			res.json(estatisticas || {});

		} catch (error: any) {
			log.error(`Erro ao buscar estatísticas: ${error.message}`);
			res.status(500).json({ error: 'Erro ao buscar estatísticas' });
		}
	},
};
