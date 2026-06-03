import api from './api';

export interface AutomacaoConfigGlobal {
  id: number;
  ativo: boolean;
  horario_diario: string;        // 'HH:MM'
  atualizado_em: string | null;
}

export interface AutomacaoConfigEmpresa {
  id: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  sync_documentos_ativo: boolean;
  baixar_recibos_ativo: boolean;
  baixar_documentos_ativo: boolean;
  sync_saldos_ativo: boolean;
  ultima_execucao: string | null;
  ultima_execucao_status: 'concluido' | 'erro' | 'em_andamento' | null;
  ultima_execucao_msg: string | null;
  tem_certificado_ativo: boolean;
  tem_sessao_ecac: boolean;
}

export interface AutomacaoConfigResponse {
  global: AutomacaoConfigGlobal;
  empresas: AutomacaoConfigEmpresa[];
}

export const perdcompAutomacaoService = {
  obterConfig: async (): Promise<AutomacaoConfigResponse> => {
    const { data } = await api.get('/perdcomp/automacao/config');
    return data;
  },

  atualizarGlobal: async (payload: { ativo: boolean; horario_diario: string }): Promise<void> => {
    await api.put('/perdcomp/automacao/global', payload);
  },

  atualizarEmpresa: async (idEmpresa: number, flags: {
    sync_documentos_ativo: boolean;
    baixar_recibos_ativo: boolean;
    baixar_documentos_ativo: boolean;
    sync_saldos_ativo: boolean;
  }): Promise<void> => {
    await api.put(`/perdcomp/automacao/empresa/${idEmpresa}`, flags);
  },

  /** Dispara execução manual: idEmpresa=null → todas; idEmpresa=N → só essa */
  executarAgora: async (idEmpresa?: number | null): Promise<{ ok: boolean; message: string }> => {
    const path = idEmpresa
      ? `/perdcomp/automacao/executar-agora/${idEmpresa}`
      : `/perdcomp/automacao/executar-agora`;
    const { data } = await api.post(path);
    return data;
  },

  pausar: async (idEmpresa: number): Promise<void> => {
    await api.post(`/perdcomp/automacao/pausar/${idEmpresa}`);
  },

  retomar: async (idEmpresa: number): Promise<void> => {
    await api.post(`/perdcomp/automacao/retomar/${idEmpresa}`);
  },

  cancelar: async (idEmpresa: number): Promise<void> => {
    await api.post(`/perdcomp/automacao/cancelar/${idEmpresa}`);
  },
};
