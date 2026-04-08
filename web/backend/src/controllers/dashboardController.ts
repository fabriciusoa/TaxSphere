import { Request, Response } from 'express';
import { getOne, getAll } from '../database/connection';
import { AuthRequest } from '../types';
import { log } from '../utils/logger';

export const dashboardController = {
    // Buscar indicadores do dashboard
    indicadores: async (req: AuthRequest, res: Response) => {
        try {
            const id_usuario = req.user?.id;

            if (!id_usuario) {
                return res.status(401).json({ error: 'Não autorizado' });
            }

            // Qtde Pacientes
            const pacientesResult = await getOne<{ qtde: number }>(
                'SELECT COUNT(*) AS qtde FROM paciente WHERE id_usuario = ?',
                [id_usuario]
            );
            const qtdePacientes = pacientesResult?.qtde || 0;

            // Qtde Agendamentos Hoje
            const hoje = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            const agendamentosHojeResult = await getOne<{ qtde: number }>(
                "SELECT COUNT(*) AS qtde FROM agendamento WHERE status = 'Confirmado' AND strftime('%Y-%m-%d', data_inicio) = strftime('%Y-%m-%d', datetime('now', 'localtime'))  AND id_usuario = ?",
                [id_usuario]
            );
            const qtdeAgendamentosHoje = agendamentosHojeResult?.qtde || 0;

            // Receitas do Mês
            const receitasMesResult = await getOne<{ total_receita: number }>(
                "SELECT SUM(valor) AS total_receita FROM lancamentos_financeiros WHERE id_usuario = ? AND status = ? AND strftime('%Y-%m', data_servico) = strftime('%Y-%m', ?)",
                [id_usuario, 'Recebido', hoje]
            );
            const totalReceitasMes = receitasMesResult?.total_receita || 0;

            // Despesas do Mês
            const despesasMesResult = await getOne<{ total_despesa: number }>(
                "SELECT SUM(valor) AS total_despesa FROM contas_pagar WHERE id_usuario = ? AND status <> ? AND strftime('%Y-%m', dt_vencimento) = strftime('%Y-%m', ?)",
                [id_usuario, 'Cancelado', hoje]
            );
            const totalDespesasMes = despesasMesResult?.total_despesa || 0;

            // Taxa de Ocupação
            const agendamentosMesResult = await getOne<{ qtde: number }>(
                "SELECT COUNT(*) AS qtde FROM agendamento WHERE status = ? AND strftime('%Y-%m', data_inicio) = strftime('%Y-%m', ?) AND id_usuario = ?",
                ['Confirmado', hoje, id_usuario]
            );
            const qtdeAgendamentosMes = agendamentosMesResult?.qtde || 0;

            // Calcular total de slots disponíveis no mês baseado na disponibilidade
            const mesAtual = new Date().getMonth() + 1; // 1-12
            const anoAtual = new Date().getFullYear();            
            const diasNoMes = new Date(anoAtual, mesAtual, 0).getDate();
            const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
            let totalSlots = 0;

            for (let dia = 1; dia <= diasNoMes; dia++) {
                const data = new Date(anoAtual, mesAtual - 1, dia);
                const diaSemanaIndex = data.getDay(); // 0=Domingo, 6=Sábado
                const diaSemana = diasSemana[diaSemanaIndex];

                // Contar quantas sessoes por dia conforme disponibilidade
                const slotsQtdeSessoesDia = await getOne<{ qtde_sessoes: number }>(
                    `SELECT sum((substr(d.tempo_fim,1,2) - substr(d.tempo_inicio,1,2))*60/(up.duracao_sessao + up.tempo_entre_sessao )) qtde_sessoes
                       FROM disponibilidade d,
                            usuario_parametros up 
                       WHERE d.id_usuario = ? 
                         AND d.dia_semana = ? 
                         AND d.ativo = 1
                         and d.id_usuario = up.id_usuario`,
                    [id_usuario, diaSemana]
                );
                totalSlots += slotsQtdeSessoesDia?.qtde_sessoes || 0;
            }

            const taxaOcupacao = totalSlots > 0 ? (qtdeAgendamentosMes / totalSlots) * 100 : 0;

            // Próximos 3 agendamentos
            const proximosAgendamentos = await getAll<any>(
                `SELECT a.data_inicio, p.nome as paciente_nome
                 FROM agendamento a
                 JOIN paciente p ON a.id_paciente = p.id
                 WHERE a.status = 'Confirmado'
                   AND a.id_usuario = ? 
                   AND strftime('%Y-%m-%d', data_fim) = strftime('%Y-%m-%d', datetime('now', 'localtime'))
                   AND datetime(a.data_inicio) >= datetime('now', 'localtime')
                 ORDER BY a.data_inicio ASC
                 LIMIT 3`,
                [id_usuario]
            );

            // Aniversariantes do dia
            const aniversariantesDoDia = await getAll<any>(
                `SELECT nome, dt_nascimento
                 FROM paciente
                 WHERE id_usuario = ?
                   AND strftime('%m-%d', dt_nascimento) = strftime('%m-%d', datetime('now', 'localtime'))
                 ORDER BY nome ASC`,
                [id_usuario]
            );

            // Aniversariantes do dia
            const contasVencer = await getAll<any>(
                `SELECT tc.descricao tipo_conta, 
                        fp.descricao forma_pgto,
                        cp.descricao,
                        cp.valor,
                        cp.dt_vencimento
                    FROM contas_pagar cp,
                        tipo_conta tc,
                        formas_pagamento fp 
                    WHERE cp.id_tipo_conta = tc.id 
                    and cp.id_usuario = tc.id_usuario
                    and cp.id_forma_pagamento = fp.id 
                    and cp.id_usuario = ?
                    AND cp.status = 'Aberto'
                    AND strftime('%Y-%m', cp.dt_vencimento) <= strftime('%Y-%m', datetime('now', '+15 days'))
                    order by cp.dt_vencimento ASC`,
                [id_usuario]
            );

            return res.json({
                qtdePacientes,
                qtdeAgendamentosHoje,
                totalReceitasMes,
                totalDespesasMes,
                taxaOcupacao: Math.round(taxaOcupacao * 100) / 100, // Arredondar para 2 casas
                proximosAgendamentos,
                aniversariantesDoDia,
                contasVencer
            });
        } catch (error: any) {
            log.error(`Erro ao buscar indicadores do dashboard: ${error.message}`);
            return res.status(500).json({ error: 'Erro ao buscar indicadores' });
        }
    }
};