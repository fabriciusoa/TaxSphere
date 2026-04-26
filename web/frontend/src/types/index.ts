export interface Usuario {
  id: number;
  nome: string;
  email: string;
  cpf: string;
  status: boolean;
  criado?: string | null;
  dt_inativacao?: string | null;
  dt_nascimento?: string | null;
  dt_ativacao?: string | null;
  ultimo_login?: string | null;
  tentativas_login?: number;
  dt_bloqueio?: string | null;
  cliente_id?: number | null;
}

export interface Parametro {
  id: number;
  chave: string;
  valor: string;
  descricao: string | null;
  updated_at: string;
}

export interface LoginLog {
  id: number;
  usuario_id: number | null;
  usuario_nome: string | null;
  email_tentativa: string;
  sucesso: 'sim' | 'nao';
  ip_address: string | null;
  user_agent: string | null;
  motivo_falha: string | null;
  timestamp: string;
}

export interface LoginResponse {
  // token removido em SEC-04: agora é cookie httpOnly, não retornado no body
  user: Usuario;
}

export interface LoginLogPaginado {
  data: LoginLog[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface Empresas {
  id: number;
  id_usuario_responsavel: number;
  cliente_id: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string;
  inscricao_estadual?: string;
  matriz?: 'S' | 'N';
  regime_tributario: string;
  uf?: string;
  municipio?: string;
  ativo: number;
  criado_em: string;
  atualizado_em: string;
  endereco: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  cnae: number | null;
  inscricao_municipal: string | null;
  certificado_id: number | null;
}

export interface Cliente {
  id: number;
  cnpj: string;
  razao_social: string;
  nome_fantasia?: string | null;
  inscricao_estadual?: string | null;
  matriz: 'S' | 'N';
  regime_tributario: 'Simples Nacional' | 'Lucro Presumido' | 'Lucro Real';
  endereco?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  municipio?: string | null;
  uf?: string | null;
  cep?: string | null;
  ativo: number;
  criado_em: string;
  atualizado_em: string;
}

// ============================================
// TIPOS PARA PERFIS DE ACESSO
// ============================================

export interface SysFuncionalidade {
  id: number;
  funcionalidade: string;
}

export interface SysModulo {
  id: number;
  modulo: string;
  funcionalidades: SysFuncionalidade[];
}

export interface PerfilPermissao {
  id?: number;
  funcionalidade_id: number;
  inserir: boolean;
  alterar: boolean;
  consultar: boolean;
  excluir: boolean;
}

export interface Perfil {
  id: number;
  perfil: string;
  adm_system: boolean;
  cliente_id: number | null;
  cliente_nome?: string | null;
  created_at: string;
  excluded_at?: string | null;
  permissoes?: PerfilPermissao[];
}

// ============================================
// TIPOS PARA SISTEMA DE CHAMADOS
// ============================================

// Tipos literais para enums
export type StatusChamado = 
  | 'Aberto' 
  | 'Em Andamento' 
  | 'Aguardando Resposta'
  | 'Resolvido'
  | 'Fechado'
  | 'Cancelado';

export type CategoriaChamado =
  | 'Problema Técnico'
  | 'Dúvida'
  | 'Sugestão'
  | 'Erro no Sistema'
  | 'Solicitação de Funcionalidade';

export type PrioridadeChamado = 
  | 'Baixa'
  | 'Normal'
  | 'Alta'
  | 'Urgente';

// Interface principal de Chamado
export interface Chamado {
  id: number;
  id_usuario: number;
  titulo: string;
  descricao: string;
  categoria: CategoriaChamado;
  prioridade: PrioridadeChamado;
  status: StatusChamado;
  id_usuario_atribuido: number | null;
  criado_em: string;
  atualizado_em: string;
  fechado_em: string | null;
  // Campos de JOIN
  usuario_nome?: string;
  usuario_email?: string;
  atribuido_nome?: string;
}

// Interface de Comentário
export interface ChamadoComentario {
  id: number;
  id_chamado: number;
  id_usuario: number;
  nome_usuario: string;
  comentario: string;
  criado_em: string;
  // Campos de JOIN
  usuario_nome?: string;
  usuario_email?: string;
  // Array de anexos (nested)
  anexos?: ChamadoAnexo[];
}

// Interface de Anexo
export interface ChamadoAnexo {
  id: number;
  id_chamado_comentario: number;
  nome_arquivo: string;
  tipo_arquivo: string;
  tamanho_bytes: number;
  // Retornados como base64 no JSON (padrão igual ao logo do MeuPerfil)
  thumbnail_base64?: string | null;
  preview_base64?: string | null;
}

// DTOs para criação e atualização
export interface CriarChamadoDTO {
  titulo: string;
  descricao: string;
  categoria: CategoriaChamado;
  prioridade: PrioridadeChamado;
}

export interface AtualizarChamadoDTO {
  titulo?: string;
  descricao?: string;
  categoria?: CategoriaChamado;
  prioridade?: PrioridadeChamado;
  status?: StatusChamado;
  id_usuario_atribuido?: number | null;
}

export interface CriarComentarioDTO {
  comentario: string;
}

// Interfaces para Dashboard/Estatísticas
export interface EstatisticasChamados {
  total_chamados: number;
  abertos: number;
  em_andamento: number;
  resolvidos: number;
  fechados: number;
  tempo_medio_resolucao_horas: number | null;
  criados_hoje: number;
  resolvidos_hoje: number;
}

export interface ChamadoPorStatus {
  status: StatusChamado;
  total: number;
}

export interface ChamadoPorCategoria {
  categoria: CategoriaChamado;
  total: number;
}

export interface TopUsuarioChamados {
  id: number;
  nome: string;
  email: string;
  total_chamados: number;
  abertos: number;
  resolvidos: number;
}

export interface DashboardChamados {
  estatisticas: EstatisticasChamados;
  por_status: ChamadoPorStatus[];
  por_categoria: ChamadoPorCategoria[];
  top_usuarios: TopUsuarioChamados[];
}

// ============================================
// TIPOS PARA NCM (NOMENCLATURA COMUM MERCOSUL)
// ============================================

export interface NcmTabela {
  id: number;
  created_at: string;
  updated_at: string | null;
  codigo: string;
  descricao: string;
  dt_inicio: string | null;
  dt_fim: string | null;
  ato_legal: string | null;
  numero: string | null;
  ano: number | null;
  status: boolean;
  dt_atualizacao: string | null;
}