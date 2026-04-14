import api from './api';

export interface DashboardIndicadores {
  qtdeChamadosAbertos: number;
  qtdeChamadosTotal: number;
  qtdeAssinaturasAtivas: number;
  qtdeUsuariosAtivos: number;
}

export const dashboardService = {
  indicadores: async (): Promise<DashboardIndicadores> => {
    const response = await api.get<DashboardIndicadores>('/dashboard/indicadores');
    return response.data;
  },
};