import { Request, Response } from 'express';
import { logFrontend } from '../utils/logger';
import { log } from '../utils/logger';

export const frontendLogController = {
  // POST /api/logs/frontend-error
  logError: async (req: Request, res: Response) => {
    try {
      const {
        error_message,
        error_stack,
        component_stack,
        url,
        user_agent,
        browser_info
      } = req.body;

      // Validar campos obrigatórios
      if (!error_message || !url) {
        return res.status(400).json({ 
          error: 'Campos obrigatórios: error_message, url' 
        });
      }

      // Capturar userId se estiver autenticado
      const userId = (req as any).user?.id;

      // Logar no arquivo mentis_frontend-*.log
      logFrontend({
        error_message,
        error_stack,
        component_stack,
        url,
        user_agent: user_agent || req.get('user-agent') || 'unknown',
        browser_info,
        userId
      });

      res.status(200).json({ success: true });
    } catch (error: any) {
      log.error(`Erro ao processar log do frontend: ${error.message}`);
      res.status(500).json({ error: 'Erro ao processar log' });
    }
  }
};
