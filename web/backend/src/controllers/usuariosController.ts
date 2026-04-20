import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { getOne, getAll, runQuery } from '../database/connection';
import { Usuario, AuthRequest } from '../types';
import { criarUsuarioSchema, atualizarUsuarioSchema } from '../validators/schemas';
import { getCurrentTimestamp, formatToBrazilian } from '../utils/dateHelpers';
import { log } from '../utils/logger';

export const usuariosController = {
  // Listar todos os usuários
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { busca, data_criacao_inicio, data_criacao_fim, cliente_id, page = 1, limit = 10 } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      let sql = `
        SELECT u.*
        FROM adm_usuarios u
        WHERE 1=1
      `;
      const params: any[] = [];

      if (busca) {
        params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
        const n = params.length;
        sql += ` AND (LOWER(u.nome) LIKE LOWER($${n - 2}) OR LOWER(u.email) LIKE LOWER($${n - 1}) OR u.cpf LIKE $${n})`;
      }

      // Filtro por data de criação
      if (data_criacao_inicio) {
        params.push(data_criacao_inicio);
        sql += ` AND DATE(u.criado) >= DATE($${params.length})`;
      }
      if (data_criacao_fim) {
        params.push(data_criacao_fim);
        sql += ` AND DATE(u.criado) <= DATE($${params.length})`;
      }
      if (cliente_id && cliente_id !== '0') {
        params.push(cliente_id);
        sql += ` AND u.cliente_id = $${params.length}`;
      }
      // Query para contar total
      const countSql = `SELECT COUNT(*) as total FROM (${sql}) as subquery`;
      const countResult = await getOne<{ total: number }>(countSql, params);
      const totalRecords = countResult?.total || 0;

      params.push(Number(limit), offset);
      const pagLen = params.length;
      sql += ` ORDER BY u.nome LIMIT $${pagLen - 1} OFFSET $${pagLen}`;

      const usuarios = await getAll<any>(sql, params);

      // Formatar datas para brasileiro
      const usuariosFormatados = usuarios.map((u) => ({
        id: u.id,
        email: u.email,
        cpf: u.cpf,
        nome: u.nome,
        criado: (u.criado),
        dt_inativacao: (u.dt_inativacao),
        dt_nascimento: (u.dt_nascimento),
        dt_ativacao: (u.dt_ativacao),
        ultimo_login: (u.ultimo_login),
        tentativas_login: u.tentativas_login,
        dt_bloqueio: (u.dt_bloqueio),
        cliente_id: u.cliente_id,
        status: u.status
      }));

      res.json({
        data: usuariosFormatados,
        totalRecords,
        page: Number(page),
        limit: Number(limit),
      });
    } catch (error: any) {
      log.error(`Erro ao listar usuários: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar usuário por ID
  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const usuario = await getOne<any>(
        `SELECT u.*
         FROM adm_usuarios u
         WHERE u.id = $1`,
        [id]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Remover senha e formatar datas
      const usuarioFormatado = {
        id: usuario.id,
        email: usuario.email,
        cpf: usuario.cpf,
        nome: usuario.nome,
        criado: formatToBrazilian(usuario.criado),
        dt_inativacao: formatToBrazilian(usuario.dt_inativacao),
        dt_nascimento: formatToBrazilian(usuario.dt_nascimento),
        dt_ativacao: formatToBrazilian(usuario.dt_ativacao),
        ultimo_login: formatToBrazilian(usuario.ultimo_login),
        tentativas_login: usuario.tentativas_login,
        dt_bloqueio: formatToBrazilian(usuario.dt_bloqueio),
        cliente_id: usuario.cliente_id,
        status: usuario.status
      };

      res.json(usuarioFormatado);
    } catch (error: any) {
      log.error(`Erro ao buscar usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar novo usuário
  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = criarUsuarioSchema.safeParse(req.body);
      if (!resultado.success) {
        return res.status(400).json({ errors: resultado.error.errors });
      }

      const { nome, email, cpf, senha, dt_nascimento } = resultado.data;

      // Verificar se email já existe
      const emailExiste = await getOne<Usuario>(
        'SELECT * FROM adm_usuarios WHERE email = $1',
        [email]
      );
      if (emailExiste) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      // Verificar se CPF já existe
      const cpfExiste = await getOne<Usuario>(
        'SELECT * FROM adm_usuarios WHERE cpf = $1',
        [cpf]
      );
      if (cpfExiste) {
        return res.status(400).json({ error: 'CPF já cadastrado' });
      }

      // Hash da senha
      const senhaHash = await bcrypt.hash(senha, 10);

      // Inserir usuário
      const agora = getCurrentTimestamp();
      await runQuery(
        `INSERT INTO adm_usuarios (nome, email, cpf, senha, dt_nascimento, cliente_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [nome, email, cpf, senhaHash, dt_nascimento, 0]
      );

      // Buscar usuário criado
      const usuarioCriado = await getOne<any>(
        `SELECT u.*
         FROM adm_usuarios u
         WHERE u.email = $1`,
        [email]
      );

      res.status(201).json({
        id: usuarioCriado.id,
        email: usuarioCriado.email,
        cpf: usuarioCriado.cpf,
        nome: usuarioCriado.nome,
        criado: formatToBrazilian(usuarioCriado.criado),
        dt_inativacao: formatToBrazilian(usuarioCriado.dt_inativacao),
        dt_nascimento: formatToBrazilian(usuarioCriado.dt_nascimento),
        dt_ativacao: formatToBrazilian(usuarioCriado.dt_ativacao),
        ultimo_login: formatToBrazilian(usuarioCriado.ultimo_login),
        tentativas_login: usuarioCriado.tentativas_login,
        dt_bloqueio: formatToBrazilian(usuarioCriado.dt_bloqueio),
        cliente_id: usuarioCriado.cliente_id,
        status: usuarioCriado.status
      });
    } catch (error: any) {
      log.error(`Erro ao criar usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar usuário
  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const resultado = atualizarUsuarioSchema.safeParse(req.body);
      if (!resultado.success) {
        log.error(`Erro ao atualizar usuário: ${resultado.error.errors.map(e => e.message).join(', ')}`);
        return res.status(400).json({ errors: resultado.error.errors });
      }

      // Verificar se usuário existe
      const usuario = await getOne<Usuario>('SELECT * FROM adm_usuarios WHERE id = $1', [id]);
      if (!usuario) {
        log.error(`Erro ao atualizar usuário: Usuário não encontrado`);
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const campos: string[] = [];
      const valores: any[] = [];

      if (resultado.data.nome && resultado.data.nome !== usuario.nome) {
        valores.push(resultado.data.nome);
        campos.push(`nome = $${valores.length}`);
      }
      if (resultado.data.senha) {
        const senhaHash = await bcrypt.hash(resultado.data.senha, 10);
        valores.push(senhaHash);
        campos.push(`senha = $${valores.length}`);
      }
      if (resultado.data.email && resultado.data.email !== usuario.email) {
        // Verificar se email já existe em outro usuário
        const emailExiste = await getOne<Usuario>(
          'SELECT * FROM adm_usuarios WHERE email = $1 AND id != $2',
          [resultado.data.email, id]
        );
        if (emailExiste) {
          log.error(`Erro ao atualizar usuário: Email já cadastrado`);
          return res.status(400).json({ error: 'Email já cadastrado' });
        }
        valores.push(resultado.data.email);
        campos.push(`email = $${valores.length}`);
      }
      if (resultado.data.cpf && resultado.data.cpf !== usuario.cpf) {
        // Verificar se CPF já existe em outro usuário
        const cpfExiste = await getOne<Usuario>(
          'SELECT * FROM adm_usuarios WHERE cpf = $1 AND id != $2',
          [resultado.data.cpf, id]
        );
        if (cpfExiste) {
          log.error(`Erro ao atualizar usuário: CPF já cadastrado`);
          return res.status(400).json({ error: 'CPF já cadastrado' });
        }
        valores.push(resultado.data.cpf);
        campos.push(`cpf = $${valores.length}`);
      }
      if (resultado.data.status !== undefined && resultado.data.status !== usuario.status) {
        valores.push(resultado.data.status);
        campos.push(`status = $${valores.length}`);

        if (!resultado.data.status) {
          valores.push(getCurrentTimestamp());
          campos.push(`dt_inativacao = $${valores.length}`);
        } else if (resultado.data.status) {
          valores.push(null);
          campos.push(`dt_inativacao = $${valores.length}`);
          valores.push(getCurrentTimestamp());
          campos.push(`dt_ativacao = $${valores.length}`);
        }
      }

      if (resultado.data.dt_nascimento !== undefined && resultado.data.dt_nascimento !== usuario.dt_nascimento) {
        valores.push(resultado.data.dt_nascimento);
        campos.push(`dt_nascimento = $${valores.length}`);
      }

      if (campos.length === 0) {
        log.error(`Erro ao atualizar usuário: Nenhum campo para atualizar`);
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      valores.push(id);
      await runQuery(
        `UPDATE adm_usuarios SET ${campos.join(', ')} WHERE id = $${valores.length}`,
        valores
      );

      // Buscar usuário atualizado
      const usuarioAtualizado = await getOne<any>(
        `SELECT u.*
         FROM adm_usuarios u
         WHERE u.id = $1`,
        [id]
      );

      res.json({
        id: usuarioAtualizado.id,
        nome: usuarioAtualizado.nome,
        email: usuarioAtualizado.email,
        cpf: usuarioAtualizado.cpf,
        status: usuarioAtualizado.status,
        criado: formatToBrazilian(usuarioAtualizado.criado),
        dt_inativacao: formatToBrazilian(usuarioAtualizado.dt_inativacao),
        dt_nascimento: usuarioAtualizado.dt_nascimento
      });
    } catch (error: any) {
      log.error(`Erro ao atualizar usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Desbloquear usuário
  desbloquear: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const usuario = await getOne<Usuario>('SELECT * FROM adm_usuarios WHERE id = $1', [id]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      await runQuery(
        'UPDATE adm_usuarios SET tentativas_login = 0, dt_bloqueio = NULL WHERE id = $1',
        [id]
      );

      res.json({ message: 'Usuário desbloqueado com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao desbloquear usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Inativar usuário (soft delete)
  inativar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const usuario = await getOne<Usuario>('SELECT * FROM adm_usuarios WHERE id = $1', [id]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      await runQuery(
        'UPDATE adm_usuarios SET status = $1, dt_inativacao = $2 WHERE id = $3',
        [false, getCurrentTimestamp(), id]
      );

      res.json({ message: 'Usuário inativado com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao inativar usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // =======================
  // Perfil do Usuário Logado
  // =======================
  // Buscar dados do perfil do usuário logado
  buscarMeuPerfil: async (req: AuthRequest, res: Response) => {

    try {
      const userId = req.user?.id;

      const usuario = await getOne<any>(
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento
         FROM adm_usuarios u
         WHERE u.id = $1`,
        [userId]
      );

      if (!usuario) {
        log.error(`Erro ao buscar perfil: Usuário não encontrado`);
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json(usuario);
    } catch (error: any) {
      log.error(`Erro ao buscar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
  // Atualizar dados do perfil do usuário logado
  atualizarMeuPerfil: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { nome, email, cpf, dt_nascimento } = req.body;

      await runQuery(
        `UPDATE adm_usuarios SET nome = $1, email = $2, cpf = $3, dt_nascimento = $4 WHERE id = $5`,
        [nome, email, cpf, dt_nascimento, userId]
      );

      const usuario = await getOne<any>(
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento
         FROM adm_usuarios u
         WHERE u.id = $1`,
        [userId]
      );

      res.json({
        message: 'Perfil atualizado com sucesso',
        usuario
      });
    } catch (error: any) {
      log.error(`Erro ao atualizar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // =======================
  // Perfis do Usuário (adm_usuarios_perfil)
  // =======================

  buscarPerfisDoUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const perfis = await getAll<any>(
        `SELECT up.id, up.perfil_id, p.perfil
         FROM adm_usuarios_perfil up
         JOIN adm_perfil p ON p.id = up.perfil_id
         WHERE up.usuario_id = $1 AND up.dt_inativacao IS NULL
         ORDER BY p.perfil`,
        [id]
      );
      res.json(perfis);
    } catch (error: any) {
      log.error(`Erro ao buscar perfis do usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  sincronizarPerfisDoUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { perfil_ids } = req.body;

      if (!Array.isArray(perfil_ids)) {
        return res.status(400).json({ error: 'perfil_ids deve ser um array' });
      }

      const usuario = await getOne<any>('SELECT id FROM adm_usuarios WHERE id = $1', [id]);
      if (!usuario) return res.status(404).json({ error: 'Usuário não encontrado' });

      const adminId = req.user!.id;

      // Inativar perfis existentes
      await runQuery(
        `UPDATE adm_usuarios_perfil SET dt_inativacao = NOW(), updated_at = NOW(), updated_by = $1
         WHERE usuario_id = $2 AND dt_inativacao IS NULL`,
        [adminId, id]
      );

      // Inserir novos perfis
      for (const perfilId of perfil_ids) {
        await runQuery(
          `INSERT INTO adm_usuarios_perfil (usuario_id, perfil_id, created_by, updated_by)
           VALUES ($1, $2, $3, $4)`,
          [id, perfilId, adminId, adminId]
        );
      }

      const perfisAtualizados = await getAll<any>(
        `SELECT up.id, up.perfil_id, p.perfil
         FROM adm_usuarios_perfil up
         JOIN adm_perfil p ON p.id = up.perfil_id
         WHERE up.usuario_id = $1 AND up.dt_inativacao IS NULL
         ORDER BY p.perfil`,
        [id]
      );
      res.json(perfisAtualizados);
    } catch (error: any) {
      log.error(`Erro ao sincronizar perfis do usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};

