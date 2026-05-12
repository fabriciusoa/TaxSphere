import { z } from 'zod';

const periodoSchema = z.string()
  .regex(/^\d{2}\/\d{4}$/, 'Formato inválido. Use MM/AAAA');

const TipoCredito = z.enum(['PIS', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'INSS', 'IOF', 'IRRF', 'CIDE', 'OUTROS']);
const OrigemCredito = z.enum(['Pagamento Indevido', 'Pagamento a Maior', 'Crédito Presumido', 'Saldo Negativo IRPJ/CSLL', 'Retenção na Fonte', 'Exportação']);
const StatusCredito = z.enum(['Disponível', 'Parcialmente Utilizado', 'Esgotado', 'Prescrito', 'Suspenso']);
const StatusDebito = z.enum(['Pendente', 'Parcialmente Compensado', 'Compensado', 'Pago']);

export const creditoCreateSchema = z.object({
  id_empresa: z.number().int().positive('Empresa é obrigatória'),
  tipo_credito: TipoCredito,
  origem_credito: OrigemCredito,
  periodo_apuracao: periodoSchema,
  codigo_receita: z.string().optional(),
  valor_original: z.number().positive('Valor deve ser positivo'),
  dt_pagamento_original: z.string().min(1, 'Data de pagamento é obrigatória'),
  observacoes: z.string().optional(),
});

export const creditoUpdateSchema = z.object({
  tipo_credito: TipoCredito.optional(),
  origem_credito: OrigemCredito.optional(),
  periodo_apuracao: periodoSchema.optional(),
  codigo_receita: z.string().optional(),
  valor_original: z.number().positive('Valor deve ser positivo').optional(),
  dt_pagamento_original: z.string().optional(),
  status: StatusCredito.optional(),
  observacoes: z.string().optional(),
});

export const debitoCreateSchema = z.object({
  id_empresa: z.number().int().positive('Empresa é obrigatória'),
  tipo_tributo: z.string().min(1, 'Tipo de tributo é obrigatório'),
  codigo_receita: z.string().optional(),
  periodo_apuracao: periodoSchema,
  valor_principal: z.number().positive('Valor deve ser positivo'),
  valor_multa: z.number().min(0).default(0),
  valor_juros: z.number().min(0).default(0),
  dt_vencimento: z.string().min(1, 'Data de vencimento é obrigatória'),
  observacoes: z.string().optional(),
});

export const debitoUpdateSchema = z.object({
  tipo_tributo: z.string().optional(),
  codigo_receita: z.string().optional(),
  periodo_apuracao: periodoSchema.optional(),
  valor_principal: z.number().positive().optional(),
  valor_multa: z.number().min(0).optional(),
  valor_juros: z.number().min(0).optional(),
  dt_vencimento: z.string().optional(),
  status: StatusDebito.optional(),
  observacoes: z.string().optional(),
});

export const simuladorSchema = z.object({
  id_empresa: z.number().int().positive(),
  creditos: z.array(z.object({
    id: z.number().int().positive(),
    valor_utilizar: z.number().positive(),
  })).min(1),
  debitos: z.array(z.object({
    id: z.number().int().positive(),
    valor_compensar: z.number().positive(),
  })).optional(),
});

export type CreditoCreateDTO = z.infer<typeof creditoCreateSchema>;
export type CreditoUpdateDTO = z.infer<typeof creditoUpdateSchema>;
export type DebitoCreateDTO = z.infer<typeof debitoCreateSchema>;
export type DebitoUpdateDTO = z.infer<typeof debitoUpdateSchema>;
export type SimuladorDTO = z.infer<typeof simuladorSchema>;
