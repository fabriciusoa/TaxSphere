import { Response } from 'express';
import bcrypt from 'bcrypt';
import { getOne, getAll, runQuery } from '../database/connection';
import { Usuario, AuthRequest, UsuarioResponse } from '../types';
import { criarUsuarioSchema, atualizarUsuarioSchema } from '../validators/schemas';
import { getCurrentTimestamp, formatToBrazilian } from '../utils/dateHelpers';
import { log } from '../utils/logger';

export const usuariosController = {
  // Listar todos os usuários
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const { status, busca, data_criacao_inicio, data_criacao_fim, page = 1, limit = 10 } = req.query;

      const offset = (Number(page) - 1) * Number(limit);

      let sql = `
        SELECT u.*, p.perfil as perfil_nome
        FROM usuarios u
        LEFT JOIN perfil p ON u.perfil = p.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (status) {
        sql += ' AND u.status = ?';
        params.push(status);
      }

      if (busca) {
        sql += ` AND (LOWER(u.nome) LIKE LOWER(?) OR LOWER(u.email) LIKE LOWER(?) OR u.cpf LIKE ?)`;
        params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
      }

      // Filtro por data de criação
      if (data_criacao_inicio) {
        sql += ' AND DATE(u.criado) >= DATE(?)';
        params.push(data_criacao_inicio);
      }
      if (data_criacao_fim) {
        sql += ' AND DATE(u.criado) <= DATE(?)';
        params.push(data_criacao_fim);
      }

      // Query para contar total
      const countSql = `SELECT COUNT(*) as total FROM (${sql}) as subquery`;
      const countResult = await getOne<{ total: number }>(countSql, params);
      const totalRecords = countResult?.total || 0;

      sql += ' ORDER BY u.nome LIMIT ? OFFSET ?';
      params.push(Number(limit), offset);

      const usuarios = await getAll<any>(sql, params);

      // Formatar datas para brasileiro
      const usuariosFormatados = usuarios.map((u) => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        cpf: u.cpf,
        perfil: u.perfil_nome,
        perfil_id: u.perfil,
        status: u.status,
        criado: formatToBrazilian(u.criado),
        dt_inativacao: formatToBrazilian(u.dt_inativacao),
        dt_nascimento: u.dt_nascimento,
        dt_ativacao: formatToBrazilian(u.dt_ativacao),
        ultimo_login: formatToBrazilian(u.ultimo_login),
        tentativas_login: u.tentativas_login,
        dt_bloqueio: formatToBrazilian(u.dt_bloqueio)
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
        `SELECT u.*, p.perfil as perfil_nome
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.id = ?`,
        [id]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Remover senha e formatar datas
      const usuarioFormatado = {
        id: usuario.id,
        nome: usuario.nome,
        email: usuario.email,
        cpf: usuario.cpf,
        perfil: usuario.perfil_nome,
        perfil_id: usuario.perfil,
        status: usuario.status,
        criado: formatToBrazilian(usuario.criado),
        dt_inativacao: formatToBrazilian(usuario.dt_inativacao),
        dt_nascimento: usuario.dt_nascimento,
        dt_ativacao: formatToBrazilian(usuario.dt_ativacao),
        ultimo_login: formatToBrazilian(usuario.ultimo_login),
        tentativas_login: usuario.tentativas_login,
        dt_bloqueio: formatToBrazilian(usuario.dt_bloqueio)
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

      const { nome, email, cpf, senha, perfil_id, dt_nascimento } = resultado.data;

      // Verificar se email já existe
      const emailExiste = await getOne<Usuario>(
        'SELECT * FROM usuarios WHERE email = ?',
        [email]
      );
      if (emailExiste) {
        return res.status(400).json({ error: 'Email já cadastrado' });
      }

      // Verificar se CPF já existe
      const cpfExiste = await getOne<Usuario>(
        'SELECT * FROM usuarios WHERE cpf = ?',
        [cpf]
      );
      if (cpfExiste) {
        return res.status(400).json({ error: 'CPF já cadastrado' });
      }

      // Verificar se perfil existe
      const perfilExiste = await getOne('SELECT * FROM perfil WHERE id = ?', [perfil_id]);
      if (!perfilExiste) {
        return res.status(400).json({ error: 'Perfil inválido' });
      }

      // Hash da senha
      const senhaHash = await bcrypt.hash(senha, 10);

      // Inserir usuário
      const agora = getCurrentTimestamp();
      await runQuery(
        `INSERT INTO usuarios (nome, email, cpf, senha, perfil, status, criado, dt_ativacao, dt_nascimento, tentativas_login)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [nome, email, cpf, senhaHash, perfil_id, 'Ativo', agora, agora, dt_nascimento || null, 0]
      );

      // Buscar usuário criado
      const usuarioCriado = await getOne<any>(
        `SELECT u.*, p.perfil as perfil_nome
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.email = ?`,
        [email]
      );

      res.status(201).json({
        id: usuarioCriado.id,
        nome: usuarioCriado.nome,
        email: usuarioCriado.email,
        cpf: usuarioCriado.cpf,
        perfil: usuarioCriado.perfil_nome,
        perfil_id: usuarioCriado.perfil,
        status: usuarioCriado.status,
        criado: formatToBrazilian(usuarioCriado.criado),
        dt_nascimento: usuarioCriado.dt_nascimento
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
        return res.status(400).json({ errors: resultado.error.errors });
      }

      // Verificar se usuário existe
      const usuario = await getOne<Usuario>('SELECT * FROM usuarios WHERE id = ?', [id]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      const campos: string[] = [];
      const valores: any[] = [];

      if (resultado.data.nome) {
        campos.push('nome = ?');
        valores.push(resultado.data.nome);
      }
      if (resultado.data.senha) {
        const senhaHash = await bcrypt.hash(resultado.data.senha, 10);
        campos.push('senha = ?');
        valores.push(senhaHash);
      }
      if (resultado.data.email) {
        // Verificar se email já existe em outro usuário
        const emailExiste = await getOne<Usuario>(
          'SELECT * FROM usuarios WHERE email = ? AND id != ?',
          [resultado.data.email, id]
        );
        if (emailExiste) {
          return res.status(400).json({ error: 'Email já cadastrado' });
        }
        campos.push('email = ?');
        valores.push(resultado.data.email);
      }
      if (resultado.data.cpf) {
        // Verificar se CPF já existe em outro usuário
        const cpfExiste = await getOne<Usuario>(
          'SELECT * FROM usuarios WHERE cpf = ? AND id != ?',
          [resultado.data.cpf, id]
        );
        if (cpfExiste) {
          return res.status(400).json({ error: 'CPF já cadastrado' });
        }
        campos.push('cpf = ?');
        valores.push(resultado.data.cpf);
      }
      if (resultado.data.perfil_id) {
        // Verificar se perfil existe
        const perfilExiste = await getOne('SELECT * FROM perfil WHERE id = ?', [resultado.data.perfil_id]);
        if (!perfilExiste) {
          return res.status(400).json({ error: 'Perfil inválido, verifique o ID do perfil' });
        }
        campos.push('perfil = ?');
        valores.push(resultado.data.perfil_id);
      }
      if (resultado.data.status) {
        campos.push('status = ?');
        valores.push(resultado.data.status);

        if (resultado.data.status === 'Inativo') {
          campos.push('dt_inativacao = ?');
          valores.push(getCurrentTimestamp());
        } else if (resultado.data.status === 'Ativo') {
          campos.push('dt_inativacao = ?');
          valores.push(null);
          campos.push('dt_ativacao = ?');
          valores.push(getCurrentTimestamp());
        }
      }
      if (resultado.data.dt_inativacao !== undefined) {
        campos.push('dt_inativacao = ?');
        valores.push(resultado.data.dt_inativacao);
      }
      if (resultado.data.dt_nascimento !== undefined) {
        campos.push('dt_nascimento = ?');
        valores.push(resultado.data.dt_nascimento);
      }

      if (campos.length === 0) {
        return res.status(400).json({ error: 'Nenhum campo para atualizar' });
      }

      valores.push(id);
      await runQuery(
        `UPDATE usuarios SET ${campos.join(', ')} WHERE id = ?`,
        valores
      );

      // Buscar usuário atualizado
      const usuarioAtualizado = await getOne<any>(
        `SELECT u.*, p.perfil as perfil_nome
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.id = ?`,
        [id]
      );

      res.json({
        id: usuarioAtualizado.id,
        nome: usuarioAtualizado.nome,
        email: usuarioAtualizado.email,
        cpf: usuarioAtualizado.cpf,
        perfil: usuarioAtualizado.perfil_nome,
        perfil_id: usuarioAtualizado.perfil,
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

      const usuario = await getOne<Usuario>('SELECT * FROM usuarios WHERE id = ?', [id]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      await runQuery(
        'UPDATE usuarios SET tentativas_login = 0, dt_bloqueio = NULL WHERE id = ?',
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

      const usuario = await getOne<Usuario>('SELECT * FROM usuarios WHERE id = ?', [id]);
      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      await runQuery(
        'UPDATE usuarios SET status = ?, dt_inativacao = ? WHERE id = ?',
        ['inativo', getCurrentTimestamp(), id]
      );

      res.json({ message: 'Usuário inativado com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao inativar usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};
