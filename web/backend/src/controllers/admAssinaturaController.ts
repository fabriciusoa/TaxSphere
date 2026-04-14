import { Request, Response } from 'express';
import { getAll, getOne, runQuery } from '../database/connection';
import log from '../utils/logger';
import { createCustomer, updateCustomer, archiveCustomer } from '../services/stripeCustomerService';

interface AssinaturaData {
  nome: string;
  email: string;
  cpf: string;
  id_adm_plano: number;
  dt_nascimento: string;
  cep: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
}

export const admAssinaturaController = {
  // Listar todas as assinaturas
  async listar(req: Request, res: Response) {
    try {
      const assinaturas = await getAll(`
        SELECT 
          a.*,
          p.descricao as plano_descricao,
          p.valor as plano_valor
        FROM adm_assinatura a
        LEFT JOIN adm_planos p ON a.id_adm_plano = p.id
        WHERE a.dt_excluido IS NULL
        ORDER BY a.dt_criacao DESC
      `);
      
      res.json(assinaturas);
    } catch (error: any) {
      log.error(`Erro ao listar assinaturas: ${error}`);
      res.status(500).json({ error: 'Erro ao listar assinaturas' });
    }
  },

  // Buscar assinatura por ID
  async buscarPorId(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const assinatura = await getOne(`
        SELECT 
          a.*,
          p.descricao as plano_descricao,
          p.valor as plano_valor
        FROM adm_assinatura a
        LEFT JOIN adm_planos p ON a.id_adm_plano = p.id
        WHERE a.id = ? AND a.dt_excluido IS NULL
      `, [id]);
      
      if (!assinatura) {
        log.error(`Assinatura não encontrada: ${id}`);
        return res.status(404).json({ error: 'Assinatura não encontrada' });
      }
      
      res.json(assinatura);
    } catch (error: any) {
      log.error(`Erro ao buscar assinatura: ${error}`);
      res.status(500).json({ error: 'Erro ao buscar assinatura' });
    }
  },

  // Criar nova assinatura
  async criar(req: Request, res: Response) {
    try {
      const data: AssinaturaData = req.body;
      
      // Validações
      if (!data.nome || !data.email || !data.cpf || !data.id_adm_plano) {
        return res.status(400).json({ erro: 'Nome, email, CPF e plano são obrigatórios' });
      }

      if (!data.dt_nascimento || !data.cep || !data.telefone) {
        return res.status(400).json({ erro: 'Data de nascimento, CEP e telefone são obrigatórios' });
      }

      if (!data.endereco || !data.numero || !data.bairro || !data.cidade || !data.uf) {
        return res.status(400).json({ erro: 'Endereço completo é obrigatório' });
      }

      // Verificar se já existe assinatura com este email
      const assinaturaExistente = await getOne(
        'SELECT id FROM adm_assinatura WHERE email = ? AND dt_excluido IS NULL',
        [data.email]
      );

      if (assinaturaExistente) {
        log.error(`Tentativa de criar assinatura com email já existente: ${data.email}`);
        return res.status(400).json({ erro: 'Já existe uma assinatura com este email' });
      }

      // Verificar se já existe assinatura com este CPF
      const assinaturaExistenteCpf = await getOne(
        'SELECT id FROM adm_assinatura WHERE cpf = ? AND dt_excluido IS NULL',
        [data.cpf]
      );

      if (assinaturaExistenteCpf) {
        log.error(`Tentativa de criar assinatura com CPF já existente: ${data.cpf}`);
        return res.status(400).json({ erro: 'Já existe uma assinatura com este CPF' });
      }

      // Calcular data de demonstração (7 dias a partir de hoje)
      const dtDemonstracao = new Date();
      dtDemonstracao.setDate(dtDemonstracao.getDate() + 7);

      // INSERT sem stripe_customer_id (será preenchido depois)
      const result = await runQuery(`
        INSERT INTO adm_assinatura (
          nome, email, cpf, id_adm_plano, dt_criacao, status,
          dt_nascimento, dt_demonstracao, cep, telefone,
          endereco, numero, complemento, bairro, cidade, uf
        ) VALUES (?, ?, ?, ?, datetime('now'), 'DEMONSTRACAO', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.nome,
        data.email,
        data.cpf,
        data.id_adm_plano,
        data.dt_nascimento,
        dtDemonstracao.toISOString(),
        data.cep,
        data.telefone,
        data.endereco,
        data.numero,
        data.complemento || null,
        data.bairro,
        data.cidade,
        data.uf
      ]);

      const assinaturaId = result.lastID;
      let stripeCustomerId: string | null = null;

      // Tentar criar Customer no Stripe
      try {
        const dtCriacao = new Date().toISOString();
        
        stripeCustomerId = await createCustomer({
          id: assinaturaId,
          ...data,
          dt_criacao: dtCriacao,
          status: 'DEMONSTRACAO'
        });

        // Atualizar banco com stripe_customer_id
        await runQuery(
          'UPDATE adm_assinatura SET stripe_customer_id = ? WHERE id = ?',
          [stripeCustomerId, assinaturaId]
        );

        log.info(`Assinatura ${assinaturaId} sincronizada com Stripe Customer: ${stripeCustomerId}`);
      } catch (stripeError: any) {
        // Falha no Stripe - NÃO reverter assinatura (sistema é source of truth)
        // Customer será criado posteriormente via cron job
        log.error(`Erro ao criar Customer Stripe para assinatura ${assinaturaId}: ${stripeError.message}`);
      }

      // Buscar assinatura criada
      const novaAssinatura = await getOne(
        `SELECT a.*, p.descricao as plano_descricao, p.valor as plano_valor
         FROM adm_assinatura a
         LEFT JOIN adm_planos p ON a.id_adm_plano = p.id
         WHERE a.id = ?`,
        [assinaturaId]
      );

      res.status(201).json(novaAssinatura);
    } catch (error: any) {
      log.error('Erro ao criar assinatura:', error);
      res.status(500).json({ erro: 'Erro ao criar assinatura' });
    }
  },

  // Atualizar assinatura
  async atualizar(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const data = req.body;

      // Verificar se assinatura existe
      const assinaturaExistente = await getOne<{
        id: number;
        stripe_customer_id: string | null;
      }>(
        'SELECT id, stripe_customer_id FROM adm_assinatura WHERE id = ? AND dt_excluido IS NULL',
        [id]
      );

      if (!assinaturaExistente) {
        return res.status(404).json({ erro: 'Assinatura não encontrada' });
      }

      // Validações
      if (!data.nome || !data.email || !data.cpf || !data.id_adm_plano) {
        return res.status(400).json({ erro: 'Campos obrigatórios não preenchidos' });
      }

      // Atualizar assinatura
      await runQuery(`
        UPDATE adm_assinatura SET
          nome = ?,
          email = ?,
          cpf = ?,
          id_adm_plano = ?,
          dt_nascimento = ?,
          cep = ?,
          telefone = ?,
          endereco = ?,
          numero = ?,
          complemento = ?,
          bairro = ?,
          cidade = ?,
          uf = ?,
          status = ?
        WHERE id = ?
      `, [
        data.nome,
        data.email,
        data.cpf,
        data.id_adm_plano,
        data.dt_nascimento,
        data.cep,
        data.telefone,
        data.endereco,
        data.numero,
        data.complemento || null,
        data.bairro,
        data.cidade,
        data.uf,
        data.status || 'DEMONSTRACAO',
        id
      ]);

      // Sincronizar com Stripe se houver customer_id
      if (assinaturaExistente.stripe_customer_id) {
        try {
          await updateCustomer(assinaturaExistente.stripe_customer_id, {
            id: parseInt(id),
            ...data
          });
        } catch (stripeError: any) {
          log.error(`Erro ao atualizar Customer Stripe: ${stripeError.message}`);
          // Continua mesmo se falhar (sistema é source of truth)
        }
      }

      // Buscar assinatura atualizada
      const assinaturaAtualizada = await getOne(
        `SELECT a.*, p.descricao as plano_descricao, p.valor as plano_valor
         FROM adm_assinatura a
         LEFT JOIN adm_planos p ON a.id_adm_plano = p.id
         WHERE a.id = ?`,
        [id]
      );

      res.json(assinaturaAtualizada);
    } catch (error: any) {
      log.error(`Erro ao atualizar assinatura: ${error.message}`);
      res.status(500).json({ erro: 'Erro ao atualizar assinatura' });
    }
  },

  // Excluir assinatura (soft delete)
  async excluir(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Verificar se assinatura existe
      const assinatura = await getOne<{
        id: number;
        stripe_customer_id: string | null;
      }>(
        'SELECT id, stripe_customer_id FROM adm_assinatura WHERE id = ? AND dt_excluido IS NULL',
        [id]
      );

      if (!assinatura) {
        return res.status(404).json({ erro: 'Assinatura não encontrada' });
      }

      // Arquivar Customer no Stripe se existir
      if (assinatura.stripe_customer_id) {
        try {
          await archiveCustomer(assinatura.stripe_customer_id);
          log.info(`Customer Stripe ${assinatura.stripe_customer_id} arquivado`);
        } catch (stripeError: any) {
          log.error(`Erro ao arquivar Customer Stripe: ${stripeError.message}`);
          // Continua com exclusão no banco mesmo se falhar
        }
      }

      // Soft delete
      await runQuery(
        "UPDATE adm_assinatura SET dt_excluido = datetime('now') WHERE id = ?",
        [id]
      );

      res.json({ mensagem: 'Assinatura excluída com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir assinatura: ${error.message}`);
      res.status(500).json({ erro: 'Erro ao excluir assinatura' });
    }
  }
};
