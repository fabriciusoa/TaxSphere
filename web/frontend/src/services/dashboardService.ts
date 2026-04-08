import api from './api';

export interface DashboardIndicadores {
  qtdePacientes: number;
  qtdeAgendamentosHoje: number;
  totalReceitasMes: number;
  totalDespesasMes: number;
  taxaOcupacao: number;
  proximosAgendamentos: Array<{
    data_inicio: string;
    paciente_nome: string;
  }>;
  aniversariantesDoDia: Array<{
    nome: string;
    dt_nascimento: string;
  }>;
  contasVencer: Array<{
    tipo_conta: string;
    forma_pgto: string;
    descricao: string;
    valor: number;
    dt_vencimento: string;
  }>;
}

export const dashboardService = {
  indicadores: async (): Promise<DashboardIndicadores> => {
    const response = await api.get<DashboardIndicadores>('/dashboard/indicadores');
    return response.data;
  },
};