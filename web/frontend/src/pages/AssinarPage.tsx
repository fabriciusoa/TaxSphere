import { useState, useEffect } from 'react';
import { Box, Button, Container, Paper, Typography, Chip, CircularProgress, Alert, TextField, MenuItem } from '@mui/material';
import { Check, ArrowBack } from '@mui/icons-material';
import { Elements } from '@stripe/react-stripe-js';
import { getStripe } from '../config/stripeConfig';
import PaymentForm from '../components/PaymentForm';
import admPlanosService, { type Plano } from '../services/admPlanosService';
import admAssinaturaService, { type Assinatura } from '../services/admAssinaturaService';
import { logger } from '../utils/logger';

export default function AssinarPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [planoSelecionado, setPlanoSelecionado] = useState<number | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [etapa, setEtapa] = useState<'planos' | 'dados' | 'pagamento'>('planos');
  const [salvando, setSalvando] = useState(false);
  const [assinaturaId, setAssinaturaId] = useState<number | null>(null);
  const [stripePromise, setStripePromise] = useState<any>(null);

  const [formData, setFormData] = useState<Assinatura>({
    nome: '',
    email: '',
    cpf: '',
    id_adm_plano: 0,
    dt_nascimento: '',
    cep: '',
    telefone: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: ''
  });

  const SERVER_NAME = import.meta.env.VITE_API_URL_WEB || 'http://localhost:8080';

  useEffect(() => {
    carregarPlanos();
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    const scrollLeft = container.scrollLeft;
    const cardWidth = 412; // 380px (card) + 32px (gap)
    const currentIndex = Math.round(scrollLeft / cardWidth);
    setScrollPosition(currentIndex);
  };

  const scrollToCard = (index: number) => {
    const container = document.getElementById('planos-container');
    if (container) {
      const cardWidth = 412; // 380px (card) + 32px (gap)
      container.scrollTo({
        left: index * cardWidth,
        behavior: 'smooth'
      });
      setScrollPosition(index);
    }
  };

  const carregarPlanos = async () => {
    try {
      setLoading(true);
      const data = await admPlanosService.listarAtivos();
      setPlanos(data);
      setError(null);
    } catch (err: any) {
      setError('Erro ao carregar planos');
      logger.error('Erro ao carregar planos', err);
    } finally {
      setLoading(false);
    }
  };

  const formatarValor = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(valor);
  };

  const avancarParaDados = () => {
    setEtapa('dados');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const voltarParaPlanos = () => {
    setEtapa('planos');
    setError(null);
    setSuccess(null);
  };

  const validarCPF = (cpf: string): boolean => {
    const cpfLimpo = cpf.replace(/\D/g, '');

    if (cpfLimpo.length !== 11) return false;

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cpfLimpo)) return false;

    // Valida o primeiro dígito verificador
    let soma = 0;
    for (let i = 0; i < 9; i++) {
      soma += parseInt(cpfLimpo.charAt(i)) * (10 - i);
    }
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(9))) return false;

    // Valida o segundo dígito verificador
    soma = 0;
    for (let i = 0; i < 10; i++) {
      soma += parseInt(cpfLimpo.charAt(i)) * (11 - i);
    }
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(cpfLimpo.charAt(10))) return false;

    return true;
  };

  const formatarCPF = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    }
    return value;
  };

  const formatarDataBrasileira = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 8) {
      return numbers
        .replace(/(\d{2})(\d)/, '$1/$2')
        .replace(/(\d{2})(\d)/, '$1/$2');
    }
    return value;
  };

  const converterDataParaISO = (dataBR: string): string => {
    // Converte dd/mm/yyyy para yyyy-mm-dd
    const [dia, mes, ano] = dataBR.split('/');
    if (dia && mes && ano && ano.length === 4) {
      return `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
    }
    return '';
  };

  const calcularDataLimiteTeste = (): string => {
    const hoje = new Date();
    const dataLimite = new Date(hoje);
    dataLimite.setDate(dataLimite.getDate() + 7);

    return dataLimite.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  };

  const formatarTelefone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      if (numbers.length <= 10) {
        return numbers
          .replace(/(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{4})(\d)/, '$1-$2');
      }
      return numbers
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2');
    }
    return value;
  };

  const formatarCEP = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 8) {
      return numbers.replace(/(\d{5})(\d)/, '$1-$2');
    }
    return value;
  };

  const buscarCEP = async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length === 8) {
      try {
        const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            endereco: data.logradouro || '',
            bairro: data.bairro || '',
            cidade: data.localidade || '',
            uf: data.uf || ''
          }));
        }
      } catch (err: any) {
        logger.error('Erro ao buscar CEP', err);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    let formattedValue = value;

    if (name === 'cpf') {
      formattedValue = formatarCPF(value);
    } else if (name === 'telefone') {
      formattedValue = formatarTelefone(value);
    } else if (name === 'cep') {
      formattedValue = formatarCEP(value);
      if (value.replace(/\D/g, '').length === 8) {
        buscarCEP(value);
      }
    } else if (name === 'dt_nascimento') {
      formattedValue = formatarDataBrasileira(value);
    }

    setFormData(prev => ({
      ...prev,
      [name]: formattedValue
    }));
  };

  const validarFormulario = () => {
    if (!formData.nome.trim()) return 'Nome é obrigatório';
    if (!formData.email.trim()) return 'Email é obrigatório';
    if (!formData.cpf.trim()) return 'CPF é obrigatório';
    if (!formData.dt_nascimento) return 'Data de nascimento é obrigatória';
    if (!formData.cep.trim()) return 'CEP é obrigatório';
    if (!formData.telefone.trim()) return 'Telefone é obrigatório';
    if (!formData.endereco.trim()) return 'Endereço é obrigatório';
    if (!formData.numero.trim()) return 'Número é obrigatório';
    if (!formData.bairro.trim()) return 'Bairro é obrigatório';
    if (!formData.cidade.trim()) return 'Cidade é obrigatória';
    if (!formData.uf.trim()) return 'UF é obrigatório';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) return 'Email inválido';

    if (!validarCPF(formData.cpf)) return 'CPF inválido';

    const dataNascimento = formData.dt_nascimento.replace(/\D/g, '');
    if (dataNascimento.length !== 8) return 'Data de nascimento inválida';

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const erroValidacao = validarFormulario();
    if (erroValidacao) {
      setError(erroValidacao);
      return;
    }

    try {
      setSalvando(true);
      setError(null);

      const dadosAssinatura: Assinatura = {
        ...formData,
        id_adm_plano: planoSelecionado!,
        cpf: formData.cpf.replace(/\D/g, ''),
        telefone: formData.telefone.replace(/\D/g, ''),
        cep: formData.cep.replace(/\D/g, ''),
        dt_nascimento: converterDataParaISO(formData.dt_nascimento)
      };

      const result = await admAssinaturaService.criar(dadosAssinatura);
      
      // Armazenar ID da assinatura para usar na etapa de pagamento
      if (result.id) {
        setAssinaturaId(result.id);
      }

      // Carregar Stripe antes de avançar
      try {
        const stripe = getStripe();
        setStripePromise(stripe);
      } catch (error: any) {
        logger.error('Erro ao carregar Stripe', error);
        setError('Erro ao carregar sistema de pagamento. Tente novamente.');
        return;
      }

      // Avançar para etapa de pagamento
      setEtapa('pagamento');
      window.scrollTo({ top: 0, behavior: 'smooth' });

    } catch (err: any) {
      logger.error('Erro ao criar assinatura', err);
      setError(err.response?.data?.erro || 'Erro ao criar assinatura');
    } finally {
      setSalvando(false);
    }
  };

  const ufs = [
    'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
    'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
    'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
  ];

  return (
    <>
      {/* Header/Navbar com estilos do site institucional */}
      <Box
        component="header"
        sx={{

          top: 15,
          left: 15,
          right: 0,
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.95)',
          borderBottom: '1px solid #ffffff',
          padding: '1rem 0',
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
        }}
      >
        <Container
          maxWidth={false}
          sx={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 2rem'
          }}
        >
          <Box
            component="nav"
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '2rem'
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <img
                src={`${SERVER_NAME}/images/logo_site.png`}
                alt="Logo Mentis"
              />
            </Box>

            <Box
              component="ul"
              sx={{
                display: { xs: 'none', md: 'flex' },
                gap: '2rem',
                listStyle: 'none',
                margin: 0,
                padding: 0
              }}
            >
              <li>
                <a
                  href={`${SERVER_NAME}/index.html#inicio`}
                  style={{
                    color: '#757575',
                    textDecoration: 'none',
                    fontWeight: 500,
                    transition: 'color 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#1976D2'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#757575'}
                >
                  Início
                </a>
              </li>
              <li>
                <a
                  href={`${SERVER_NAME}/index.html#funcionalidades`}
                  style={{
                    color: '#757575',
                    textDecoration: 'none',
                    fontWeight: 500,
                    transition: 'color 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#1976D2'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#757575'}
                >
                  Funcionalidades
                </a>
              </li>
              <li>
                <a
                  href={`${SERVER_NAME}/index.html#beneficios`}
                  style={{
                    color: '#757575',
                    textDecoration: 'none',
                    fontWeight: 500,
                    transition: 'color 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#1976D2'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#757575'}
                >
                  Benefícios
                </a>
              </li>
              <li>
                <a
                  href={`${SERVER_NAME}/index.html#depoimentos`}
                  style={{
                    color: '#757575',
                    textDecoration: 'none',
                    fontWeight: 500,
                    transition: 'color 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#1976D2'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#757575'}
                >
                  Depoimentos
                </a>
              </li>
              <li>
                <a
                  href={`${SERVER_NAME}/index.html#precos`}
                  style={{
                    color: '#757575',
                    textDecoration: 'none',
                    fontWeight: 500,
                    transition: 'color 0.3s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.color = '#1976D2'}
                  onMouseLeave={(e) => e.currentTarget.style.color = '#757575'}
                >
                  Preços
                </a>
              </li>
            </Box>

            <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: '1rem' }}>
              <a
                href="/login"
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'all 0.3s ease',
                  background: 'transparent',
                  color: '#1976D2',
                  border: '2px solid #E0E0E0'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#1976D2';
                  e.currentTarget.style.background = '#f5f5f5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E0E0E0';
                  e.currentTarget.style.background = 'transparent';
                }}
              >
                Acessar Sistema
              </a>
              <a
                href="/assinar"
                style={{
                  padding: '0.75rem 1.5rem',
                  borderRadius: '8px',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-block',
                  transition: 'all 0.3s ease',
                  background: '#1976D2',
                  color: 'white',
                  border: '2px solid #1976D2'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#1565C0';
                  e.currentTarget.style.borderColor = '#1565C0';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#1976D2';
                  e.currentTarget.style.borderColor = '#1976D2';
                }}
              >
                Assinar Agora
              </a>
            </Box>

            <Box
              sx={{
                display: { xs: 'flex', md: 'none' },
                flexDirection: 'column',
                gap: '5px',
                cursor: 'pointer',
                padding: '8px'
              }}
              aria-label="Menu"
            >
              <Box sx={{ width: '24px', height: '2px', backgroundColor: '#212121' }} />
              <Box sx={{ width: '24px', height: '2px', backgroundColor: '#212121' }} />
              <Box sx={{ width: '24px', height: '2px', backgroundColor: '#212121' }} />
            </Box>
          </Box>
        </Container>
      </Box>

      <Container
        maxWidth={false}
        sx={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 2rem',
          marginTop: '1rem',
          mb: 6
        }}
      >
        {/* Mensagens de erro/sucesso */}
        {error && (
          <Alert severity="error" sx={{ mb: 4 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {success && (
          <Alert severity="success" sx={{ mb: 4 }}>
            {success}
          </Alert>
        )}

        {/* Loading */}
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <CircularProgress />
          </Box>
        )}

        {/* ETAPA 1: Seleção de Planos */}
        {etapa === 'planos' && !loading && !error && planos.length > 0 && (
          <>
            {/* Cabeçalho da Seção */}
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  fontWeight: 700,
                  mb: 2,
                  color: '#212121'
                }}
              >
                Planos que cabem no seu bolso
              </Typography>
              <Typography
                variant="h6"
                color="text.secondary"
                sx={{ mb: 1 }}
              >
                Escolha o plano ideal para o tamanho da sua prática
              </Typography>
            </Box>

            {/* Cards de Planos */}
            <Box
              id="planos-container"
              onScroll={handleScroll}
              sx={{
                display: 'flex',
                justifyContent: 'center',
                gap: 4,
                overflowX: 'auto',
                overflowY: 'hidden',
                scrollSnapType: 'x mandatory',
                scrollBehavior: 'smooth',
                py: 3,
                px: 2,
                '&::-webkit-scrollbar': {
                  display: 'none'
                },
                msOverflowStyle: 'none',
                scrollbarWidth: 'none'
              }}
            >
              {planos.map((plano, index) => (
                <Paper
                  key={plano.id}
                  elevation={planoSelecionado === plano.id ? 8 : 2}
                  onClick={() => setPlanoSelecionado(plano.id!)}
                  sx={{
                    p: 4,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 3,
                    position: 'relative',
                    border: planoSelecionado === plano.id ? '3px solid #1976D2' : '1px solid #E0E0E0',
                    transition: 'all 0.3s ease',
                    transform: planoSelecionado === plano.id ? 'scale(1.05)' : 'scale(1)',
                    minWidth: '380px',
                    maxWidth: '380px',
                    scrollSnapAlign: 'start',
                    cursor: 'pointer',
                    backgroundColor: planoSelecionado === plano.id ? '#f0f7ff' : 'white',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                      borderColor: '#1976D2'
                    }
                  }}
                >
                  {/* Badge */}
                  <Chip
                    label={index === 1 ? 'Mais Popular' : 'Ideal para iniciar'}
                    sx={{
                      mb: 2,
                      fontWeight: 600,
                      backgroundColor: index === 1 ? '#1976D2' : '#F5F5F5',
                      color: index === 1 ? 'white' : '#212121',
                      alignSelf: 'flex-start'
                    }}
                  />

                  {/* Nome do Plano */}
                  <Typography
                    variant="h5"
                    component="h3"
                    sx={{ fontWeight: 700, mb: 2 }}
                  >
                    {plano.descricao}
                  </Typography>

                  {/* Preço */}
                  <Box
                    sx={{
                      display: 'flex',
                      alignItems: 'baseline',
                      mb: 2,
                      gap: 0.5
                    }}
                  >
                    <Typography
                      variant="h6"
                      sx={{ color: '#757575' }}
                    >
                      R$
                    </Typography>
                    <Typography
                      variant="h3"
                      sx={{
                        fontWeight: 800,
                        color: '#1976D2'
                      }}
                    >
                      {formatarValor(plano.valor)}
                    </Typography>
                    <Typography
                      variant="h6"
                      sx={{ color: '#757575' }}
                    >
                      /mês
                    </Typography>
                  </Box>

                  <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{ mb: 3 }}
                  >
                    Para psicólogos e médicos em consultório individual
                  </Typography>

                  {/* Lista de Itens */}
                  <Box sx={{ flex: 1, mb: 3 }}>
                    {plano.itens && plano.itens.length > 0 ? (
                      plano.itens
                        .filter(item => item.ativo === 'S')
                        .map((item, itemIndex) => (
                          <Box
                            key={itemIndex}
                            sx={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: 1.5,
                              py: 1.5,
                              borderBottom: itemIndex < plano.itens!.filter(i => i.ativo === 'S').length - 1
                                ? '1px solid #E0E0E0'
                                : 'none'
                            }}
                          >
                            <Check
                              sx={{
                                color: '#4CAF50',
                                fontSize: 20,
                                mt: 0.2
                              }}
                            />
                            <Typography variant="body2">
                              {item.descricao}
                            </Typography>
                          </Box>
                        ))
                    ) : (
                      <Typography variant="body2" color="text.secondary">
                        Nenhum item disponível
                      </Typography>
                    )}
                  </Box>
                </Paper>
              ))}
            </Box>

            {/* Indicadores de navegação (bolinhas) */}
            {planos.length > 2 && (
              <Box
                sx={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: 1.5,
                  mt: 4
                }}
              >
                {planos.slice(0, -1).map((plano, index) => (
                  <Box
                    key={plano.id}
                    onClick={() => scrollToCard(index)}
                    sx={{
                      width: scrollPosition === index ? '32px' : '12px',
                      height: '12px',
                      borderRadius: '6px',
                      backgroundColor: scrollPosition === index ? '#1976D2' : '#E0E0E0',
                      cursor: 'pointer',
                      transition: 'all 0.3s ease',
                      '&:hover': {
                        backgroundColor: scrollPosition === index ? '#1565C0' : '#BDBDBD'
                      }
                    }}
                  />
                ))}
              </Box>
            )}

            {/* Botão Próximo */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
              <Button
                variant="contained"
                size="large"
                disabled={!planoSelecionado}
                onClick={avancarParaDados}
                sx={{
                  py: 2,
                  px: 6,
                  fontWeight: 600,
                  textTransform: 'none',
                  fontSize: '1.1rem',
                  minWidth: '250px'
                }}
              >
                Próximo
              </Button>
            </Box>

            {/* Nota */}
            <Box>
              <Typography
                variant="body1"
                sx={{
                  textAlign: 'center',
                  mt: 5,
                  color: '#757575',
                  fontSize: '1.1rem'
                }}
              >
                💳 Todos os planos incluem 7 dias de teste grátis.
              </Typography>
              <Typography
                sx={{
                  textAlign: 'center',
                  mt: 2,
                  bottom: 10,
                  color: '#757575',
                  fontSize: '1.1rem'
                }}
              >
                Ao selecionar um plano, você precisará informar seus dados pessoais.
                Verifique nossa <a href={`${SERVER_NAME}/privacidade.html`}>Política de Privacidade </a>
                e <a href={`${SERVER_NAME}/lgpd.html`}>Conformidade LGPD</a>.
              </Typography>
            </Box>
          </>
        )}

        {/* ETAPA 2: Formulário de Dados */}
        {etapa === 'dados' && (
          <Box>
            {/* Botão Voltar */}
            <Button
              startIcon={<ArrowBack />}
              onClick={voltarParaPlanos}
              sx={{
                mb: 4,
                textTransform: 'none',
                fontSize: '1rem'
              }}
            >
              Voltar para Planos
            </Button>

            {/* Título */}
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  fontWeight: 700,
                  mb: 2,
                  color: '#212121'
                }}
              >
                Complete sua Assinatura
              </Typography>

              <Typography
                variant="h6"
                color="text.secondary"
              >
                Preencha seus dados para finalizar
              </Typography>
            </Box>

            {/* Informações do Plano Selecionado */}
            <Paper
              elevation={2}
              sx={{
                p: 3,
                maxWidth: '800px',
                mx: 'auto',
                mb: 4,
                backgroundColor: '#f1f6fa',
                border: '2px solid #1976D2'
              }}
            >
              <Typography variant="h6" sx={{ mb: 2, color: '#003061', fontWeight: 700 }}>
                📋 Plano Selecionado
              </Typography>

              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Plano:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#212121' }}>
                    {planos.find(p => p.id === planoSelecionado)?.descricao}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Valor Mensal:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#1976D2' }}>
                    R$ {formatarValor(planos.find(p => p.id === planoSelecionado)?.valor || 0)}
                  </Typography>
                </Box>

                <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Período de Teste Gratuito:
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#4CAF50' }}>
                    ✓ 7 dias grátis - Teste até {calcularDataLimiteTeste()}
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#ff0000' }} fontSize={"0.8rem"}>
                    *Após esse período, será cobrado o valor do plano.
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Formulário */}
            <Paper elevation={3} sx={{ p: 4, maxWidth: '800px', mx: 'auto' }}>
              <form onSubmit={handleSubmit}>
                {/* Dados Pessoais */}
                <Typography variant="h6" sx={{ mb: 3, color: '#1976D2', fontWeight: 600 }}>
                  Dados Pessoais
                </Typography>

                <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                  <TextField
                    fullWidth
                    label="Nome Completo"
                    name="nome"
                    value={formData.nome}
                    onChange={handleInputChange}
                    required
                  />

                  <TextField
                    fullWidth
                    label="Email"
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                  />

                  <TextField
                    fullWidth
                    label="CPF"
                    name="cpf"
                    value={formData.cpf}
                    onChange={handleInputChange}
                    required
                    inputProps={{ maxLength: 14 }}
                    placeholder="000.000.000-00"
                  />

                  <TextField
                    fullWidth
                    label="Data de Nascimento"
                    name="dt_nascimento"
                    value={formData.dt_nascimento}
                    onChange={handleInputChange}
                    required
                    inputProps={{ maxLength: 10 }}
                    placeholder="dd/mm/aaaa"
                    helperText="Formato: dd/mm/aaaa"
                  />

                  <TextField
                    fullWidth
                    label="Telefone"
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleInputChange}
                    required
                    inputProps={{ maxLength: 15 }}
                    placeholder="(00) 00000-0000"
                  />
                </Box>

                {/* Endereço */}
                <Typography variant="h6" sx={{ mt: 4, mb: 3, color: '#1976D2', fontWeight: 600 }}>
                  Endereço
                </Typography>

                <Box sx={{ display: 'grid', gap: 3, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                  <TextField
                    fullWidth
                    label="CEP"
                    name="cep"
                    value={formData.cep}
                    onChange={handleInputChange}
                    required
                    inputProps={{ maxLength: 9 }}
                    placeholder="00000-000"
                  />

                  <TextField
                    fullWidth
                    label="Endereço"
                    name="endereco"
                    value={formData.endereco}
                    onChange={handleInputChange}
                    required
                  />

                  <TextField
                    fullWidth
                    label="Número"
                    name="numero"
                    value={formData.numero}
                    onChange={handleInputChange}
                    required
                  />

                  <TextField
                    fullWidth
                    label="Complemento"
                    name="complemento"
                    value={formData.complemento}
                    onChange={handleInputChange}
                  />

                  <TextField
                    fullWidth
                    label="Bairro"
                    name="bairro"
                    value={formData.bairro}
                    onChange={handleInputChange}
                    required
                  />

                  <TextField
                    fullWidth
                    label="Cidade"
                    name="cidade"
                    value={formData.cidade}
                    onChange={handleInputChange}
                    required
                  />

                  <TextField
                    fullWidth
                    select
                    label="UF"
                    name="uf"
                    value={formData.uf}
                    onChange={handleInputChange}
                    required
                  >
                    {ufs.map((uf) => (
                      <MenuItem key={uf} value={uf}>
                        {uf}
                      </MenuItem>
                    ))}
                  </TextField>
                </Box>

                {/* Botões */}
                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 4 }}>
                  <Button
                    type="button"
                    variant="outlined"
                    size="large"
                    onClick={voltarParaPlanos}
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
                    disabled={salvando}
                    sx={{
                      py: 2,
                      px: 2,
                      fontWeight: 600,
                      textTransform: 'none',
                      fontSize: '1.1rem',
                      minWidth: '200px'
                    }}
                  >
                    {salvando ? <CircularProgress size={24} color="inherit" /> : 'Ir para Pagamento'}
                  </Button>
                </Box>

                {/* Nota Legal */}
                <Typography
                  variant="body2"
                  sx={{
                    textAlign: 'center',
                    mt: 3,
                    color: '#757575',
                    fontSize: '0.9rem'
                  }}
                >
                  Ao assinar, você concorda com nossos <a href={`${SERVER_NAME}/termos.html`}>Termos de Uso</a> e <a href={`${SERVER_NAME}/privacidade.html`}>Política de Privacidade</a>.
                </Typography>
              </form>
            </Paper>
          </Box>
        )}

        {/* ETAPA 3: Pagamento com Stripe Elements */}
        {etapa === 'pagamento' && assinaturaId && (
          <Box>
            {/* Botão Voltar */}
            <Button
              startIcon={<ArrowBack />}
              onClick={() => setEtapa('dados')}
              sx={{
                mb: 4,
                textTransform: 'none',
                fontSize: '1rem'
              }}
            >
              Voltar
            </Button>

            {/* Título */}
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Typography
                variant="h3"
                component="h1"
                sx={{
                  fontWeight: 700,
                  mb: 2,
                  color: '#212121'
                }}
              >
                Finalize sua Assinatura
              </Typography>

              <Typography
                variant="h6"
                color="text.secondary"
              >
                Cadastre seu cartão de crédito
              </Typography>
            </Box>

            {/* Informações do Plano */}
            <Paper
              elevation={2}
              sx={{
                p: 3,
                maxWidth: '800px',
                mx: 'auto',
                mb: 4,
                backgroundColor: '#f1f6fa',
                border: '2px solid #1976D2'
              }}
            >
              <Typography variant="h6" sx={{ mb: 2, color: '#003061', fontWeight: 700 }}>
                📋 Resumo da Assinatura
              </Typography>

              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Plano:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#212121' }}>
                    {planos.find(p => p.id === planoSelecionado)?.descricao}
                  </Typography>
                </Box>

                <Box>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    Valor Mensal:
                  </Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#1976D2' }}>
                    R$ {formatarValor(planos.find(p => p.id === planoSelecionado)?.valor || 0)}
                  </Typography>
                </Box>

                <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                  <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                    ✅ Período de Teste Gratuito:
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 600, color: '#4CAF50', fontSize: '1.1rem' }}>
                    7 dias grátis - Teste até {calcularDataLimiteTeste()}
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 1, color: '#757575' }}>
                    Seu cartão será validado agora, mas você só será cobrado após o período de teste.
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Formulário de Pagamento */}
            <Paper elevation={3} sx={{ p: 4, maxWidth: '800px', mx: 'auto' }}>
              <Typography variant="h6" sx={{ mb: 3, color: '#1976D2', fontWeight: 600 }}>
                Dados do Cartão de Crédito
              </Typography>

              {!stripePromise ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress />
                  <Typography sx={{ mt: 2 }}>Carregando sistema de pagamento...</Typography>
                </Box>
              ) : (
                <Elements stripe={stripePromise}>
                  <PaymentForm
                    assinaturaId={assinaturaId}
                    isTestMode={import.meta.env.DEV}
                    onSuccess={() => {
                    setSuccess('Assinatura confirmada com sucesso! Você receberá um email com as instruções de acesso.');
                    
                    // Limpar estados e voltar para planos após 3s
                    setTimeout(() => {
                      setFormData({
                        nome: '',
                        email: '',
                        cpf: '',
                        id_adm_plano: 0,
                        dt_nascimento: '',
                        cep: '',
                        telefone: '',
                        endereco: '',
                        numero: '',
                        complemento: '',
                        bairro: '',
                        cidade: '',
                        uf: ''
                      });
                      setPlanoSelecionado(null);
                      setAssinaturaId(null);
                      setEtapa('planos');
                      setSuccess(null);
                    }, 3000);
                  }}
                  onBack={() => setEtapa('dados')}
                />
              </Elements>
              )}

              {/* Nota sobre Segurança */}
              <Box sx={{ mt: 4, p: 2, backgroundColor: '#f5f5f5', borderRadius: '4px' }}>
                <Typography variant="body2" sx={{ textAlign: 'center', color: '#757575' }}>
                  🔒 Seus dados são protegidos com criptografia SSL/TLS. 
                  Os dados do cartão são processados de forma segura pelo Stripe.
                </Typography>
              </Box>
            </Paper>
          </Box>
        )}

        {/* Caso não tenha planos */}
        {!loading && !error && planos.length === 0 && etapa === 'planos' && (
          <Alert severity="info" sx={{ mt: 4 }}>
            Nenhum plano disponível no momento. Entre em contato conosco (<a href="mailto:contato@mentis.com">contato@mentis.com</a>).
          </Alert>
        )}
      </Container>
    </>
  );
}
