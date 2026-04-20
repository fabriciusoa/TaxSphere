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
    status: z.boolean().optional(),
  dt_nascimento: z.string().optional(),
  cliente_id: z.number().int().optional()
});

// Schema para atualizar usuário
export const atualizarUsuarioSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter no mínimo 3 caracteres').optional(),
  email: z.string().email('Email inválido').optional(),
  cpf: cpfSchema.optional(),
  senha: senhaSchema.optional(),
  status: z.boolean().optional(),
  dt_nascimento: z.string().optional(),
  dt_inativacao: z.string().nullable().optional(),
  dt_ativacao: z.string().nullable().optional(),
  cliente_id: z.number().int().optional()
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


// Types exportados
export type LoginDTO = z.infer<typeof loginSchema>;
export type CriarUsuarioDTO = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioDTO = z.infer<typeof atualizarUsuarioSchema>;
export type AtualizarSenhaDTO = z.infer<typeof atualizarSenhaSchema>;
export type PerfilDTO = z.infer<typeof perfilSchema>;
export type AtualizarParametroDTO = z.infer<typeof atualizarParametroSchema>;
export type EmailTemplateDTO = z.infer<typeof emailTemplateSchema>;

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

function validarCNPJ(cnpj: string): boolean {
  cnpj = cnpj.replace(/\D/g, '');
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (slice: string, weights: number[]): number => {
    const sum = slice.split('').reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(cnpj.slice(0, 12), w1);
  const d2 = calc(cnpj.slice(0, 13), w2);
  return parseInt(cnpj[12]) === d1 && parseInt(cnpj[13]) === d2;
}

const cnpjSchema = z.string()
  .transform(v => v.replace(/\D/g, ''))
  .refine(v => v.length === 14, 'CNPJ deve ter 14 dígitos')
  .refine(validarCNPJ, 'CNPJ inválido');
  
const RegimeTributario = z.enum(['Simples Nacional', 'Lucro Presumido', 'Lucro Real']);

export const empresaCreateSchema = z.object({
  cnpj: cnpjSchema,
  razao_social: z.string().min(3, 'Razão social deve ter no mínimo 3 caracteres'),
  nome_fantasia: z.string().optional(),
  inscricao_estadual: z.string().optional(),
  regime_tributario: RegimeTributario,
  uf: z.string().length(2, 'UF deve ter 2 caracteres').optional(),
  municipio: z.string().optional(),
});

export const empresaUpdateSchema = empresaCreateSchema.partial();
export type EmpresaCreateDTO = z.infer<typeof empresaCreateSchema>;
export type EmpresaUpdateDTO = z.infer<typeof empresaUpdateSchema>;
export type CriarManutencaoDTO = z.infer<typeof criarManutencaoSchema>;
export type AtualizarManutencaoDTO = z.infer<typeof atualizarManutencaoSchema>;

// ============================================
// SCHEMAS PARA CLIENTES
// ============================================
export const clienteCreateSchema = z.object({
  cnpj: cnpjSchema,
  razao_social: z.string().min(3, 'Razão Social deve ter no mínimo 3 caracteres'),
  nome_fantasia: z.string().optional(),
  inscricao_estadual: z.string().optional(),
  matriz: z.enum(['S', 'N']).optional(),
  regime_tributario: z.enum(['Simples Nacional', 'Lucro Presumido', 'Lucro Real']),
  endereco: z.string().optional(),
  numero: z.string().optional(),
  complemento: z.string().optional(),
  bairro: z.string().optional(),
  municipio: z.string().optional(),
  uf: z.string().length(2, 'UF deve ter 2 caracteres').optional(),
  cep: z.string().optional(),
  ativo: z.number().int().optional(),
});

export const clienteUpdateSchema = clienteCreateSchema.partial();
export type ClienteCreateDTO = z.infer<typeof clienteCreateSchema>;
export type ClienteUpdateDTO = z.infer<typeof clienteUpdateSchema>;

// ============================================
// SCHEMAS PARA PERFIS DE ACESSO
// ============================================
const permissaoSchema = z.object({
  funcionalidade_id: z.number().int().positive(),
  inserir: z.boolean().optional(),
  alterar: z.boolean().optional(),
  consultar: z.boolean().optional(),
  excluir: z.boolean().optional(),
});

export const perfilCreateSchema = z.object({
  perfil: z.string().min(3, 'Nome do perfil deve ter no mínimo 3 caracteres'),
  permissoes: z.array(permissaoSchema).optional(),
});

export const perfilUpdateSchema = z.object({
  perfil: z.string().min(3, 'Nome do perfil deve ter no mínimo 3 caracteres').optional(),
  permissoes: z.array(permissaoSchema).optional(),
});

export type PerfilCreateDTO = z.infer<typeof perfilCreateSchema>;
export type PerfilUpdateDTO = z.infer<typeof perfilUpdateSchema>;