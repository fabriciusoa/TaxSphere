import { Response } from 'express';
import { getOne, getAll } from '../database/connection';
import { AuthRequest } from '../types';
import { log } from '../utils/logger';

export const dashboardController = {
    indicadores: async (req: AuthRequest, res: Response) => {
        try {
            const id_usuario = req.user?.id;

            if (!id_usuario) {
                return res.status(401).json({ error: 'Não autorizado' });
            }

            const hoje = new Date().toISOString().split('T')[0];

            // Chamados abertos do usuário
            const chamadosAbertosResult = await getOne<{ qtde: number }>(
                "SELECT COUNT(*) AS qtde FROM chamado WHERE id_usuario = $1 AND status NOT IN ('Fechado', 'Cancelado')",
                [id_usuario]
            );
            const qtdeChamadosAbertos = chamadosAbertosResult?.qtde || 0;

            // Total de chamados do usuário
            const chamadosTotalResult = await getOne<{ qtde: number }>(
                'SELECT COUNT(*) AS qtde FROM chamado WHERE id_usuario = $1',
                [id_usuario]
            );
            const qtdeChamadosTotal = chamadosTotalResult?.qtde || 0;

            // Assinaturas ativas (admin)
            const assinaturasAtivasResult = await getOne<{ qtde: number }>(
                "SELECT COUNT(*) AS qtde FROM adm_assinatura WHERE status = 'ATIVO' AND dt_excluido IS NULL"
            );
            const qtdeAssinaturasAtivas = assinaturasAtivasResult?.qtde || 0;

            // Total de usuários ativos
            const usuariosAtivosResult = await getOne<{ qtde: number }>(
                "SELECT COUNT(*) AS qtde FROM usuarios WHERE LOWER(status) = 'ativo'"
            );
            const qtdeUsuariosAtivos = usuariosAtivosResult?.qtde || 0;

            return res.json({
                qtdeChamadosAbertos,
                qtdeChamadosTotal,
                qtdeAssinaturasAtivas,
                qtdeUsuariosAtivos
            });
        } catch (error: any) {
            log.error(`Erro ao buscar indicadores do dashboard: ${error.message}`);
            return res.status(500).json({ error: 'Erro ao buscar indicadores' });
        }
    }
};