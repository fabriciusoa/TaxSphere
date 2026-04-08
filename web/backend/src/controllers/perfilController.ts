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
      const perfil = await getOne<Perfil>('SELECT * FROM perfil WHERE id = ?', [id]);

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
        'SELECT * FROM perfil WHERE perfil = ?',
        [perfil]
      );
      if (perfilExiste) {
        return res.status(400).json({ error: 'Perfil já cadastrado' });
      }

      await runQuery('INSERT INTO perfil (perfil) VALUES (?)', [perfil]);

      const perfilCriado = await getOne<Perfil>(
        'SELECT * FROM perfil WHERE perfil = ?',
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
      const perfilExiste = await getOne<Perfil>('SELECT * FROM perfil WHERE id = ?', [id]);
      if (!perfilExiste) {
        return res.status(404).json({ error: 'Perfil não encontrado' });
      }

      // Verificar se novo nome já existe
      const nomeExiste = await getOne<Perfil>(
        'SELECT * FROM perfil WHERE perfil = ? AND id != ?',
        [perfil, id]
      );
      if (nomeExiste) {
        return res.status(400).json({ error: 'Nome de perfil já cadastrado' });
      }

      await runQuery('UPDATE perfil SET perfil = ? WHERE id = ?', [perfil, id]);

      const perfilAtualizado = await getOne<Perfil>(
        'SELECT * FROM perfil WHERE id = ?',
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

      const perfil = await getOne<Perfil>('SELECT * FROM perfil WHERE id = ?', [id]);
      if (!perfil) {
        return res.status(404).json({ error: 'Perfil não encontrado' });
      }

      // Verificar se há usuários com este perfil
      const usuariosComPerfil = await getOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM usuarios WHERE perfil = ?',
        [id]
      );

      if (usuariosComPerfil && usuariosComPerfil.count > 0) {
        return res.status(400).json({ 
          error: `Não é possível deletar. Existem ${usuariosComPerfil.count} usuário(s) com este perfil.` 
        });
      }

      await runQuery('DELETE FROM perfil WHERE id = ?', [id]);

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

      // Buscar dados do usuário com a descrição do perfil
      const usuario = await getOne<any>(
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento, p.perfil as perfil
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.id = ?`,
        [userId]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Buscar dados complementares se for médico
      const usuarioMedico = await getOne<any>(
        'SELECT * FROM usuario_medico WHERE id_usuario = ?',
        [userId]
      );

      // Converter logo de Buffer para base64 se existir
      let dadosMedico = null;
      if (usuarioMedico) {
        dadosMedico = { ...usuarioMedico };
        if (dadosMedico.logo && Buffer.isBuffer(dadosMedico.logo)) {
          dadosMedico.logo = dadosMedico.logo.toString('base64');
        }
        if (dadosMedico.assinatura && Buffer.isBuffer(dadosMedico.assinatura)) {
          dadosMedico.assinatura = dadosMedico.assinatura.toString('base64');
        }        
      }

      res.json({
        ...usuario,
        dados_medico: dadosMedico
      });
    } catch (error: any) {
      log.error(`Erro ao buscar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Buscar dados do perfil de um usuário específico (ADMIN)
  buscarPerfilUsuario: async (req: AuthRequest, res: Response) => {
    try {
      const { userId } = req.params;

      // Buscar dados do usuário com a descrição do perfil
      const usuario = await getOne<any>(
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento, p.perfil as perfil
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.id = ?`,
        [userId]
      );

      if (!usuario) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }

      // Buscar dados complementares se for médico
      const usuarioMedico = await getOne<any>(
        'SELECT * FROM usuario_medico WHERE id_usuario = ?',
        [userId]
      );

      // Converter logo de Buffer para base64 se existir
      let dadosMedico = null;
      if (usuarioMedico) {
        dadosMedico = { ...usuarioMedico };
        if (dadosMedico.logo && Buffer.isBuffer(dadosMedico.logo)) {
          dadosMedico.logo = dadosMedico.logo.toString('base64');
        }
        if (dadosMedico.assinatura && Buffer.isBuffer(dadosMedico.assinatura)) {
          dadosMedico.assinatura = dadosMedico.assinatura.toString('base64');
        }        
      }

      res.json({
        ...usuario,
        dados_medico: dadosMedico
      });
    } catch (error: any) {
      log.error(`Erro ao buscar perfil do usuário: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  // Atualizar dados do perfil do usuário logado
  atualizarMeuPerfil: async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id;
      const {
        nome,
        email,
        cpf,
        dt_nascimento,
        dados_medico
      } = req.body;

      const agora = getCurrentTimestamp();

      // Atualizar dados básicos do usuário
      await runQuery(
        `UPDATE usuarios SET
          nome = ?, email = ?, cpf = ?, dt_nascimento = ?
        WHERE id = ?`,
        [nome, email, cpf, dt_nascimento || null, userId]
      );

      // Se houver dados_medico, atualizar ou inserir
      if (dados_medico) {
        const usuarioMedicoExistente = await getOne<any>(
          'SELECT id FROM usuario_medico WHERE id_usuario = ?',
          [userId]
        );

          if (usuarioMedicoExistente) {
            // Preparar logo se enviado
          let logoBuffer = null;
          if (dados_medico.logo) {
            logoBuffer = Buffer.from(dados_medico.logo, 'base64');
          }

            // Preparar assinatura se enviado          
          let assinaturaBuffer = null;
          if (dados_medico.assinatura) {
            assinaturaBuffer = Buffer.from(dados_medico.assinatura, 'base64');
          }

          // Atualizar dados existentes
          await runQuery(
            `UPDATE usuario_medico SET
              especialidade = ?, inscricao = ?, tempo_sessao = ?, endereco = ?, numero = ?,
              complemento = ?, bairro = ?, cidade = ?, uf = ?, cep = ?,
              nacionalidade = ?, estado_civil = ?, telefone = ?, logo = ?, assinatura = ?, atualizado_em = ?
            WHERE id_usuario = ?`,
            [
              dados_medico.especialidade || null,
              dados_medico.inscricao || null,
              dados_medico.tempo_sessao || null,
              dados_medico.endereco || null,
              dados_medico.numero || null,
              dados_medico.complemento || null,
              dados_medico.bairro || null,
              dados_medico.cidade || null,
              dados_medico.uf || null,
              dados_medico.cep || null,
              dados_medico.nacionalidade || null,
              dados_medico.estado_civil || null,
              dados_medico.telefone || null,
              logoBuffer,
              assinaturaBuffer,
              agora,
              userId
            ]
          );
        } else {
          // Preparar logo se enviado
          let logoBuffer = null;
          if (dados_medico.logo) {
            logoBuffer = Buffer.from(dados_medico.logo, 'base64');
          }
          
          // Preparar assinatura se enviado
          let assinaturaBuffer = null;
          if (dados_medico.assinatura) {
            assinaturaBuffer = Buffer.from(dados_medico.assinatura, 'base64');
          }

          // Inserir novos dados
          await runQuery(
            `INSERT INTO usuario_medico (
              id_usuario, especialidade, inscricao, tempo_sessao, endereco, numero,
              complemento, bairro, cidade, uf, cep,
              nacionalidade, estado_civil, telefone, logo, assinatura, criado_em, atualizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              userId,
              dados_medico.especialidade || null,
              dados_medico.inscricao || null,
              dados_medico.tempo_sessao || null,
              dados_medico.endereco || null,
              dados_medico.numero || null,
              dados_medico.complemento || null,
              dados_medico.bairro || null,
              dados_medico.cidade || null,
              dados_medico.uf || null,
              dados_medico.cep || null,
              dados_medico.nacionalidade || null,
              dados_medico.estado_civil || null,
              dados_medico.telefone || null,
              logoBuffer,
              assinaturaBuffer,
              agora,
              agora
            ]
          );
        }
      }

      // Buscar dados atualizados com a descrição do perfil
      const usuario = await getOne<any>(
        `SELECT u.id, u.nome, u.email, u.cpf, u.dt_nascimento, p.perfil as perfil
         FROM usuarios u
         LEFT JOIN perfil p ON u.perfil = p.id
         WHERE u.id = ?`,
        [userId]
      );

      const usuarioMedico = await getOne<any>(
        'SELECT * FROM usuario_medico WHERE id_usuario = ?',
        [userId]
      );

      res.json({
        message: 'Perfil atualizado com sucesso',
        usuario: {
          ...usuario,
          dados_medico: usuarioMedico || null
        }
      });
    } catch (error: any) {
      log.error(`Erro ao atualizar perfil: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};
