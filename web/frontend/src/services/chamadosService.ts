import api from './api';
import type {
  Chamado,
  ChamadoComentario,
  CriarChamadoDTO,
  AtualizarChamadoDTO,
  StatusChamado,
  CategoriaChamado,
  PrioridadeChamado,
} from '../types';

interface FiltrosChamados {
  status?: StatusChamado;
  categoria?: CategoriaChamado;
  prioridade?: PrioridadeChamado;
  busca?: string;
  page?: number;
  limit?: number;
}

interface ListarChamadosResponse {
  data: Chamado[];
  total: number;
  page: number;
  limit: number;
}

export const chamadosService = {
  /**
   * Listar chamados com filtros e paginação
   */
  listar: async (filtros?: FiltrosChamados): Promise<ListarChamadosResponse> => {
    const params = new URLSearchParams();
    
    if (filtros?.status) params.append('status', filtros.status);
    if (filtros?.categoria) params.append('categoria', filtros.categoria);
    if (filtros?.prioridade) params.append('prioridade', filtros.prioridade);
    if (filtros?.busca) params.append('busca', filtros.busca);
    if (filtros?.page) params.append('page', filtros.page.toString());
    if (filtros?.limit) params.append('limit', filtros.limit.toString());
    
    const response = await api.get<ListarChamadosResponse>(`/chamados?${params}`);
    return response.data;
  },

  /**
   * Buscar chamado por ID
   */
  buscarPorId: async (id: number): Promise<Chamado> => {
    const response = await api.get<Chamado>(`/chamados/${id}`);
    return response.data;
  },

  /**
   * Criar novo chamado
   */
  criar: async (data: CriarChamadoDTO): Promise<{ id: number; message: string }> => {
    const response = await api.post<{ id: number; message: string }>('/chamados', data);
    return response.data;
  },

  /**
   * Atualizar chamado
   */
  atualizar: async (id: number, data: AtualizarChamadoDTO): Promise<{ message: string }> => {
    const response = await api.put<{ message: string }>(`/chamados/${id}`, data);
    return response.data;
  },

  /**
   * Deletar chamado
   */
  deletar: async (id: number): Promise<{ message: string }> => {
    const response = await api.delete<{ message: string }>(`/chamados/${id}`);
    return response.data;
  },

  /**
   * Listar comentários de um chamado
   */
  listarComentarios: async (idChamado: number): Promise<ChamadoComentario[]> => {
    const response = await api.get<ChamadoComentario[]>(`/chamados/${idChamado}/comentarios`);
    return response.data;
  },

  /**
   * Criar comentário
   */
  criarComentario: async (idChamado: number, data: { comentario: string }): Promise<{ id: number; message: string }> => {
    const response = await api.post<{ id: number; message: string }>(
      `/chamados/${idChamado}/comentarios`,
      data
    );
    return response.data;
  },

  /**
   * Upload de múltiplos anexos
   */
  uploadAnexos: async (
    idComentario: number,
    files: File[],
    onUploadProgress?: (progressEvent: any) => void
  ): Promise<{ message: string; results: any[]; errors?: any[] }> => {
    const formData = new FormData();
    formData.append('idComentario', idComentario.toString());
    
    files.forEach(file => {
      formData.append('anexos', file);
    });

    const response = await api.post(
      '/chamados/comentarios/anexos',
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress,
      }
    );

    return response.data;
  },

  /**
   * Obter URL do thumbnail de um anexo
   */
  getThumbnailUrl: (idAnexo: number): string => {
    return `/api/chamados/anexos/${idAnexo}?version=thumbnail`;
  },

  /**
   * Obter URL do preview de um anexo
   */
  getPreviewUrl: (idAnexo: number): string => {
    return `/api/chamados/anexos/${idAnexo}?version=preview`;
  },

  /**
   * Download de anexo
   */
  downloadAnexo: async (idAnexo: number, nomeArquivo: string): Promise<void> => {
    const response = await api.get(`/chamados/anexos/${idAnexo}`, {
      responseType: 'blob',
    });

    // Criar URL temporária e fazer download
    const url = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // Limpar URL após pequeno delay
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 100);
  },
};

export default chamadosService;
