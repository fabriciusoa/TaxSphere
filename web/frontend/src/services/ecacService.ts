import api from './api';

export interface CertificadoDigital {
  id: number;
  id_empresa: number;
  nome_arquivo: string;
  tipo: string;
  cn: string;
  emissor: string;
  serial_number: string;
  validade_de: string;
  validade_ate: string;
  ativo: boolean;
  criado_em: string;
  razao_social?: string;
  cnpj?: string;
  info?: CertificadoInfo;
}

export interface CertificadoInfo {
  cn: string;
  emissor: string;
  serialNumber: string;
  validadeDe: string;
  validadeAte: string;
  expirado: boolean;
  diasRestantes: number;
}

export interface SincronizacaoStatus {
  id: number;
  id_empresa: number;
  tipo: string;
  status: 'pendente' | 'em_andamento' | 'concluido' | 'erro' | 'cancelado';
  creditos_importados: number;
  debitos_importados: number;
  registros_ignorados: number;
  erro_mensagem: string | null;
  iniciado_em: string;
  concluido_em: string | null;
  razao_social?: string;
  cnpj?: string;
  detalhes?: {
    progresso: number;
    mensagem: string;
    declaracoes?: number;
    creditos_extraidos?: number;
    debitos_extraidos?: number;
  };
}

export const ecacService = {
  certificados: {
    listar: async (): Promise<CertificadoDigital[]> => {
      const { data } = await api.get('/ecac/certificados');
      return data;
    },

    upload: async (file: File, idEmpresa: number, senhaCertificado: string): Promise<CertificadoDigital> => {
      const formData = new FormData();
      formData.append('certificado', file);
      formData.append('id_empresa', String(idEmpresa));
      formData.append('senha_certificado', senhaCertificado);
      const { data } = await api.post('/ecac/certificados', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },

    validar: async (file: File, senhaCertificado: string): Promise<{ valid: boolean; info?: CertificadoInfo; error?: string }> => {
      const formData = new FormData();
      formData.append('certificado', file);
      formData.append('senha_certificado', senhaCertificado);
      const { data } = await api.post('/ecac/certificados/validar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },

    excluir: async (id: number): Promise<void> => {
      await api.delete(`/ecac/certificados/${id}`);
    },
  },

  sincronizacao: {
    iniciar: async (idEmpresa: number, senhaCertificado: string, tipo?: string): Promise<{ sync_id: number; message: string }> => {
      const { data } = await api.post('/ecac/sincronizar', {
        id_empresa: idEmpresa,
        senha_certificado: senhaCertificado,
        tipo: tipo || 'completa',
      });
      return data;
    },

    status: async (syncId: number): Promise<SincronizacaoStatus> => {
      const { data } = await api.get(`/ecac/sincronizacoes/${syncId}`);
      return data;
    },

    historico: async (idEmpresa?: number): Promise<SincronizacaoStatus[]> => {
      const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
      const { data } = await api.get(`/ecac/sincronizacoes${params}`);
      return data;
    },
  },
};
