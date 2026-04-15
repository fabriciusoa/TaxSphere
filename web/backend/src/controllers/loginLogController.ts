import { Response } from 'express';
import { getAll } from '../database/connection';
import { AuthRequest } from '../types';
import { formatToBrazilian } from '../utils/dateHelpers';
import { log } from '../utils/logger';

export const loginLogController = {
  // Listar logs de login com paginação e filtros
  listar: async (req: AuthRequest, res: Response) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = (page - 1) * limit;
      
      const { sucesso, data_inicio, data_fim, usuario_id } = req.query;

      let sql = `
        SELECT 
          ll.*,
          u.nome as usuario_nome
        FROM login_log ll
        LEFT JOIN usuarios u ON ll.usuario_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (sucesso) {
        params.push(sucesso);
        sql += ` AND ll.sucesso = $${params.length}`;
      }

      if (data_inicio) {
        params.push(data_inicio);
        sql += ` AND ll.timestamp >= $${params.length}`;
      }

      if (data_fim) {
        params.push(data_fim);
        sql += ` AND ll.timestamp <= $${params.length}`;
      }

      if (usuario_id) {
        params.push(usuario_id);
        sql += ` AND ll.usuario_id = $${params.length}`;
      }

      // Contar total
      const countSql = sql.replace(
        'SELECT ll.*, u.nome as usuario_nome',
        'SELECT COUNT(*) as total'
      );
      const countResult = await getAll<{ total: number }>(countSql, params);
      const total = countResult[0]?.total || 0;

      // Buscar dados com paginação
      params.push(limit);
      sql += ` ORDER BY ll.timestamp DESC LIMIT $${params.length}`;
      params.push(offset);
      sql += ` OFFSET $${params.length}`;

      const logs = await getAll<any>(sql, params);

      // Formatar datas para brasileiro
      const logsFormatados = logs.map((log) => ({
        id: log.id,
        usuario_id: log.usuario_id,
        usuario_nome: log.usuario_nome,
        email_tentativa: log.email_tentativa,
        sucesso: log.sucesso,
        ip_address: log.ip_address,
        user_agent: log.user_agent,
        motivo_falha: log.motivo_falha,
        timestamp: formatToBrazilian(log.timestamp)
      }));

      res.json({
        data: logsFormatados,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        }
      });
    } catch (error: any) {
      log.error(`Erro ao listar logs de login: ${error.message}`);
      res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
};