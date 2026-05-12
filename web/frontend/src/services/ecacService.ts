import api from './api';

export type CertStatusType = 'ATIVO' | 'EXPIRANDO' | 'EXPIRADO' | 'REVOGADO';

export interface CertificadoDigital {
  id: number;
  id_empresa: number;
  nome: string;
  nome_arquivo: string;
  tipo: string;
  emitido_para: string;
  emitido_por: string;
  /** @deprecated use emitido_para */
  cn?: string;
  /** @deprecated use emitido_por */
  emissor?: string;
  serial_number: string;
  validade_de: string;
  validade_ate: string;
  ativo: boolean;
  status: CertStatusType;
  sessao_ativa: boolean;
  senha_configurada: boolean;
  ultimo_uso: string | null;
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
    documentos_extraidos?: number;
    paginas?: number;
    importados?: number;
    atualizados?: number;
    ignorados?: number;
    /** @deprecated */
    declaracoes?: number;
    creditos_extraidos?: number;
    debitos_extraidos?: number;
  };
}

export interface EcacPerdcompDocumento {
  id: number;
  id_empresa: number;
  id_sincronizacao: number | null;
  numero: string;
  tipo_documento: string | null;
  tipo_credito: string | null;
  periodo_apuracao: string | null;
  data_entrega: string | null;
  status_ecac: string | null;
  orig_retif: string | null;
  // Campos extraídos do recibo PDF
  numero_perdcomp_inicial: string | null;
  numero_recibo: string | null;
  data_transmissao: string | null;
  oriundo_acao_judicial: boolean | null;
  valor_pedido: number | null;
  valor_saldo_negativo: number | null;
  selic_acumulada: number | null;
  credito_atualizado: number | null;
  credito_original_data_entrega: number | null;
  saldo_credito_original: number | null;
  credito_original_utilizado: number | null;
  total_debitos_dcomp: number | null;
  forma_apuracao: string | null;
  forma_tributacao: string | null;
  exercicio: string | null;
  periodo_inicial: string | null;
  periodo_final: string | null;
  responsavel_nome: string | null;
  responsavel_cpf: string | null;
  recibo_baixado_em: string | null;
  recibo_parse_status: 'OK' | 'ERRO' | null;
  recibo_parse_erro: string | null;
  tem_recibo: boolean;
  // Etapas C/D/E
  status_normalizado: string | null;
  id_documento_retificado: number | null;
  retificado_por_id: number | null;
  numero_retificador: string | null;
  id_perdcomp_sistema: number | null;
  vinculado_sistema: boolean;
  criado_em: string;
  atualizado_em: string;
  razao_social?: string;
  cnpj?: string;
}

export interface EcacDebitoCompensado {
  id: number;
  id_documento: number;
  ordem: number;
  cnpj_detentor: string | null;
  codigo_receita: string | null;
  denominacao_receita: string | null;
  grupo_tributo: string | null;
  periodicidade: string | null;
  periodo_apuracao: string | null;
  data_vencimento: string | null;
  principal: number;
  multa: number;
  juros: number;
  total: number;
  controlado_em_processo: boolean;
}

export const ecacService = {
  certificados: {
    listar: async (): Promise<CertificadoDigital[]> => {
      const { data } = await api.get('/ecac/certificados');
      return data;
    },

    upload: async (file: File, idEmpresa: number, senhaCertificado: string, nome?: string): Promise<CertificadoDigital> => {
      const formData = new FormData();
      formData.append('certificado', file);
      formData.append('id_empresa', String(idEmpresa));
      formData.append('senha_certificado', senhaCertificado);
      if (nome) formData.append('nome', nome);
      const { data } = await api.post('/ecac/certificados', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },

    validarArquivo: async (file: File, senhaCertificado: string): Promise<{ valid: boolean; info?: CertificadoInfo; error?: string }> => {
      const formData = new FormData();
      formData.append('certificado', file);
      formData.append('senha_certificado', senhaCertificado);
      const { data } = await api.post('/ecac/certificados/validar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return data;
    },

    validar: async (id: number): Promise<{ id: number; valido: boolean; status: CertStatusType; diasRestantes: number; validoAte: string }> => {
      const { data } = await api.get(`/ecac/certificados/${id}/validar`);
      return data;
    },

    autenticar: async (id: number): Promise<{ message: string; tipo: string }> => {
      const { data } = await api.post(`/ecac/certificados/${id}/autenticar`);
      return data;
    },

    excluir: async (id: number): Promise<void> => {
      await api.delete(`/ecac/certificados/${id}`);
    },

    atualizarSenha: async (id: number, senha: string): Promise<void> => {
      await api.patch(`/ecac/certificados/${id}/senha`, { senha_certificado: senha });
    },

    limparSessao: async (id: number): Promise<void> => {
      await api.delete(`/ecac/certificados/${id}/sessao`);
    },

    instalarCertificado: async (id: number): Promise<{ message: string; loginUrl: string; edgeAberto?: boolean }> => {
      const { data } = await api.post(`/ecac/certificados/${id}/instalar-certificado`);
      return data;
    },

    capturarSessaoEdge: async (id: number): Promise<{ message: string; cookiesCount: number }> => {
      const { data } = await api.post(`/ecac/certificados/${id}/capturar-sessao-edge`);
      return data;
    },

    statusSessao: async (id: number): Promise<{ sessao_ativa: boolean; senha_configurada: boolean }> => {
      const { data } = await api.get(`/ecac/certificados/${id}/sessao`);
      return data;
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

    /** Importa documentos PER/DCOMP do e-CAC usando a sessão previamente autenticada */
    importarAutomatico: async (idEmpresa: number, tipo?: string): Promise<{ sync_id: number; message: string }> => {
      const { data } = await api.post('/ecac/importar-automatico', {
        id_empresa: idEmpresa,
        tipo: tipo || 'perdcomp',
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

    ativa: async (idEmpresa: number, tipo?: string): Promise<SincronizacaoStatus | null> => {
      const params = new URLSearchParams({ id_empresa: String(idEmpresa) });
      if (tipo) params.set('tipo', tipo);
      const { data } = await api.get(`/ecac/sincronizacoes/ativa?${params.toString()}`);
      return data;
    },

    pausar: async (syncId: number): Promise<void> => {
      await api.post(`/ecac/sincronizacoes/${syncId}/pausar`);
    },
    retomar: async (syncId: number): Promise<void> => {
      await api.post(`/ecac/sincronizacoes/${syncId}/retomar`);
    },
    cancelar: async (syncId: number): Promise<void> => {
      await api.post(`/ecac/sincronizacoes/${syncId}/cancelar`);
    },

    /**
     * Inicia a sincronização de saldos_credito + movimentações em background.
     * Retorna o sync_id que deve ser consultado via `status(syncId)` para acompanhar progresso.
     */
    sincronizarSaldos: async (idEmpresa: number): Promise<{ sync_id: number; message: string }> => {
      const { data } = await api.post('/ecac/sincronizar-saldos', { id_empresa: idEmpresa });
      return data;
    },
  },

  perdcompDocumentos: {
    listar: async (idEmpresa?: number): Promise<EcacPerdcompDocumento[]> => {
      const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
      const { data } = await api.get(`/ecac/perdcomp-documentos${params}`);
      return data;
    },

    debitosCompensados: async (id: number): Promise<EcacDebitoCompensado[]> => {
      const { data } = await api.get(`/ecac/perdcomp-documentos/${id}/debitos`);
      return data;
    },

    /** URL para abrir o PDF do recibo no navegador (em nova aba). */
    reciboPdfUrl: (id: number): string => `/api/ecac/perdcomp-documentos/${id}/recibo.pdf`,

    /** Inicia o download em lote dos PDFs de recibo (background). */
    baixarRecibos: async (idEmpresa: number, somentePendentes = true): Promise<{ sync_id: number; total: number; message: string }> => {
      const { data } = await api.post('/ecac/baixar-recibos', {
        id_empresa: idEmpresa,
        somente_pendentes: somentePendentes,
      });
      return data;
    },
  },
};
