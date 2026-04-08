import api from './api';

export interface Assinatura {
  id?: number;
  nome: string;
  email: string;
  cpf: string;
  id_adm_plano: number;
  dt_nascimento: string;
  cep: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento?: string;
  bairro: string;
  cidade: string;
  uf: string;
  status?: string;
  dt_criacao?: string;
  dt_demonstracao?: string;
  dt_bloqueio?: string | null;
  dt_excluido?: string | null;
  plano_descricao?: string;
  plano_valor?: number;
  // Campos Stripe
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  stripe_payment_method_id?: string | null;
}

const admAssinaturaService = {
  listar: async (): Promise<Assinatura[]> => {
    const response = await api.get<Assinatura[]>('/adm-assinaturas');
    return response.data;
  },

  buscarPorId: async (id: number): Promise<Assinatura> => {
    const response = await api.get<Assinatura>(`/adm-assinaturas/${id}`);
    return response.data;
  },

  criar: async (assinatura: Assinatura): Promise<Assinatura> => {
    const response = await api.post<Assinatura>('/adm-assinaturas', assinatura);
    return response.data;
  },

  atualizar: async (id: number, assinatura: Assinatura): Promise<Assinatura> => {
    const response = await api.put<Assinatura>(`/adm-assinaturas/${id}`, assinatura);
    return response.data;
  },

  excluir: async (id: number): Promise<void> => {
    await api.delete(`/adm-assinaturas/${id}`);
  }
};

export default admAssinaturaService;
