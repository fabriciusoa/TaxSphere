import { z } from 'zod';

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

const periodoSchema = z.string()
  .regex(/^\d{2}\/\d{4}$/, 'Formato inválido. Use MM/AAAA');

const TipoCredito = z.enum(['PIS', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'INSS', 'IOF', 'IRRF', 'CIDE', 'OUTROS']);
const OrigemCredito = z.enum(['Pagamento Indevido', 'Pagamento a Maior', 'Crédito Presumido', 'Saldo Negativo IRPJ/CSLL', 'Retenção na Fonte', 'Exportação']);
const StatusCredito = z.enum(['Disponível', 'Parcialmente Utilizado', 'Esgotado', 'Prescrito', 'Suspenso']);
const StatusDebito = z.enum(['Pendente', 'Parcialmente Compensado', 'Compensado', 'Pago']);
const TipoPedido = z.enum(['Restituição', 'Ressarcimento', 'Reembolso', 'Compensação']);
const StatusPedido = z.enum(['Rascunho', 'Transmitido', 'Em Análise', 'Deferido', 'Deferido Parcialmente', 'Indeferido', 'Não Homologado', 'Cancelado', 'Homologado']);
const RegimeTributario = z.enum(['Simples Nacional', 'Lucro Presumido', 'Lucro Real']);
const TipoDocumento = z.enum(['DARF', 'GPS', 'DCTF', 'EFD', 'Contrato', 'Outros']);

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

export const pedidoCreateSchema = z.object({
  id_empresa: z.number().int().positive('Empresa é obrigatória'),
  tipo_pedido: TipoPedido,
  observacoes: z.string().optional(),
  itens: z.array(z.object({
    id_credito: z.number().int().positive().optional(),
    id_debito: z.number().int().positive().optional(),
    tipo_item: z.enum(['credito', 'debito']),
    valor_utilizado: z.number().positive('Valor deve ser positivo'),
  })).min(1, 'Pelo menos um item é obrigatório'),
});

export const pedidoStatusSchema = z.object({
  status: StatusPedido,
  motivo_indeferimento: z.string().optional(),
  dt_ciencia: z.string().optional(),
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

export type EmpresaCreateDTO = z.infer<typeof empresaCreateSchema>;
export type EmpresaUpdateDTO = z.infer<typeof empresaUpdateSchema>;
export type CreditoCreateDTO = z.infer<typeof creditoCreateSchema>;
export type CreditoUpdateDTO = z.infer<typeof creditoUpdateSchema>;
export type DebitoCreateDTO = z.infer<typeof debitoCreateSchema>;
export type DebitoUpdateDTO = z.infer<typeof debitoUpdateSchema>;
export type PedidoCreateDTO = z.infer<typeof pedidoCreateSchema>;
export type PedidoStatusDTO = z.infer<typeof pedidoStatusSchema>;
export type SimuladorDTO = z.infer<typeof simuladorSchema>;
