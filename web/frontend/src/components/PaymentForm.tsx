import { useState, type FormEvent } from 'react';
import {
  Box,
  Button,
  TextField,
  Typography,
  CircularProgress,
  Alert,
  Backdrop
} from '@mui/material';
import {
  useStripe,
  useElements,
  CardElement
} from '@stripe/react-stripe-js';
import { type StripeCardElementOptions } from '@stripe/stripe-js';
import api from '../services/api';
import { logger } from '../utils/logger';

const CARD_ELEMENT_OPTIONS: StripeCardElementOptions = {
  style: {
    base: {
      fontSize: '16px',
      color: '#424770',
      '::placeholder': {
        color: '#aab7c4',
      },
      fontFamily: "'Inter', sans-serif",
    },
    invalid: {
      color: '#9e2146',
    },
  },
  hidePostalCode: true,
};

const STRIPE_ERROR_MESSAGES: Record<string, string> = {
  card_declined: 'Cartão recusado. Verifique com seu banco.',
  insufficient_funds: 'Saldo insuficiente.',
  lost_card: 'Cartão reportado como perdido.',
  stolen_card: 'Cartão reportado como roubado.',
  expired_card: 'Cartão expirado.',
  incorrect_cvc: 'Código de segurança (CVC) incorreto.',
  incorrect_number: 'Número do cartão inválido.',
  invalid_expiry_month: 'Mês de validade inválido.',
  invalid_expiry_year: 'Ano de validade inválido.',
  invalid_cvc: 'Código de segurança (CVC) inválido.',
  processing_error: 'Erro ao processar pagamento. Tente novamente.',
  incomplete_number: 'Número do cartão incompleto.',
  incomplete_cvc: 'Código de segurança incompleto.',
  incomplete_expiry: 'Data de validade incompleta.',
};

interface PaymentFormProps {
  assinaturaId: number;
  onSuccess: () => void;
  onBack: () => void;
  isTestMode?: boolean;
}

export default function PaymentForm({
  assinaturaId,
  onSuccess,
  onBack,
  isTestMode = false
}: PaymentFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [nomeCartao, setNomeCartao] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Verificar se Stripe carregou
  if (!stripe || !elements) {
    return (
      <Box sx={{ textAlign: 'center', py: 4 }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Carregando formulário de pagamento...</Typography>
      </Box>
    );
  }

  /**
   * Retry helper para erros de rede
   * Tenta 3x com delay de 2s apenas para erros de rede
   */
  const retryNetworkError = async <T,>(
    fn: () => Promise<T>,
    maxRetries = 3,
    delayMs = 2000
  ): Promise<T> => {
    let lastError: any;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        lastError = error;

        // Retry apenas erros de rede
        const isNetworkError =
          error.code === 'network_error' ||
          error.code === 'api_connection_error' ||
          error.code === 'api_error' ||
          error.message?.includes('network') ||
          error.message?.includes('timeout');

        if (!isNetworkError || attempt === maxRetries) {
          throw error;
        }

        logger.error(`Tentativa ${attempt}/${maxRetries} falhou. Tentando novamente em ${delayMs}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    throw lastError;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (!nomeCartao.trim()) {
      setError('Nome no cartão é obrigatório');
      return;
    }

    setProcessing(true);
    setError(null);

    try {
      // 1. Obter Setup Intent do backend
      const { data: setupIntentData } = await api.post('/stripe/setup-intent', {
        assinatura_id: assinaturaId
      });

      const clientSecret = setupIntentData.client_secret;

      // 2. Confirmar card setup (com 3D Secure)
      const cardElement = elements.getElement(CardElement);

      if (!cardElement) {
        throw new Error('Card Element não encontrado');
      }

      const { setupIntent, error: confirmError } = await retryNetworkError(
        () =>
          stripe.confirmCardSetup(clientSecret, {
            payment_method: {
              card: cardElement,
              billing_details: {
                name: nomeCartao
              }
            }
          })
      );

      if (confirmError) {
        const mensagemErro =
          STRIPE_ERROR_MESSAGES[confirmError.code || ''] ||
          confirmError.message ||
          'Erro ao confirmar cartão';

        throw new Error(mensagemErro);
      }

      if (!setupIntent || setupIntent.status !== 'succeeded') {
        throw new Error('Falha ao confirmar método de pagamento');
      }

      // 3. Criar subscription no backend
      await api.post('/stripe/subscription', {
        assinatura_id: assinaturaId,
        payment_method_id: setupIntent.payment_method
      });

      // Sucesso!
      setSuccess(true);
      setTimeout(() => {
        onSuccess();
      }, 2000);
      
    } catch (err: any) {
      logger.error('Erro no pagamento', err);
      
      const mensagemErro =
        err.response?.data?.detalhes ||
        err.response?.data?.erro ||
        err.message ||
        'Erro ao processar pagamento';

      setError(mensagemErro);
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Box component="form" onSubmit={handleSubmit}>
      {/* Banner de Modo Teste */}
      {isTestMode && (
        <Alert severity="warning" sx={{ mb: 3 }}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            🧪 Modo de Teste
          </Typography>
          <Typography variant="body2" fontSize="0.85rem">
            Use o cartão de teste: <strong>4242 4242 4242 4242</strong> | 
            Validade: qualquer data futura | CVC: qualquer 3 dígitos
          </Typography>
        </Alert>
      )}

      {/* Erros */}
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      {/* Sucesso */}
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          Pagamento confirmado! Redirecionando...
        </Alert>
      )}

      {/* Nome no Cartão */}
      <TextField
        fullWidth
        label="Nome no Cartão"
        value={nomeCartao}
        onChange={(e) => setNomeCartao(e.target.value)}
        required
        disabled={processing}
        sx={{ mb: 3 }}
      />

      {/* Card Element */}
      <Box
        sx={{
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '18px 14px',
          mb: 3,
          '&:focus-within': {
            borderColor: '#1976D2',
            borderWidth: '2px',
            padding: '17px 13px'
          }
        }}
      >
        <CardElement options={CARD_ELEMENT_OPTIONS} />
      </Box>

      {/* Botões */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
        <Button
          type="button"
          variant="outlined"
          size="large"
          onClick={onBack}
          disabled={processing}
          sx={{
            py: 2,
            px: 4,
            textTransform: 'none',
            fontSize: '1.1rem'
          }}
        >
          Voltar
        </Button>

        <Button
          type="submit"
          variant="contained"
          size="large"
          disabled={processing}
          sx={{
            py: 2,
            px: 4,
            fontWeight: 600,
            textTransform: 'none',
            fontSize: '1.1rem',
            minWidth: '250px'
          }}
        >
          {processing ? (
            <CircularProgress size={24} color="inherit" />
          ) : (
            'Confirmar Assinatura'
          )}
        </Button>
      </Box>

      {/* Backdrop durante processamento */}
      <Backdrop
        sx={{ color: '#fff', zIndex: (theme: any) => theme.zIndex.drawer + 1 }}
        open={processing}
      >
        <Box textAlign="center">
          <CircularProgress color="inherit" size={60} />
          <Typography variant="h6" sx={{ mt: 2 }}>
            Processando pagamento...
          </Typography>
          <Typography variant="body2" sx={{ mt: 1 }}>
            Não feche esta janela
          </Typography>
        </Box>
      </Backdrop>
    </Box>
  );
}
