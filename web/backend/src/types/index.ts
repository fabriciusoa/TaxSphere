import { Request } from 'express';

export interface Usuario {
  id: number;
  email: string;
  cpf: string;
  nome: string;
  senha: string;
  perfil: number;
  status: string;
  criado: string;
  dt_inativacao: string | null;
  dt_nascimento: string | null;
  dt_ativacao: string | null;
  ultimo_login: string | null;
  tentativas_login: number;
  dt_bloqueio: string | null;
}

export interface UsuarioResponse extends Omit<Usuario, 'senha' | 'perfil'> {
  perfil: string;
  perfil_id: number;
}

export interface Perfil {
  id: number;
  perfil: string;
}

export interface Parametro {
  id: number;
  chave: string;
  valor: string;
  descricao: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoginLog {
  id: number;
  usuario_id: number | null;
  email_tentativa: string;
  sucesso: 'sim' | 'nao';
  ip_address: string | null;
  user_agent: string | null;
  motivo_falha: string | null;
  timestamp: string;
}

export interface JWTPayload {
  id: number;
  email: string;
  perfil: string;
  perfil_id: number;
  nome?: string;
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

export enum PerfilEnum {
  ADMIN = 'ADMIN',
  MEDICO = 'MEDICO',
  GERENTE = 'GERENTE',
  RELATORIO = 'RELATORIO'
}

export enum StatusUsuario {
  ATIVO = 'ativo',
  INATIVO = 'inativo'
}

// ============================================
// TIPOS E INTERFACES DO SISTEMA DE AGENDA
// ============================================

// Status possíveis de um agendamento
export type StatusAgendamento = 
  | 'Agendado' 
  | 'Confirmado' 
  | 'Cancelado' 
  | 'Realizado' 
  | 'Faltou' 
  | 'Reagendado';

// Tipos de consulta disponíveis
export type TipoConsulta = 
  | 'Consulta' 
  | 'Retorno' 
  | 'Avaliação' 
  | 'Sessão' 
  | 'Outro';

// Tipos de notificação
export type TipoNotificacao = 
  | 'EMAIL' 
  | 'WHATSAPP';

// Status de notificação
export type StatusNotificacao = 
  | 'Pendente' 
  | 'Enviado' 
  | 'Falha';

// Interface completa de um agendamento (do banco de dados)
export interface Agendamento {
  id: number;
  id_usuario: number;
  id_paciente: number;
  data_inicio: string;
  data_fim: string;
  tipo: TipoConsulta;
  status: StatusAgendamento;
  notas?: string | null;
  token_confirmacao: string;
  token_remarcar: string;
  token_cancelar: string;
  token_expiracao: string;
  confirmado_em?: string | null;
  motivo_cancelamento?: string | null;
  id_agendamento_original?: number | null;
  ultima_tentativa_notificacao?: string | null;
  criado_em: string;
  atualizado_em: string;
  // Campos de JOIN (quando buscar com dados relacionados)
  paciente_nome: string;
  paciente_email: string;
  usuario_nome?: string;
  tipo_consulta?: string;
}

// DTO para criar/atualizar agendamento (usado nas requisições)
export interface AgendamentoDTO {
  id_usuario: number;
  id_paciente: number;
  data_inicio: string;
  tipo: TipoConsulta;
  status?: StatusAgendamento;
  notas?: string;
  enviar_email?: boolean;
}

// Interface para horários disponíveis
export interface HorarioDisponivel {
  data_hora: string;
  disponivel: boolean;
  motivo?: string; // Motivo de indisponibilidade (ex: "Conflito com agendamento existente")
}

// Interface completa de uma notificação
export interface Notificacao {
  id: number;
  id_agendamento: number;
  id_usuario: number;
  tipo: TipoNotificacao;
  destinatario: string;
  assunto: string;
  corpo: string;
  status: StatusNotificacao;
  contador_tentativas: number;
  erro?: string | null;
  enviado_em?: string | null;
  entregue_em?: string | null;
  criado_em: string;
  atualizado_em: string;
}

// Interface para templates de email
export interface EmailTemplate {
  id: number;
  id_usuario: number;
  assunto_confirmacao?: string | null;
  template_texto_confirmacao?: string | null;
  assunto_lembrete?: string | null;
  template_texto_lembrete?: string | null;
  assinatura?: string | null;
  criado_em: string;
  atualizado_em: string;
}

// Interface para cores do calendário (usuario_parametros)
export interface CoresCalendario {
  cor_agendado: string;
  cor_confirmado: string;
  cor_cancelado: string;
  cor_realizado: string;
  cor_faltou: string;
  cor_reagendado: string;
}

// Interface para parâmetros do usuário (tabela usuario_parametros)
export interface UsuarioParametros {
  id: number;
  id_usuario: number;
  duracao_sessao: number; // em minutos
  tempo_entre_sessao: number; // em minutos
  tempo_lembrete: number; // em horas antes da consulta
  tempo_remarcacao: number; // em horas antes da consulta
  enviar_email: boolean;
  cor_agendado?: string | null;
  cor_confirmado?: string | null;
  cor_cancelado?: string | null;
  cor_realizado?: string | null;
  cor_faltou?: string | null;
  cor_reagendado?: string | null;
  criado_em: string;
  atualizado_em: string;
}

// Interface para histórico de agendamento
export interface AgendamentoHistorico {
  id: number;
  id_agendamento: number;
  campo_alterado: string;
  valor_anterior?: string | null;
  valor_novo?: string | null;
  usuario_alteracao: number;
  data_alteracao: string;
  operacao: 'INSERT' | 'UPDATE' | 'DELETE';
}

// Interface para execuções de cron jobs
export interface CronExecucao {
  id: number;
  nome_job: string;
  ultima_execucao: string;
  status: 'Sucesso' | 'Falha' | 'Em Execução';
  registros_processados?: number | null;
  erro?: string | null;
}

// Interface para portal do paciente
export interface PacientePortal {
  id: number;
  id_paciente: number;
  token_acesso: string;
  ultimo_acesso?: string | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
}

// Interface para estatísticas de notificações
export interface EstatisticasNotificacao {
  total_enviadas: number;
  total_pendentes: number;
  total_falhas: number;
  taxa_sucesso: number; // em porcentagem
}

// Interface para filtros de notificações
export interface FiltrosNotificacao {
  status?: StatusNotificacao;
  tipo?: TipoNotificacao;
  data_inicio?: string;
  data_fim?: string;
  id_usuario?: number;
}

// Interface para filtros de valor de serviço
export interface ValorServicos {
  id: number;
  id_usuario: number;
  valor: number;
  descricao: string;
  criado_em: string;
  atualizado_em: string;
  quantidade: number;
  excluido_em: string | null;
  tipo_servico: string;   
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

// Constantes
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
};

export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_FILES_PER_COMMENT = 5;

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
