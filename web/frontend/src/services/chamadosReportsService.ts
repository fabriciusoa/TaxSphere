import api from './api';
import type { DashboardChamados, EstatisticasChamados } from '../types';

const chamadosReportsService = {
  /**
   * Buscar dashboard completo para administradores
   */
  buscarDashboardAdmin: async (): Promise<DashboardChamados> => {
    const response = await api.get<DashboardChamados>('/chamados/admin/dashboard');
    return response.data;
  },

  /**
   * Buscar estatísticas do usuário logado
   */
  buscarMinhasEstatisticas: async (): Promise<EstatisticasChamados> => {
    const response = await api.get<EstatisticasChamados>('/chamados/minhas-estatisticas');
    return response.data;
  },
};

export default chamadosReportsService;
