import api from './api';

// ── Tipos ────────────────────────────────────────────────────────────────────
// Situações conforme Manual DCTFWeb cap. 8.4
export type SituacaoNormalizada = 'EM_ANDAMENTO' | 'ATIVA' | 'RETIFICADA' | 'EXCLUIDA' | 'INDEVIDA' | 'FASEAMENTO'
                                  // Compat — situações antigas
                                  | 'EM_EDICAO' | 'TRANSMITIDA' | 'ACEITA' | 'REJEITADA' | 'SEM_MOVIMENTO' | 'DESCONHECIDA';

export type CategoriaDctfweb = 'GERAL' | 'GERAL_PF' | 'DECIMO_TERCEIRO' | 'DECIMO_TERCEIRO_PF' | 'ESPETACULO_DESPORTIVO' | 'AFERICAO' | 'RECLAMATORIA_TRABALHISTA';
export type TipoDctfweb = 'ORIGINAL' | 'RETIFICADORA' | 'EXCLUSAO';
export type SubtipoDctfweb = 'COM_DEBITOS' | 'SEM_DEBITOS_ZERADA' | 'SEM_MOVIMENTO';
export type OrigemDebito = 'ESOCIAL' | 'REINF_CP' | 'REINF_RET' | 'MIT' | 'SERO';

// Labels conforme manual
export const SITUACAO_LABELS: Record<string, string> = {
  EM_ANDAMENTO: 'Em andamento', ATIVA: 'Ativa', RETIFICADA: 'Retificada',
  EXCLUIDA: 'Excluída', INDEVIDA: 'Indevida', FASEAMENTO: 'Faseamento',
  // compat
  EM_EDICAO: 'Em Edição', TRANSMITIDA: 'Transmitida', ACEITA: 'Aceita',
  REJEITADA: 'Rejeitada', SEM_MOVIMENTO: 'Sem Movimento', DESCONHECIDA: 'Desconhecida',
};
export const CATEGORIA_LABELS: Record<CategoriaDctfweb, string> = {
  GERAL: 'Geral', GERAL_PF: 'Geral PF',
  DECIMO_TERCEIRO: '13º Salário', DECIMO_TERCEIRO_PF: '13º Salário PF',
  ESPETACULO_DESPORTIVO: 'Espetáculo Desportivo',
  AFERICAO: 'Aferição', RECLAMATORIA_TRABALHISTA: 'Reclamatória Trabalhista',
};
export const ORIGEM_LABELS: Record<OrigemDebito, string> = {
  ESOCIAL: 'eSocial', REINF_CP: 'EFD-Reinf CP', REINF_RET: 'EFD-Reinf RET',
  MIT: 'MIT', SERO: 'Sero',
};

export interface DctfwebDeclaracao {
  id: number;
  id_empresa: number;
  razao_social: string;
  cnpj: string;
  periodo_apuracao: string;
  categoria: string;
  tipo: string;
  situacao: string | null;
  situacao_normalizada: SituacaoNormalizada;
  numero_recibo: string | null;
  data_transmissao: string | null;
  data_recepcao: string | null;
  debito_apurado: number;
  credito_vinculado: number;
  saldo_pagar: number;
  divergencia: boolean;
  divergencia_motivo: string | null;
  tem_recibo: boolean;
  criado_em: string;
  atualizado_em: string;
}

export interface DctfwebDarf {
  id: number;
  id_empresa: number;
  razao_social: string;
  cnpj: string;
  codigo_receita: string;
  denominacao: string | null;
  periodo_apuracao: string;
  vencimento: string;
  principal: number;
  multa: number;
  juros: number;
  total: number;
  dias_para_vencer: number;
  status: 'PAGO' | 'PENDENTE' | 'VENCIDO';
  gerado: boolean;
  gerado_em: string | null;
  pago: boolean;
  pago_em: string | null;
  valor_pago: number | null;
}

export interface DctfwebDashboard {
  kpis: {
    total_declaracoes: number;
    taxa_transmissao: number;
    total_a_pagar: number;
    darfs_vencidos: number;
    valor_vencidos: number;
    darfs_a_vencer_7d: number; valor_a_vencer_7d: number;
    darfs_a_vencer_15d: number; valor_a_vencer_15d: number;
    darfs_a_vencer_30d: number; valor_a_vencer_30d: number;
    declaracoes_com_divergencia: number;
    // Novos (manual)
    declaracoes_em_andamento: number;
    declaracoes_impedem_cnd: number;
    valor_maed_pendente: number;
    total_esocial: number;
    total_reinf_cp: number;
    total_reinf_ret: number;
    total_mit: number;
    total_sero: number;
  };
  por_situacao: Array<{ chave: SituacaoNormalizada; label: string; total: number; valor: number }>;
  por_categoria: Array<{ chave: CategoriaDctfweb; label: string; total: number; valor: number }>;
  por_origem: Array<{ chave: OrigemDebito; label: string; descricao: string; total: number; valor: number }>;
  evolucao: Array<{ mes: string; total: number; valor: number }>;
  top_empresas_a_pagar: Array<{ id: number; razao_social: string; cnpj: string; qtd_declaracoes: number; total_a_pagar: number }>;
  proximos_vencimentos: Array<{
    id: number; id_empresa: number; razao_social: string; cnpj: string;
    codigo_receita: string; denominacao: string; periodo_apuracao: string;
    vencimento: string; total: number; dias_para_vencer: number;
  }>;
  // Painéis adicionados pelo manual
  alertas_cnd: Array<{
    id: number; id_empresa: number; razao_social: string; cnpj: string;
    periodo_apuracao: string; categoria: string; tipo: string;
    impede_cnd_motivo: string; dias_pendente: number;
  }>;
  proximos_prazos_legais: Array<{
    id: number; id_empresa: number; razao_social: string; cnpj: string;
    periodo_apuracao: string; categoria: string; tipo: string; situacao_normalizada: string;
    prazo_legal: string; debito_apurado: number; dias_para_prazo: number;
  }>;
  warning?: string;
}

export interface DctfwebAutomacaoEmpresa {
  id: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  sync_declaracoes_ativo: boolean;
  baixar_recibos_ativo: boolean;
  gerar_darf_ativo: boolean;
  alertar_vencimento_ativo: boolean;
  ultima_execucao: string | null;
  ultima_execucao_status: 'em_andamento' | 'concluido' | 'erro' | null;
  ultima_execucao_msg: string | null;
  tem_certificado_ativo: boolean;
  tem_sessao_ecac: boolean;
}

export interface DctfwebAutomacaoGlobal {
  id: number;
  ativo: boolean;
  horario_diario: string;
  dias_antes_vencimento_alertar: number;
  atualizado_em: string;
}

export interface ArquivoDctfweb {
  id: number;
  id_empresa: number;
  id_declaracao: number | null;
  id_darf: number | null;
  tipo: 'RECIBO_PDF' | 'DARF_PDF' | 'ESPELHO_XML' | 'COMPROVANTE_PDF';
  numero_recibo: string | null;
  numero_documento: string | null;
  periodo_apuracao: string | null;
  content_type: string | null;
  tamanho_bytes: number | null;
  sha256: string | null;
  fonte: 'RPA' | 'SERPRO_API' | 'UPLOAD';
  baixado_em: string;
}

// ── API ──────────────────────────────────────────────────────────────────────
export const dctfwebService = {
  dashboard: async (idEmpresa?: number): Promise<DctfwebDashboard> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/dctfweb/dashboard${params}`);
    return data;
  },

  listarDeclaracoes: async (filtros: {
    id_empresa?: number; situacao?: SituacaoNormalizada; periodo?: string;
    categoria?: string; busca?: string; page?: number; limit?: number;
  } = {}): Promise<{ data: DctfwebDeclaracao[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
    const { data } = await api.get(`/dctfweb/declaracoes?${params}`);
    return data;
  },

  buscarDeclaracao: async (id: number): Promise<DctfwebDeclaracao & { darfs: DctfwebDarf[] }> => {
    const { data } = await api.get(`/dctfweb/declaracoes/${id}`);
    return data;
  },

  criarDeclaracao: async (payload: Partial<DctfwebDeclaracao>): Promise<{ id: number }> => {
    const { data } = await api.post('/dctfweb/declaracoes', payload);
    return data;
  },

  atualizarDeclaracao: async (id: number, payload: Partial<DctfwebDeclaracao>): Promise<void> => {
    await api.put(`/dctfweb/declaracoes/${id}`, payload);
  },

  excluirDeclaracao: async (id: number): Promise<void> => {
    await api.delete(`/dctfweb/declaracoes/${id}`);
  },

  // DARFs
  listarDarfs: async (filtros: { id_empresa?: number; status?: 'pago' | 'pendente' | 'vencido'; page?: number; limit?: number } = {}):
    Promise<{ data: DctfwebDarf[]; pagination: { total: number; page: number; limit: number; totalPages: number } }> => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([k, v]) => { if (v !== undefined && v !== '') params.append(k, String(v)); });
    const { data } = await api.get(`/dctfweb/darfs?${params}`);
    return data;
  },

  gerarDarf: async (id: number): Promise<void> => { await api.post(`/dctfweb/darfs/${id}/gerar`); },
  marcarDarfPago: async (id: number, payload: { valor_pago?: number; pago_em?: string } = {}): Promise<void> => {
    await api.post(`/dctfweb/darfs/${id}/marcar-pago`, payload);
  },

  // Relatórios
  relatorioVencimentos: async (idEmpresa?: number, diasHorizonte = 60): Promise<{ data: any[] }> => {
    const params = new URLSearchParams({ dias_horizonte: String(diasHorizonte) });
    if (idEmpresa) params.append('id_empresa', String(idEmpresa));
    const { data } = await api.get(`/dctfweb/relatorios/vencimentos?${params}`);
    return data;
  },
  relatorioAtrasos: async (idEmpresa?: number): Promise<{ data: any[] }> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/dctfweb/relatorios/atrasos${params}`);
    return data;
  },
  projecaoCaixa: async (idEmpresa?: number): Promise<{ vencidos: number; proximos_30d: number; proximos_60d: number; proximos_90d: number; apos_90d: number }> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/dctfweb/relatorios/projecao-caixa${params}`);
    return data;
  },

  /** Relatório MAED (manual cap. 5) — declarações entregues em atraso ou pendentes além do prazo. */
  relatorioMaed: async (idEmpresa?: number): Promise<{ data: any[]; total_pendente: number }> => {
    const params = idEmpresa ? `?id_empresa=${idEmpresa}` : '';
    const { data } = await api.get(`/dctfweb/relatorios/maed${params}`);
    return data;
  },

  /** Resumo por origem dos débitos (manual cap. 8.2). */
  relatorioPorOrigem: async (idEmpresa?: number, periodo?: string): Promise<{ resumo: any; origens: Array<{ chave: string; label: string; valor: number }> }> => {
    const p = new URLSearchParams();
    if (idEmpresa) p.append('id_empresa', String(idEmpresa));
    if (periodo) p.append('periodo', periodo);
    const { data } = await api.get(`/dctfweb/relatorios/por-origem?${p}`);
    return data;
  },

  /** Prazos LEGAIS de entrega da declaração (cap. 4.2) — diferente de vencimento de DARF. */
  relatorioPrazos: async (idEmpresa?: number, diasHorizonte = 30): Promise<{ data: any[] }> => {
    const p = new URLSearchParams({ dias_horizonte: String(diasHorizonte) });
    if (idEmpresa) p.append('id_empresa', String(idEmpresa));
    const { data } = await api.get(`/dctfweb/relatorios/prazos-legais?${p}`);
    return data;
  },

  // ── Arquivos baixados ────────────────────────────────────────────────────
  /** Lista arquivos (recibo PDF, DARF PDF, espelho XML) já baixados de uma empresa. */
  listarArquivos: async (
    idEmpresa: number,
    filtros?: { tipo?: 'RECIBO_PDF' | 'DARF_PDF' | 'ESPELHO_XML'; numero_recibo?: string; numero_documento?: string; periodo_apuracao?: string }
  ): Promise<{ data: ArquivoDctfweb[]; storage_backend: 'fs' | 'supabase' }> => {
    const p = new URLSearchParams({ id_empresa: String(idEmpresa) });
    if (filtros?.tipo) p.append('tipo', filtros.tipo);
    if (filtros?.numero_recibo) p.append('numero_recibo', filtros.numero_recibo);
    if (filtros?.numero_documento) p.append('numero_documento', filtros.numero_documento);
    if (filtros?.periodo_apuracao) p.append('periodo_apuracao', filtros.periodo_apuracao);
    const { data } = await api.get(`/dctfweb/arquivos?${p}`);
    return data;
  },
  /** Constrói URL de download autenticado de um arquivo (uso direto em <a href> ou window.open). */
  urlDownloadArquivo: (idArquivo: number): string =>
    `${api.defaults.baseURL || ''}/dctfweb/arquivos/${idArquivo}/download`,

  // Agendamento
  obterConfig: async (): Promise<{ global: DctfwebAutomacaoGlobal | null; empresas: DctfwebAutomacaoEmpresa[]; warning?: string }> => {
    const { data } = await api.get('/dctfweb/automacao/config');
    return data;
  },
  atualizarGlobal: async (payload: { ativo: boolean; horario_diario: string; dias_antes_vencimento_alertar: number }): Promise<void> => {
    await api.put('/dctfweb/automacao/global', payload);
  },
  atualizarEmpresa: async (idEmpresa: number, flags: { sync_declaracoes_ativo: boolean; baixar_recibos_ativo: boolean; gerar_darf_ativo: boolean; alertar_vencimento_ativo: boolean }): Promise<void> => {
    await api.put(`/dctfweb/automacao/empresa/${idEmpresa}`, flags);
  },
  /**
   * Importa arquivos XML (eSocial S-1299, EFD-Reinf R-9000, recibo DCTFWeb) ou .zip.
   * Retorna contagem de processados / divergências.
   */
  importarXml: async (idEmpresa: number, arquivos: File[]): Promise<{
    processados: number; ignorados: number;
    erros: { arquivo: string; motivo: string }[];
    declaracoes_upsert: number; divergencias_detectadas: number;
  }> => {
    const form = new FormData();
    form.append('id_empresa', String(idEmpresa));
    for (const f of arquivos) form.append('arquivos', f);
    const { data } = await api.post('/dctfweb/importar-xml', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data;
  },

  /**
   * Destrava um pipeline que ficou preso em 'em_andamento' por crash do servidor.
   * NÃO interrompe execução real — só corrige o registro no banco.
   */
  destravarPipeline: async (idEmpresa: number): Promise<{ ok: boolean; destravado: boolean }> => {
    const { data } = await api.post(`/dctfweb/automacao/destravar/${idEmpresa}`);
    return data;
  },

  /** Sinaliza pausa para o pipeline em andamento (runner suspende ao fim da etapa atual). */
  pausar: async (idEmpresa: number): Promise<void> => {
    await api.post(`/dctfweb/automacao/pausar/${idEmpresa}`);
  },
  /** Retoma execução pausada. */
  retomar: async (idEmpresa: number): Promise<void> => {
    await api.post(`/dctfweb/automacao/retomar/${idEmpresa}`);
  },
  /** Cancela o pipeline — runner aborta na próxima etapa. */
  cancelar: async (idEmpresa: number): Promise<void> => {
    await api.post(`/dctfweb/automacao/cancelar/${idEmpresa}`);
  },

  executarAgora: async (idEmpresa: number | null): Promise<{ message: string }> => {
    const url = idEmpresa ? `/dctfweb/automacao/executar-agora/${idEmpresa}` : '/dctfweb/automacao/executar-agora';
    const { data } = await api.post(url);
    return data;
  },

  /**
   * Abre o navegador real com o certificado da empresa para o usuário resolver
   * o hCaptcha manualmente. Aguarda até 5 min e devolve quando cookies foram capturados.
   */
  renovarSessao: async (idEmpresa: number): Promise<{ ok: boolean; cookies_count: number; url_final: string }> => {
    const { data } = await api.post(`/dctfweb/sessao/renovar/${idEmpresa}`, undefined, { timeout: 6 * 60 * 1000 });
    return data;
  },
};
