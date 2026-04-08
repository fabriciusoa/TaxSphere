import { Response } from 'express';
import { getOne, getAll, runQuery } from '../database/connection';
import { AuthRequest, Chamado, ChamadoComentario, ChamadoAnexo, StatusChamado, CategoriaChamado, PrioridadeChamado, ALLOWED_MIME_TYPES, MAX_FILE_SIZE, MAX_FILES_PER_COMMENT } from '../types';
import { getCurrentTimestamp, formatToBrazilian } from '../utils/dateHelpers';
import { processImage, isImage, formatBytes } from '../utils/imageProcessor';
import { fileTypeFromBuffer } from 'file-type';
import { getSMTPConfig, getBaseUrl, getParametro } from '../utils/parametrosHelper';
import nodemailer from 'nodemailer';
import { log } from '../utils/logger';

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
      FROM chamado c
      INNER JOIN usuarios u ON c.id_usuario = u.id
      WHERE c.id = ?
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
		// Modo DEV: redirecionar para email de teste
		// desativado
		//if (nodeEnv === 'dev') {
		//	destinatario = smtpConfig.auth.user;
		//	cronLogger.info(`[DEV] Email redirecionado para ${destinatario}`);
		//}

		await transporter.sendMail({
			from: smtpConfig.from,
			to: destinatario,
			subject: assunto,
			text: corpo,
		});

		// Notificação de confirmação
		await runQuery(
			`INSERT INTO notificacao (
              id_usuario, tipo_notificacao, status, destinatario, assunto, mensagem, enviado_em,
              entregue_em, erro_falha, contador_tentativas, maximo_tentativas, criado_em,
              atualizado_em, tipo, id_externo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				chamado.id_usuario,
				'Chamado',
				'Enviado',
				chamado.email,
				'Chamado',
				corpo,
				getCurrentTimestamp(),
				getCurrentTimestamp(),
				'',
				0,
				3,
				getCurrentTimestamp(),
				getCurrentTimestamp(),
				'EMAIL',
				chamado.id
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
			const userPerfilId = req.user?.perfil_id;

			let whereConditions = ['1=1'];
			const params: any[] = [];

			// Se não for ADMIN, filtrar apenas chamados do usuário
			if (userPerfilId !== 1) {
				whereConditions.push('c.id_usuario = ?');
				params.push(userId);
			}

			// Filtros
			if (status) {
				whereConditions.push('c.status = ?');
				params.push(status);
			}

			if (categoria) {
				whereConditions.push('c.categoria = ?');
				params.push(categoria);
			}

			if (prioridade) {
				whereConditions.push('c.prioridade = ?');
				params.push(prioridade);
			}

			if (busca) {
				whereConditions.push('(c.titulo LIKE ? OR c.descricao LIKE ?)');
				const buscaParam = `%${busca}%`;
				params.push(buscaParam, buscaParam);
			}

			const whereClause = whereConditions.join(' AND ');

			// Contar total
			const countSql = `
        SELECT COUNT(*) as total 
        FROM chamado c
        WHERE ${whereClause}
      `;
			const countResult = await getOne<{ total: number }>(countSql, params);
			const total = countResult?.total || 0;

			// Query com paginação
			const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
			const sql = `
        SELECT 
          c.*,
          u.nome as usuario_nome,
          u.email as usuario_email,
          ua.nome as atribuido_nome
        FROM chamado c
        INNER JOIN usuarios u ON c.id_usuario = u.id
        LEFT JOIN usuarios ua ON c.id_usuario_atribuido = ua.id
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
        LIMIT ? OFFSET ?
      `;

			params.push(parseInt(limit as string), offset);
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
			const userPerfilId = req.user?.perfil_id;

			const sql = `
        SELECT 
          c.*,
          u.nome as usuario_nome,
          u.email as usuario_email,
          ua.nome as atribuido_nome
        FROM chamado c
        INNER JOIN usuarios u ON c.id_usuario = u.id
        LEFT JOIN usuarios ua ON c.id_usuario_atribuido = ua.id
        WHERE c.id = ?
      `;

			const chamado = await getOne<Chamado>(sql, [id]);

			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão: admin ou criador
			if (userPerfilId !== 1 && chamado.id_usuario !== userId) {
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
        INSERT INTO chamado (
          id_usuario, titulo, descricao, categoria, prioridade, status,
          criado_em, atualizado_em
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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
				id: result.lastID,
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
			const { titulo, descricao, categoria, prioridade, status, id_usuario_atribuido } = req.body;
			const userId = req.user?.id;
			const userPerfilId = req.user?.perfil_id;

			// Buscar chamado atual
			const chamadoAtual = await getOne<Chamado>('SELECT * FROM chamado WHERE id = ?', [id]);

			if (!chamadoAtual) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão: admin ou criador
			if (userPerfilId !== 1 && chamadoAtual.id_usuario !== userId) {
				return res.status(403).json({ error: 'Sem permissão para atualizar este chamado' });
			}

			const agora = getCurrentTimestamp();
			const updates: string[] = [];
			const params: any[] = [];

			if (titulo !== undefined) {
				updates.push('titulo = ?');
				params.push(titulo);
			}

			if (descricao !== undefined) {
				updates.push('descricao = ?');
				params.push(descricao);
			}

			if (categoria !== undefined) {
				updates.push('categoria = ?');
				params.push(categoria);
			}

			if (prioridade !== undefined) {
				updates.push('prioridade = ?');
				params.push(prioridade);
			}

			if (status !== undefined) {
				updates.push('status = ?');
				params.push(status);

				// Se foi resolvido ou fechado, atualizar data
				if (status === 'Resolvido' || status === 'Fechado') {
					updates.push('fechado_em = ?');
					params.push(agora);
				}
			}

			if (id_usuario_atribuido !== undefined) {
				updates.push('id_usuario_atribuido = ?');
				params.push(id_usuario_atribuido);
			}

			updates.push('atualizado_em = ?');
			params.push(agora);

			params.push(id);

			const sql = `UPDATE chamado SET ${updates.join(', ')} WHERE id = ?`;
			await runQuery(sql, params);

			// Enviar email se status mudou e é admin mudando
			if (status !== undefined && status !== chamadoAtual.status && userPerfilId === 1) {
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
			const userPerfilId = req.user?.perfil_id;

			// Buscar chamado
			const chamado = await getOne<Chamado>('SELECT * FROM chamado WHERE id = ?', [id]);

			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão: admin ou criador
			if (userPerfilId !== 1 && chamado.id_usuario !== userId) {
				return res.status(403).json({ error: 'Sem permissão para deletar este chamado' });
			}

			// Deletar comentários e anexos associados
			await runQuery('DELETE FROM chamados_anexos WHERE id_chamado_comentario IN (SELECT id FROM chamado_comentario WHERE id_chamado = ?)', [id]);
			await runQuery('DELETE FROM chamado_comentario WHERE id_chamado = ?', [id]);
			await runQuery('DELETE FROM chamado WHERE id = ?', [id]);

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
			const userPerfilId = req.user?.perfil_id;

			// Verificar se usuário tem permissão para ver este chamado
			const chamado = await getOne<Chamado>('SELECT * FROM chamado WHERE id = ?', [id]);
			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			if (userPerfilId !== 1 && chamado.id_usuario !== userId) {
				return res.status(403).json({ error: 'Sem permissão' });
			}

			// Buscar comentários com anexos
			const comentariosSql = `
        SELECT 
          cc.id,
          cc.id_chamado,
          cc.id_usuario,
          cc.comentario,
          cc.criado_em,
          u.nome as usuario_nome,
          u.email as usuario_email
        FROM chamado_comentario cc
        INNER JOIN usuarios u ON cc.id_usuario = u.id
        WHERE cc.id_chamado = ?
        ORDER BY cc.criado_em ASC
      `;

			const comentarios = await getAll<ChamadoComentario>(comentariosSql, [id]);

			// Buscar anexos de cada comentário
			for (const comentario of comentarios) {
				const anexosSql = `
          SELECT id, id_chamado_comentario, nome_arquivo, tipo_arquivo, tamanho_bytes,
                 anexo_thumbnail, anexo
          FROM chamados_anexos
          WHERE id_chamado_comentario = ?
          ORDER BY id ASC
        `;
				const anexosRaw = await getAll<any>(anexosSql, [comentario.id]);
				// Converter buffers para base64, igual ao padrão do MeuPerfil
				comentario.anexos = anexosRaw.map((a) => ({
					id: a.id,
					id_chamado_comentario: a.id_chamado_comentario,
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
			const userPerfilId = req.user?.perfil_id;

			if (!comentario || !comentario.trim()) {
				return res.status(400).json({ error: 'Comentário é obrigatório' });
			}

			// Verificar se chamado existe
			const chamado = await getOne<Chamado>('SELECT * FROM chamado WHERE id = ?', [id]);
			if (!chamado) {
				return res.status(404).json({ error: 'Chamado não encontrado' });
			}

			// Verificar permissão
			if (userPerfilId !== 1 && chamado.id_usuario !== userId) {
				return res.status(403).json({ error: 'Sem permissão' });
			}

			const agora = getCurrentTimestamp();

			const sql = `
        INSERT INTO chamado_comentario (id_chamado, id_usuario, comentario, criado_em)
        VALUES (?, ?, ?, ?)
      `;

			const result = await runQuery(sql, [id, userId, comentario, agora]);

			// Atualizar data de atualização do chamado
			await runQuery('UPDATE chamado SET atualizado_em = ? WHERE id = ?', [agora, id]);

			// Enviar email se for admin comentando
			if (userPerfilId === 1 && chamado.id_usuario !== userId) {
				await enviarEmailNotificacaoChamado(
					parseInt(id),
					'novo_comentario',
					{ comentario }
				);
			}

			res.status(201).json({
				id: result.lastID,
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
				'SELECT * FROM chamado_comentario WHERE id = ?',
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
            INSERT INTO chamados_anexos (
              id_chamado_comentario,
              anexo,
              anexo_thumbnail,
              nome_arquivo,
              tipo_arquivo,
              tamanho_bytes
            ) VALUES (?, ?, ?, ?, ?, ?)
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
				'SELECT * FROM chamados_anexos WHERE id = ?',
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
			const userPerfilId = req.user?.perfil_id;

			// Verificar se é admin
			if (userPerfilId !== 1) {
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
              THEN CAST((julianday(fechado_em) - julianday(criado_em)) * 24 AS INTEGER)
            END
          ) as tempo_medio_resolucao_horas,
          SUM(CASE WHEN date(criado_em) = date('now') THEN 1 ELSE 0 END) as criados_hoje,
          SUM(CASE WHEN date(fechado_em) = date('now') THEN 1 ELSE 0 END) as resolvidos_hoje
        FROM chamado
        WHERE criado_em >= date('now', '-30 days')
      `);

			// 2. Por status
			const porStatus = await getAll<any>(`
        SELECT status, COUNT(*) as total
        FROM chamado
        WHERE criado_em >= date('now', '-30 days')
        GROUP BY status
      `);

			// 3. Por categoria
			const porCategoria = await getAll<any>(`
        SELECT categoria, COUNT(*) as total
        FROM chamado
        WHERE criado_em >= date('now', '-30 days')
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
        FROM chamado c
        INNER JOIN usuarios u ON c.id_usuario = u.id
        WHERE c.criado_em >= date('now', '-30 days')
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
        FROM chamado
        WHERE id_usuario = ?
      `, [userId]);

			res.json(estatisticas || {});

		} catch (error: any) {
			log.error(`Erro ao buscar estatísticas: ${error.message}`);
			res.status(500).json({ error: 'Erro ao buscar estatísticas' });
		}
	},
};
