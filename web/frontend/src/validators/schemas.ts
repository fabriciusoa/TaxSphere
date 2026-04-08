import { z } from 'zod';
import { validarCPF, limparCPF } from '../utils/cpf';

// Schema para login
export const loginSchema = z.object({
  email: z.string().min(1, 'Email/Usuário é obrigatório'),
  senha: z.string().min(1, 'Senha é obrigatória')
});

// Schema de senha
const senhaSchema = z
  .string()
  .min(8, 'Senha deve ter no mínimo 8 caracteres')
  .regex(/[a-z]/, 'Senha deve conter pelo menos 1 letra minúscula')
  .regex(/[A-Z]/, 'Senha deve conter pelo menos 1 letra maiúscula')
  .regex(/[\W_]/, 'Senha deve conter pelo menos 1 caractere especial');

// Schema de CPF
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
  perfil_id: z.number().int().positive('Perfil inválido').optional(),
  status: z.enum(['ativo', 'inativo']).optional(),
  dt_nascimento: z.string().optional()
});

// Validação de requisitos de senha
export function validarRequisitosSenha(senha: string) {
  return {
    tamanho: senha.length >= 8,
    maiuscula: /[A-Z]/.test(senha),
    minuscula: /[a-z]/.test(senha),
    especial: /[\W_]/.test(senha)
  };
}

export type LoginDTO = z.infer<typeof loginSchema>;
export type CriarUsuarioDTO = z.infer<typeof criarUsuarioSchema>;
export type AtualizarUsuarioDTO = z.infer<typeof atualizarUsuarioSchema>;
