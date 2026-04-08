import { z } from 'zod';
import { validarCPF, limparCPF } from '../utils/cpf';

// Schema para login
export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  senha: z.string().min(1, 'Senha é obrigatória')
});

// Schema de validação de senha
const senhaSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .regex(/[a-z]/, 'Senha deve conter pelo menos 1 letra minúscula')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos 1 letra maiúscula')
  .regex(/[\W_]/, 'Senha deve conter pelo menos 1 caractere especial');

// Schema de validação de CPF
const cpfSchema = z
  .string()
  .min(11, 'CPF deve ter 11 dígitos')
  .transform(limparCPF)
  .refine(validarCPF, 'CPF inválido');

// Schema para criar usuário
export const criarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  email: z.string().email('Email inválido'),
  cpf: cpfSchema,
  senha: senhaSchema,
  perfil_id: z.number().int().positive('Perfil inválido'),
  dt_nascimento: z.string().optional()
});

// Schema para atualizar usuário
export const atualizarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').optional(),
  email: z.string().email('Email inválido').optional(),
  cpf: cpfSchema.optional(),
  senha: senhaSchema.optional(),
  perfil_id: z.number().int().positive('Perfil inválido').optional(),
  status: z.enum(['Ativo', 'Inativo']).optional(),
  dt_nascimento: z.string().optional(),
  dt_inativacao: z.string().nullable().optional(),
  dt_ativacao: z.string().nullable().optional()
});

// Schema para atualizar senha
export const atualizarSenhaSchema = z.object({
  senha: senhaSchema
});

// Schema para criar/atualizar perfil
export const perfilSchema = z.object({
  perfil: z.string().min(3, 'Nome do perfil deve ter no mínimo 3 caracteres')
});

// Schema para atualizar parâmetro
export const atualizarParametroSchema = z.object({
  valor: z.string().min(1, 'Valor é obrigatório').optional(),
  descricao: z.string().optional()
});

// Schema para criar/atualizar paciente
export const pacienteSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres'),
  cpf: cpfSchema,
  rg: z.string().optional(),
  telefone: z.string().optional(),
  dt_nascimento: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  sexo: z.enum(['Masculino', 'Feminino', 'Outro']).optional(),
  status: z.enum(['Ativo', 'Inativo']).optional()
});

// Schema para criar agendamento
export const agendamentoCreateSchema = z.object({
  id_usuario: z.number().int().positive('ID do usuário inválido'),
  id_paciente: z.number().int().positive('ID do paciente inválido'),
  id_tipo_consulta: z.number().int().positive('ID do tipo de consulta inválido'),
  data_inicio: z.string().refine((val) => {
    try {
      // Tenta parsear como ISO datetime (com ou sem timezone)
      const date = new Date(val);
      return !isNaN(date.getTime());
    } catch {
      return false;
    }
  }, 'Data de início deve estar em formato válido'),
  status: z.enum(['Agendado', 'Confirmado', 'Cancelado', 'Realizado', 'Faltou', 'Reagendado']).optional().default('Agendado'),
  notas: z.string().max(1000, 'Notas podem ter no máximo 1000 caracteres').optional(),
  enviar_email: z.boolean().optional().default(true)
});

// Schema para atualizar agendamento
export const agendamentoUpdateSchema = z.object({
  id_paciente: z.number().int().positive('ID do paciente inválido').optional(),
  id_tipo_consulta: z.number().int().positive('ID do tipo de consulta inválido').optional(),
  data_inicio: z.string().datetime('Data de início deve estar no formato ISO 8601').optional(),
  status: z.enum(['Agendado', 'Confirmado', 'Cancelado', 'Realizado', 'Faltou', 'Reagendado']).optional(),
  notas: z.string().max(1000, 'Notas podem ter no máximo 1000 caracteres').optional(),
  motivo_cancelamento: z.string().max(500, 'Motivo de cancelamento pode ter no máximo 500 caracteres').optional()
});

// Schema para remarcação pública (via link do paciente)
export const remarcacaoPublicaSchema = z.object({
  nova_data_inicio: z.string().refine((val) => {
    try {
      // Tenta parsear como datetime válido
      const date = new Date(val);
      return !isNaN(date.getTime());
    } catch {
      return false;
    }
  }, 'Data de início deve estar em formato válido'),
  motivo: z.string().max(500, 'Motivo pode ter no máximo 500 caracteres').optional()
});

// Schema para cancelamento público
export const cancelamentoPublicoSchema = z.object({
  motivo: z.string().min(3, 'Motivo deve ter no mínimo 3 caracteres').max(500, 'Motivo pode ter no máximo 500 caracteres')
});

// Schema para cores do calendário
const hexColorRegex = /^#[0-9A-Fa-f]{6}$/;
export const coresCalendarioSchema = z.object({
  cor_agendado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_confirmado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_cancelado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_realizado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_faltou: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_reagendado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional()
});

// Schema para email templates
export const emailTemplateSchema = z.object({
  assunto_confirmacao: z.string()
    .min(3, 'Assunto de confirmação deve ter no mínimo 3 caracteres')
    .max(200, 'Assunto de confirmação pode ter no máximo 200 caracteres')
    .optional(),
  template_texto_confirmacao: z.string()
    .min(10, 'Template de confirmação deve ter no mínimo 10 caracteres')
    .max(5000, 'Template de confirmação pode ter no máximo 5000 caracteres')
    .optional(),
  assunto_lembrete: z.string()
    .min(3, 'Assunto de lembrete deve ter no mínimo 3 caracteres')
    .max(200, 'Assunto de lembrete pode ter no máximo 200 caracteres')
    .optional(),
  template_texto_lembrete: z.string()
    .min(10, 'Template de lembrete deve ter no mínimo 10 caracteres')
    .max(5000, 'Template de lembrete pode ter no máximo 5000 caracteres')
    .optional(),
  assinatura: z.string()
    .max(500, 'Assinatura pode ter no máximo 500 caracteres')
    .optional()
});

// Schema para atualizar parâmetros do usuário (incluindo cores)
export const usuarioParametrosUpdateSchema = z.object({
  duracao_sessao: z.number().int().positive().optional(),
  tempo_entre_sessao: z.number().int().min(0).optional(),
  tempo_lembrete: z.number().int().positive().optional(),
  tempo_remarcacao: z.number().int().positive().optional(),
  enviar_email: z.boolean().optional(),
  cor_agendado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_confirmado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_cancelado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_realizado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_faltou: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional(),
  cor_reagendado: z.string().regex(hexColorRegex, 'Cor deve estar no formato hexadecimal (#RRGGBB)').optional()
});

// Types exportados
export type LoginDTO = z.infer<typeof loginSchema>;
export type CriarUsuarioDTO = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioDTO = z.infer<typeof atualizarUsuarioSchema>;
export type AtualizarSenhaDTO = z.infer<typeof atualizarSenhaSchema>;
export type PerfilDTO = z.infer<typeof perfilSchema>;
export type AtualizarParametroDTO = z.infer<typeof atualizarParametroSchema>;
export type PacienteDTO = z.infer<typeof pacienteSchema>;
export type AgendamentoCreateDTO = z.infer<typeof agendamentoCreateSchema>;
export type AgendamentoUpdateDTO = z.infer<typeof agendamentoUpdateSchema>;
export type RemarcacaoPublicaDTO = z.infer<typeof remarcacaoPublicaSchema>;
export type CancelamentoPublicoDTO = z.infer<typeof cancelamentoPublicoSchema>;
export type CoresCalendarioDTO = z.infer<typeof coresCalendarioSchema>;
export type EmailTemplateDTO = z.infer<typeof emailTemplateSchema>;
export type UsuarioParametrosUpdateDTO = z.infer<typeof usuarioParametrosUpdateSchema>;

// ===== RECEITA SAÚDE =====

// Schema para validação de período (MM/YYYY)
export const reciboPeriodoSchema = z.string()
  .regex(/^\d{2}\/\d{4}$/, 'Formato inválido. Use MM/AAAA')
  .refine((periodo) => {
    const [mes, ano] = periodo.split('/').map(Number);
    const dataRecibo = new Date(ano, mes - 1);
    const dataAtual = new Date();
    const prazoLimite = new Date(dataRecibo.getFullYear() + 1, 1, 28); // 28 de fevereiro do ano seguinte
    return dataAtual <= prazoLimite;
  }, 'Prazo limite de emissão retroativa excedido (28/02 do ano seguinte)');

// Schema para criar recibos em lote
export const reciboCreateBatchSchema = z.object({
  periodo: reciboPeriodoSchema,
  recibos: z.array(z.object({
    id_paciente: z.number().int().positive('ID do paciente inválido'),
    cpf_pagador: z.string().length(11, 'CPF do pagador deve ter 11 dígitos'),
    cpf_beneficiario: z.string().length(11, 'CPF do beneficiário deve ter 11 dígitos'),
    ids_atendimentos: z.array(z.number().int().positive()).min(1, 'Selecione ao menos um atendimento')
  })).max(1000, 'Máximo de 1000 recibos por lote')
});

// Schema para atualizar recibo
export const reciboUpdateSchema = z.object({
  descricao: z.string().max(255, 'Descrição deve ter no máximo 255 caracteres')
});

// Schema para marcar status (transmitir ou validar)
export const reciboStatusSchema = z.object({
  periodo: reciboPeriodoSchema
});

export type ReciboCreateBatchDTO = z.infer<typeof reciboCreateBatchSchema>;
export type ReciboUpdateDTO = z.infer<typeof reciboUpdateSchema>;
export type ReciboStatusDTO = z.infer<typeof reciboStatusSchema>;
// ============================================
// SCHEMAS PARA SISTEMA DE CHAMADOS
// ============================================

// Enums
const StatusChamadoEnum = z.enum([
  'Aberto',
  'Em Andamento',
  'Aguardando Resposta',
  'Resolvido',
  'Fechado',
  'Cancelado'
]);

const CategoriaChamadoEnum = z.enum([
  'Problema Técnico',
  'Dúvida',
  'Sugestão',
  'Erro no Sistema',
  'Solicitação de Funcionalidade'
]);

const PrioridadeChamadoEnum = z.enum([
  'Baixa',
  'Normal',
  'Alta',
  'Urgente'
]);

// Schema para criar chamado
export const chamadoCreateSchema = z.object({
  titulo: z.string()
    .min(3, 'Título deve ter no mínimo 3 caracteres')
    .max(200, 'Título deve ter no máximo 200 caracteres'),
  descricao: z.string()
    .min(10, 'Descrição deve ter no mínimo 10 caracteres'),
  categoria: CategoriaChamadoEnum,
  prioridade: PrioridadeChamadoEnum,
});

// Schema para atualizar chamado
export const chamadoUpdateSchema = z.object({
  titulo: z.string()
    .min(3, 'Título deve ter no mínimo 3 caracteres')
    .max(200, 'Título deve ter no máximo 200 caracteres')
    .optional(),
  descricao: z.string()
    .min(10, 'Descrição deve ter no mínimo 10 caracteres')
    .optional(),
  categoria: CategoriaChamadoEnum.optional(),
  prioridade: PrioridadeChamadoEnum.optional(),
  status: StatusChamadoEnum.optional(),
  id_usuario_atribuido: z.number().int().positive().nullable().optional(),
});

// Schema para criar comentário
export const comentarioCreateSchema = z.object({
  comentario: z.string()
    .min(1, 'Comentário não pode estar vazio')
    .max(5000, 'Comentário muito longo (máx 5000 caracteres)'),
});

export type ChamadoCreateDTO = z.infer<typeof chamadoCreateSchema>;
export type ChamadoUpdateDTO = z.infer<typeof chamadoUpdateSchema>;
export type ComentarioCreateDTO = z.infer<typeof comentarioCreateSchema>;

// Schema para criar manutenção
export const criarManutencaoSchema = z.object({
  descricao: z.string()
    .min(3, 'Descrição deve ter no mínimo 3 caracteres')
    .max(500, 'Descrição deve ter no máximo 500 caracteres'),
  dt_inicio: z.string().min(1, 'Data de início é obrigatória'),
  dt_fim: z.string().nullable().optional(),
  status: z.enum(['planejada', 'em_execucao', 'terminado']).optional()
});

// Schema para atualizar manutenção (todos os campos opcionais)
export const atualizarManutencaoSchema = z.object({
  descricao: z.string()
    .min(3, 'Descrição deve ter no mínimo 3 caracteres')
    .max(500, 'Descrição deve ter no máximo 500 caracteres')
    .optional(),
  dt_inicio: z.string().min(1, 'Data de início inválida').optional(),
  dt_fim: z.string().nullable().optional(),
  status: z.enum(['planejada', 'em_execucao', 'terminado']).optional()
});

export type CriarManutencaoDTO = z.infer<typeof criarManutencaoSchema>;
export type AtualizarManutencaoDTO = z.infer<typeof atualizarManutencaoSchema>;