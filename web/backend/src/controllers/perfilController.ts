import { Response } from 'express';
import { getOne, getAll, runQuery } from '../database/connection';
import { AuthRequest, Perfil } from '../types';
import { getCurrentTimestamp } from '../utils/dateHelpers';
import { perfilSchema } from '../validators/schemas';
import { log } from '../utils/logger';

export const perfilController = {
  // =======================
  // Gestão de Perfis (ADMIN)
  // =======================
  
  // Listar todos os perfis
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const perfis = await getAll<Perfil>('SELECT * FROM perfil ORDER BY perfil');
      res.json(perfis);
    } catch (error: any) {
      log.error(`Erro ao listar perfis: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar perfil por ID
  buscarPorId: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const perfil = await getOne<Perfil>('SELECT * FROM perfil WHERE id = $1', [id]);

      if (!perfil) {
        return res.status(404).json({ error: 'Perfil não encontrado' });
      }

      res.json(perfil);
    } catch (error: any) {
      log.error(`Erro ao buscar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Criar novo perfil
  criar: async (req: AuthRequest, res: Response) => {
    try {
      const resultado = perfilSchema.safeParse(req.body);
      if (!resultado.success) {
        return res.status(400).json({ errors: resultado.error.errors });
      }

      const { perfil } = resultado.data;

      // Verificar se perfil já existe
      const perfilExiste = await getOne<Perfil>(
        'SELECT * FROM perfil WHERE perfil = $1',
        [perfil]
      );
      if (perfilExiste) {
        return res.status(400).json({ error: 'Perfil já cadastrado' });
      }

      await runQuery('INSERT INTO perfil (perfil) VALUES ($1)', [perfil]);

      const perfilCriado = await getOne<Perfil>(
        'SELECT * FROM perfil WHERE perfil = $1',
        [perfil]
      );

      res.status(201).json(perfilCriado);
    } catch (error: any) {
      log.error(`Erro ao criar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar perfil
  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      
      const resultado = perfilSchema.safeParse(req.body);
      if (!resultado.success) {
        return res.status(400).json({ errors: resultado.error.errors });
      }

      const { perfil } = resultado.data;

      // Verificar se perfil existe
      const perfilExiste = await getOne<Perfil>('SELECT * FROM perfil WHERE id = $1', [id]);
      if (!perfilExiste) {
        return res.status(404).json({ error: 'Perfil não encontrado' });
      }

      // Verificar se novo nome já existe
      const nomeExiste = await getOne<Perfil>(
        'SELECT * FROM perfil WHERE perfil = $1 AND id != $2',
        [perfil, id]
      );
      if (nomeExiste) {
        return res.status(400).json({ error: 'Nome de perfil já cadastrado' });
      }

      await runQuery('UPDATE perfil SET perfil = $1 WHERE id = $2', [perfil, id]);

      const perfilAtualizado = await getOne<Perfil>(
        'SELECT * FROM perfil WHERE id = $1',
        [id]
      );

      res.json(perfilAtualizado);
    } catch (error: any) {
      log.error(`Erro ao atualizar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Deletar perfil
  deletar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      const perfil = await getOne<Perfil>('SELECT * FROM perfil WHERE id = $1', [id]);
      if (!perfil) {
        return res.status(404).json({ error: 'Perfil não encontrado' });
      }

      // Verificar se há usuários com este perfil
      const usuariosComPerfil = await getOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM usuarios WHERE perfil = $1',
        [id]
      );

      if (usuariosComPerfil && usuariosComPerfil.count > 0) {
        return res.status(400).json({ 
          error: `Não é possível deletar. Existem ${usuariosComPerfil.count} usuário(s) com este perfil.` 
        });
      }

      await runQuery('DELETE FROM perfil WHERE id = $1', [id]);

      res.json({ message: 'Perfil deletado com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao deletar perfil: ${error.message}`);
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
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento, p.perfil as perfil
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.id = $1`,
        [userId]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json(usuario);
    } catch (error: any) {
      log.error(`Erro ao buscar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar dados do perfil de um usuário específico (ADMIN)
  buscarPerfilUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      const usuario = await getOne<any>(
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento, p.perfil as perfil
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.id = $1`,
        [userId]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      res.json(usuario);
    } catch (error: any) {
      log.error(`Erro ao buscar perfil do usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar dados do perfil do usuário logado
  atualizarMeuPerfil: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const { nome, email, cpf, dt_nascimento } = req.body;

      await runQuery(
        `UPDATE usuarios SET nome = $1, email = $2, cpf = $3, dt_nascimento = $4 WHERE id = $5`,
        [nome, email, cpf, dt_nascimento || null, userId]
      );

      const usuario = await getOne<any>(
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento, p.perfil as perfil
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
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
  }
};
