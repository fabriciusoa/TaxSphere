import { Response } from 'express';
import { AuthRequest } from '../types';
import { perdcompIAService } from '../services/perdcompIAService';
import { log } from '../utils/logger';

export const perdcompIAController = {
  analisar: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.body;
      if (!id_empresa) return res.status(400).json({ error: 'Empresa é obrigatória' });

      const analise = await perdcompIAService.analisarOportunidades(id_empresa);
      res.json({ analise });
    } catch (error: any) {
      log.error(`Erro IA análise: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  sugerir: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa } = req.body;
      if (!id_empresa) return res.status(400).json({ error: 'Empresa é obrigatória' });

      const sugestao = await perdcompIAService.sugerirEstrategia(id_empresa);
      res.json({ sugestao });
    } catch (error: any) {
      log.error(`Erro IA sugestão: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  risco: async (req: AuthRequest, res: Response) => {
    try {
      const { id_pedido } = req.body;
      if (!id_pedido) return res.status(400).json({ error: 'Pedido é obrigatório' });

      const avaliacao = await perdcompIAService.avaliarRisco(id_pedido);
      res.json({ avaliacao });
    } catch (error: any) {
      log.error(`Erro IA risco: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },

  chat: async (req: AuthRequest, res: Response) => {
    try {
      const { id_empresa, mensagem, historico = [] } = req.body;
      if (!id_empresa || !mensagem) {
        return res.status(400).json({ error: 'Empresa e mensagem são obrigatórias' });
      }

      const resposta = await perdcompIAService.chat(id_empresa, mensagem, historico);
      res.json({ resposta });
    } catch (error: any) {
      log.error(`Erro IA chat: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  },
};
