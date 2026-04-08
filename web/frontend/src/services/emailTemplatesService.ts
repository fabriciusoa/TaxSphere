import api from './api';

export interface EmailTemplate {
  id?: number;
  id_usuario?: number;
  assunto_confirmacao: string;
  corpo_confirmacao: string;
  assunto_lembrete: string;
  corpo_lembrete: string;
  assinatura: string;
  criado_em?: string;
  atualizado_em?: string;
}

const emailTemplatesService = {
  /**
   * Buscar templates de email do usuário logado
   * Retorna templates personalizados ou padrão do sistema
   * @returns Template de email
   */
  buscar: async (): Promise<EmailTemplate> => {
    const response = await api.get<EmailTemplate>('/email-templates');
    return response.data;
  },

  /**
   * Atualizar templates de email do usuário logado
   * Realiza UPSERT (cria se não existir, atualiza se existir)
   * @param template - Dados do template
   * @returns Template atualizado
   */
  atualizar: async (template: EmailTemplate): Promise<EmailTemplate> => {
    const response = await api.put<EmailTemplate>('/email-templates', template);
    return response.data;
  },

  /**
   * Enviar email de teste para o usuário logado
   * Usa dados fictícios para preencher as variáveis do template
   * @returns Resultado do envio
   */
  testar: async (): Promise<{ success: boolean; message: string; error?: string }> => {
    const response = await api.post<{ success: boolean; message: string; error?: string }>(
      '/email-templates/testar'
    );
    return response.data;
  }
};

export default emailTemplatesService;
