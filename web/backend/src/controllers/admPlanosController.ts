import { Request, Response } from 'express';
import { getAll, getOne, runQuery, beginTransaction, commitTransaction, rollbackTransaction } from '../database/connection';
import { AuthRequest } from '../types';
import log from '../utils/logger';
import { createProduct, createNewPrice, updateProduct, archiveProduct } from '../services/stripeProductService';

interface PlanoItem {
  id?: number;
  id_adm_plano?: number;
  descricao: string;
  ativo: string;
  dt_inclusao?: string;
  dt_exclusao?: string | null;
}

interface Plano {
  id?: number;
  descricao: string;
  valor: number;
  ativo: string;
  dt_inclusao?: string;
  dt_alteracao?: string | null;
  id_product_stripe?: string | null;
  id_price_stripe?: string | null;
  itens?: PlanoItem[];
}

export const admPlanosController = {
  /**
   * Lista todos os planos com seus itens
   */
  listar: async (req: Request, res: Response) => {
    try {
      const planos = await getAll<Plano>(
        `SELECT id, descricao, valor, ativo, dt_inclusao, dt_alteracao, id_product_stripe, id_price_stripe
         FROM adm_planos 
         ORDER BY valor ASC`
      );

      // Buscar itens de cada plano
      for (const plano of planos) {
        const itens = await getAll<PlanoItem>(
          `SELECT id, id_adm_plano, descricao, ativo, dt_inclusao, dt_exclusao
           FROM adm_plano_itens
           WHERE id_adm_plano = $1
           ORDER BY id ASC`,
          [plano.id]
        );
        plano.itens = itens;
      }

      res.json(planos);
    } catch (error: any) {
      log.error(`Erro ao listar planos: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar planos' });
    }
  },

  /**
   * Busca plano por ID com seus itens
   */
  buscarPorId: async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const plano = await getOne<Plano>(
        `SELECT id, descricao, valor, ativo, dt_inclusao, dt_alteracao 
         FROM adm_planos 
         WHERE id = $1`,
        [id]
      );

      if (!plano) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }

      // Buscar itens do plano
      const itens = await getAll<PlanoItem>(
        `SELECT id, id_adm_plano, descricao, ativo, dt_inclusao, dt_exclusao
         FROM adm_plano_itens
         WHERE id_adm_plano = $1 AND dt_exclusao IS NULL
         ORDER BY id ASC`,
        [id]
      );

      plano.itens = itens;

      res.json(plano);
    } catch (error: any) {
      log.error(`Erro ao buscar plano: ${error.message}`);
      res.status(500).json({ error: 'Erro ao buscar plano' });
    }
  },

  /**
   * Cria novo plano com itens (apenas ADMIN)
   */
  criar: async (req: AuthRequest, res: Response) => {
    try {
      const { descricao, valor, ativo = 'S', itens = [] } = req.body;

      // Validações
      if (!descricao || descricao.trim().length === 0) {
        return res.status(400).json({ error: 'Descrição é obrigatória' });
      }

      if (valor === undefined || valor === null || valor < 0) {
        return res.status(400).json({ error: 'Valor deve ser maior ou igual a zero' });
      }

      if (!['S', 'N'].includes(ativo)) {
        return res.status(400).json({ error: 'Ativo deve ser S ou N' });
      }

      // Verificar se já existe plano com mesma descrição
      const existente = await getOne<{ id: number }>(
        'SELECT id FROM adm_planos WHERE LOWER(descricao) = LOWER($1)',
        [descricao.trim()]
      );

      if (existente) {
        return res.status(409).json({ error: 'Já existe um plano com esta descrição' });
      }

      // INSERT no banco SEM IDs Stripe (serão preenchidos depois)
      const dtInclusao = new Date().toISOString();
      const txClient = await beginTransaction();
      let planoId: number;
      try {
        const resultPlano = await runQuery(
          `INSERT INTO adm_planos (descricao, valor, ativo, dt_inclusao) 
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [descricao.trim(), valor, ativo, dtInclusao],
          txClient
        );
        planoId = resultPlano.id;

        // Inserir itens do plano (se houver) dentro da mesma transacão
        if (Array.isArray(itens) && itens.length > 0) {
          for (const item of itens) {
            if (item.descricao && item.descricao.trim().length > 0) {
              await runQuery(
                `INSERT INTO adm_plano_itens (id_adm_plano, descricao, ativo, dt_inclusao) 
                 VALUES ($1, $2, $3, $4)`,
                [planoId, item.descricao.trim(), item.ativo || 'S', dtInclusao],
                txClient
              );
            }
          }
        }
        await commitTransaction(txClient);
      } catch (txErr) {
        await rollbackTransaction(txClient);
        throw txErr;
      }
      let stripeProductId: string | null = null;
      let stripePriceId: string | null = null;

      // Tentar criar no Stripe
      try {
        const stripeResult = await createProduct(
          { id: planoId, descricao: descricao.trim(), valor, ativo, dt_inclusao: dtInclusao },
          itens
        );

        stripeProductId = stripeResult.productId;
        stripePriceId = stripeResult.priceId;

        // Atualizar banco com IDs Stripe
        await runQuery(
          `UPDATE adm_planos 
           SET id_product_stripe = $1, id_price_stripe = $2 
           WHERE id = $3`,
          [stripeProductId, stripePriceId, planoId]
        );

        log.info(`Plano ${planoId} sincronizado com Stripe: ${stripeProductId}`);
      } catch (stripeError: any) {
        // Falha ao criar no Stripe - reverter insert
        log.error(`Erro ao criar produto no Stripe para plano ${planoId}: ${stripeError.message}`);
        
        await runQuery('DELETE FROM adm_planos WHERE id = $1', [planoId]);
        
        return res.status(500).json({
          error: 'Erro ao criar produto no Stripe. Plano não foi salvo.',
          details: stripeError.message
        });
      }

      // Buscar plano criado com itens
      const planoCompleto = await getOne<Plano>(
        `SELECT id, descricao, valor, ativo, dt_inclusao, dt_alteracao,
                id_product_stripe, id_price_stripe
         FROM adm_planos WHERE id = $1`,
        [planoId]
      );

      if (planoCompleto) {
        const itensCriados = await getAll<PlanoItem>(
          `SELECT id, id_adm_plano, descricao, ativo, dt_inclusao, dt_exclusao
           FROM adm_plano_itens
           WHERE id_adm_plano = $1 AND dt_exclusao IS NULL`,
          [planoId]
        );
        planoCompleto.itens = itensCriados;
      }

      res.status(201).json({
        ...planoCompleto,
        message: 'Plano criado com sucesso e sincronizado com Stripe'
      });
    } catch (error: any) {
      log.error(`Erro ao criar plano: ${error.message}`);
      res.status(500).json({ error: 'Erro ao criar plano' });
    }
  },

  /**
   * Atualiza plano e seus itens (apenas ADMIN)
   */
  atualizar: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const { descricao, valor, ativo, itens = [] } = req.body;

      // Verificar se plano existe
      const planoExistente = await getOne<{ 
        id: number;
        ativo: string;
        dt_inclusao: string;
        valor: number;
        id_product_stripe: string | null;
        id_price_stripe: string | null;
      }>(
        `SELECT id, ativo, dt_inclusao, valor, id_product_stripe, id_price_stripe 
         FROM adm_planos WHERE id = $1`,
        [id]
      );

      if (!planoExistente) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }

      // Validações
      if (!descricao || descricao.trim().length === 0) {
        return res.status(400).json({ error: 'Descrição é obrigatória' });
      }

      if (valor === undefined || valor === null || valor < 0) {
        return res.status(400).json({ error: 'Valor deve ser maior ou igual a zero' });
      }

      if (!['S', 'N'].includes(ativo)) {
        return res.status(400).json({ error: 'Ativo deve ser S ou N' });
      }

      // Verificar se já existe outro plano com mesma descrição
      const duplicado = await getOne<{ id: number }>(
        'SELECT id FROM adm_planos WHERE LOWER(descricao) = LOWER($1) AND id != $2',
        [descricao.trim(), id]
      );

      if (duplicado) {
        return res.status(409).json({ error: 'Já existe outro plano com esta descrição' });
      }

      const valorMudou = planoExistente.valor !== valor;
      let novoStripePriceId = planoExistente.id_price_stripe;

      // Sincronizar com Stripe se houver id_product_stripe
      if (planoExistente.id_product_stripe) {
        try {
          // Se valor mudou, criar novo Price
          if (valorMudou) {
            log.info(`Valor do plano ${id} mudou de ${planoExistente.valor} para ${valor}`);
            novoStripePriceId = await createNewPrice(
              planoExistente.id_product_stripe,
              valor,
              parseInt(id)
            );
            log.info(`Novo Price criado: ${novoStripePriceId}`);
          }

          // Atualizar metadados e descrição do produto
          await updateProduct(
            planoExistente.id_product_stripe,
            descricao.trim(),
            itens,
            ativo,
            parseInt(id)
          );

        } catch (stripeError: any) {
          // Log mas não impede atualização no banco (sistema é source of truth)
          log.error(`Erro ao atualizar Stripe para plano ${id}: ${stripeError.message}`);
          // Continua com atualização no banco
        }
      }

      // Atualizar plano + itens atomicamente
      const dtAlteracao = new Date().toISOString();
      const txClient = await beginTransaction();
      try {
        await runQuery(
          `UPDATE adm_planos 
           SET descricao = $1, valor = $2, ativo = $3, dt_alteracao = $4,
               id_price_stripe = $5
           WHERE id = $6`,
          [descricao.trim(), valor, ativo, dtAlteracao, novoStripePriceId, id],
          txClient
        );

        // Deletar todos os itens atuais
        await runQuery(`DELETE FROM adm_plano_itens WHERE id_adm_plano = $1`, [id], txClient);

        // Inserir novos itens
        if (Array.isArray(itens) && itens.length > 0) {
          for (const item of itens) {
            if (item.descricao && item.descricao.trim().length > 0) {
              const itemAtivo = ativo === 'N' ? 'N' : (item.ativo || 'S');
              await runQuery(
                `INSERT INTO adm_plano_itens (id_adm_plano, descricao, ativo, dt_inclusao) 
                 VALUES ($1, $2, $3, $4)`,
                [id, item.descricao.trim(), itemAtivo, planoExistente.dt_inclusao],
                txClient
              );
            }
          }
        }
        await commitTransaction(txClient);
      } catch (txErr) {
        await rollbackTransaction(txClient);
        throw txErr;
      }

      // Buscar plano atualizado com itens
      const planoAtualizado = await getOne<Plano>(
        `SELECT id, descricao, valor, ativo, dt_inclusao, dt_alteracao,
                id_product_stripe, id_price_stripe
         FROM adm_planos WHERE id = $1`,
        [id]
      );

      if (planoAtualizado) {
        const itensAtualizados = await getAll<PlanoItem>(
          `SELECT id, id_adm_plano, descricao, ativo, dt_inclusao, dt_exclusao
           FROM adm_plano_itens
           WHERE id_adm_plano = $1`,
          [id]
        );
        planoAtualizado.itens = itensAtualizados;
      }

      res.json({
        ...planoAtualizado,
        message: 'Plano atualizado com sucesso'
      });
    } catch (error: any) {
      log.error(`Erro ao atualizar plano: ${error.message}`);
      res.status(500).json({ error: 'Erro ao atualizar plano' });
    }
  },

  /**
   * Exclui plano (soft delete) e arquiva no Stripe
   */
  excluir: async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;

      // Verificar se plano existe
      const plano = await getOne<{ 
        id: number;
        id_product_stripe: string | null;
      }>(
        'SELECT id, id_product_stripe FROM adm_planos WHERE id = $1',
        [id]
      );

      if (!plano) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }

      // Arquivar no Stripe se existir
      if (plano.id_product_stripe) {
        try {
          await archiveProduct(plano.id_product_stripe);
          log.info(`Produto Stripe ${plano.id_product_stripe} arquivado`);
        } catch (stripeError: any) {
          log.error(`Erro ao arquivar produto no Stripe: ${stripeError.message}`);
          // Continua com exclusão no banco mesmo se Stripe falhar
        }
      }

      const dtExclusao = new Date().toISOString();

      // Soft delete dos itens
      await runQuery(
        `UPDATE adm_plano_itens 
         SET dt_exclusao = $1
         WHERE id_adm_plano = $2 AND dt_exclusao IS NULL`,
        [dtExclusao, id]
      );

      // Soft delete do plano (marcar como inativo)
      await runQuery(
        `UPDATE adm_planos 
         SET ativo = 'N', dt_alteracao = $1
         WHERE id = $2`,
        [dtExclusao, id]
      );

      res.json({ message: 'Plano excluído com sucesso' });
    } catch (error: any) {
      log.error(`Erro ao excluir plano: ${error.message}`);
      res.status(500).json({ error: 'Erro ao excluir plano' });
    }
  },

  /**
   * Lista apenas planos ativos (para exibição pública)
   */
  listarAtivos: async (req: Request, res: Response) => {
    try {
      const planos = await getAll<Plano>(
        `SELECT id, descricao, valor, ativo, dt_inclusao, dt_alteracao 
         FROM adm_planos 
         WHERE ativo = 'S'
         ORDER BY valor ASC`
      );

      // Buscar apenas itens ativos de cada plano
      for (const plano of planos) {
        const itens = await getAll<PlanoItem>(
          `SELECT id, id_adm_plano, descricao, ativo, dt_inclusao, dt_exclusao
           FROM adm_plano_itens
           WHERE id_adm_plano = $1 AND ativo = 'S' AND dt_exclusao IS NULL
           ORDER BY id ASC`,
          [plano.id]
        );
        plano.itens = itens;
      }

      res.json(planos);
    } catch (error: any) {
      log.error(`Erro ao listar planos ativos: ${error.message}`);
      res.status(500).json({ error: 'Erro ao listar planos ativos' });
    }
  }
};
