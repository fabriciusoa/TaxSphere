import { useState, useEffect } from 'react';
import {
  Box, Button, Container, Paper, Typography, Chip,
  CircularProgress, Alert, TextField, MenuItem,
} from '@mui/material';
import { Check, ArrowBack } from '@mui/icons-material';
import { Elements } from '@stripe/react-stripe-js';
import { getStripe } from '../config/stripeConfig';
import PaymentForm from '../components/PaymentForm';
import admPlanosService, { type Plano } from '../services/admPlanosService';
import admAssinaturaService, { type Assinatura } from '../services/admAssinaturaService';
import { logger } from '../utils/logger';

// Palette — keeps the institutional public feel, upgraded to Synchro
const P = {
  navy:     '#0a1628',
  cyan:     '#00c8f0',
  cyanGlow: '0 4px 18px rgba(0,200,240,0.25)',
  text:     '#1a2332',
  textSub:  '#64748b',
  border:   'rgba(15,30,60,0.09)',
  inputBg:  '#F7F9FC',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: P.inputBg, borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: P.cyan, borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { color: P.textSub, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: P.cyan },
};

const UFs = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
  'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
  'RS','RO','RR','SC','SP','SE','TO',
];

export default function AssinarPage() {
  const [planos, setPlanos]                 = useState<Plano[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);
  const [success, setSuccess]               = useState<string | null>(null);
  const [planoSelecionado, setPlanoSelecionado] = useState<number | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [etapa, setEtapa]                   = useState<'planos' | 'dados' | 'pagamento'>('planos');
  const [salvando, setSalvando]             = useState(false);
  const [assinaturaId, setAssinaturaId]     = useState<number | null>(null);
  const [stripePromise, setStripePromise]   = useState<any>(null);

  const [formData, setFormData] = useState<Assinatura>({
    nome: '', email: '', cpf: '', id_adm_plano: 0,
    dt_nascimento: '', cep: '', telefone: '', endereco: '',
    numero: '', complemento: '', bairro: '', cidade: '', uf: '',
  });

  const SERVER_NAME = import.meta.env.VITE_API_URL_WEB || 'http://localhost:8080';

  useEffect(() => { carregarPlanos(); }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    setScrollPosition(Math.round(container.scrollLeft / 412));
  };

  const scrollToCard = (index: number) => {
    const container = document.getElementById('planos-container');
    if (container) {
      container.scrollTo({ left: index * 412, behavior: 'smooth' });
      setScrollPosition(index);
    }
  };

  const carregarPlanos = async () => {
    try {
      setLoading(true);
      setPlanos(await admPlanosService.listarAtivos());
      setError(null);
    } catch (err: any) {
      setError('Erro ao carregar planos');
      logger.error('Erro ao carregar planos', err);
    } finally { setLoading(false); }
  };

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(valor);

  const voltarParaPlanos = () => { setEtapa('planos'); setError(null); setSuccess(null); };

  const validarCPF = (cpf: string): boolean => {
    const c = cpf.replace(/\D/g, '');
    if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(c[i]) * (10 - i);
    let resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    if (resto !== parseInt(c[9])) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(c[i]) * (11 - i);
    resto = (soma * 10) % 11;
    if (resto === 10 || resto === 11) resto = 0;
    return resto === parseInt(c[10]);
  };

  const formatarCPF = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 11) return n.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    return v;
  };

  const formatarDataBR = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 8) return n.replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2');
    return v;
  };

  const converterDataISO = (dataBR: string): string => {
    const [dia, mes, ano] = dataBR.split('/');
    if (dia && mes && ano && ano.length === 4) return `${ano}-${mes.padStart(2,'0')}-${dia.padStart(2,'0')}`;
    return '';
  };

  const calcularDataLimiteTeste = (): string => {
    const d = new Date(); d.setDate(d.getDate() + 7);
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  const formatarTelefone = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 11) {
      if (n.length <= 10) return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
      return n.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
    }
    return v;
  };

  const formatarCEP = (v: string) => {
    const n = v.replace(/\D/g, '');
    if (n.length <= 8) return n.replace(/(\d{5})(\d)/, '$1-$2');
    return v;
  };

  const buscarCEP = async (cep: string) => {
    const c = cep.replace(/\D/g, '');
    if (c.length === 8) {
      try {
        const r = await fetch(`https://viacep.com.br/ws/${c}/json/`);
        const d = await r.json();
        if (!d.erro) setFormData(prev => ({ ...prev, endereco: d.logradouro || '', bairro: d.bairro || '', cidade: d.localidade || '', uf: d.uf || '' }));
      } catch (err: any) { logger.error('Erro ao buscar CEP', err); }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    let v = value;
    if (name === 'cpf')          v = formatarCPF(value);
    else if (name === 'telefone') v = formatarTelefone(value);
    else if (name === 'cep')     { v = formatarCEP(value); if (value.replace(/\D/g,'').length === 8) buscarCEP(value); }
    else if (name === 'dt_nascimento') v = formatarDataBR(value);
    setFormData(prev => ({ ...prev, [name]: v }));
  };

  const validarFormulario = () => {
    if (!formData.nome.trim())         return 'Nome é obrigatório';
    if (!formData.email.trim())        return 'Email é obrigatório';
    if (!formData.cpf.trim())          return 'CPF é obrigatório';
    if (!formData.dt_nascimento)       return 'Data de nascimento é obrigatória';
    if (!formData.cep.trim())          return 'CEP é obrigatório';
    if (!formData.telefone.trim())     return 'Telefone é obrigatório';
    if (!formData.endereco.trim())     return 'Endereço é obrigatório';
    if (!formData.numero.trim())       return 'Número é obrigatório';
    if (!formData.bairro.trim())       return 'Bairro é obrigatório';
    if (!formData.cidade.trim())       return 'Cidade é obrigatória';
    if (!formData.uf.trim())           return 'UF é obrigatório';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) return 'Email inválido';
    if (!validarCPF(formData.cpf))     return 'CPF inválido';
    if (formData.dt_nascimento.replace(/\D/g,'').length !== 8) return 'Data de nascimento inválida';
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validarFormulario();
    if (err) { setError(err); return; }
    try {
      setSalvando(true); setError(null);
      const dadosAssinatura: Assinatura = {
        ...formData,
        id_adm_plano: planoSelecionado!,
        cpf:          formData.cpf.replace(/\D/g,''),
        telefone:     formData.telefone.replace(/\D/g,''),
        cep:          formData.cep.replace(/\D/g,''),
        dt_nascimento: converterDataISO(formData.dt_nascimento),
      };
      const result = await admAssinaturaService.criar(dadosAssinatura);
      if (result.id) setAssinaturaId(result.id);
      try {
        setStripePromise(getStripe());
      } catch (error: any) {
        logger.error('Erro ao carregar Stripe', error);
        setError('Erro ao carregar sistema de pagamento. Tente novamente.');
        return;
      }
      setEtapa('pagamento');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      logger.error('Erro ao criar assinatura', err);
      setError(err.response?.data?.erro || 'Erro ao criar assinatura');
    } finally { setSalvando(false); }
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Navbar institucional */}
      <Box component="header" sx={{
        top: 15, left: 15, right: 0, zIndex: 1000,
        background: 'rgba(255,255,255,0.97)',
        borderBottom: `1px solid ${P.border}`,
        padding: '1rem 0',
        fontFamily: '"Inter", system-ui, sans-serif',
      }}>
        <Container maxWidth={false} sx={{ maxWidth: '1200px', mx: 'auto', px: '2rem' }}>
          <Box component="nav" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <img src={`${SERVER_NAME}/images/logo_site.png`} alt="Logo MindTax" />
            </Box>

            <Box component="ul" sx={{ display: { xs: 'none', md: 'flex' }, gap: '2rem', listStyle: 'none', m: 0, p: 0 }}>
              {[
                { href: `${SERVER_NAME}/index.html#inicio`,         label: 'Início' },
                { href: `${SERVER_NAME}/index.html#funcionalidades`, label: 'Funcionalidades' },
                { href: `${SERVER_NAME}/index.html#beneficios`,      label: 'Benefícios' },
                { href: `${SERVER_NAME}/index.html#depoimentos`,     label: 'Depoimentos' },
                { href: `${SERVER_NAME}/index.html#precos`,          label: 'Preços' },
              ].map(({ href, label }) => (
                <li key={label}>
                  <a href={href} style={{ color: P.textSub, textDecoration: 'none', fontWeight: 500, fontSize: '0.9375rem' }}
                    onMouseEnter={e => (e.currentTarget.style.color = P.cyan)}
                    onMouseLeave={e => (e.currentTarget.style.color = P.textSub)}>
                    {label}
                  </a>
                </li>
              ))}
            </Box>

            <Box sx={{ display: { xs: 'none', md: 'flex' }, gap: '0.75rem' }}>
              <a href="/login" style={{
                padding: '0.625rem 1.25rem', borderRadius: '8px', fontWeight: 600,
                textDecoration: 'none', display: 'inline-block', fontSize: '0.875rem',
                color: P.text, border: `1px solid ${P.border}`, background: 'transparent',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = P.cyan; e.currentTarget.style.background = P.inputBg; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = P.border; e.currentTarget.style.background = 'transparent'; }}>
                Acessar Sistema
              </a>
              <a href="/assinar" style={{
                padding: '0.625rem 1.25rem', borderRadius: '8px', fontWeight: 700,
                textDecoration: 'none', display: 'inline-block', fontSize: '0.875rem',
                background: P.cyan, color: P.navy, border: `1px solid ${P.cyan}`,
              }}
                onMouseEnter={e => { e.currentTarget.style.background = '#00b8e0'; }}
                onMouseLeave={e => { e.currentTarget.style.background = P.cyan; }}>
                Assinar Agora
              </a>
            </Box>

            {/* Mobile hamburger */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: '5px', cursor: 'pointer', p: '8px' }}>
              {[0, 1, 2].map(i => <Box key={i} sx={{ width: '24px', height: '2px', backgroundColor: P.text }} />)}
            </Box>
          </Box>
        </Container>
      </Box>

      <Container maxWidth={false} sx={{ maxWidth: '1200px', mx: 'auto', px: '2rem', mt: '1.5rem', mb: 6 }}>
        {error   && <Alert severity="error"   sx={{ mb: 4, borderRadius: '10px' }} onClose={() => setError(null)}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 4, borderRadius: '10px' }}>{success}</Alert>}
        {loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress sx={{ color: P.cyan }} /></Box>}

        {/* ── ETAPA 1: Planos ──────────────────────────────────────────────── */}
        {etapa === 'planos' && !loading && !error && planos.length > 0 && (
          <>
            <Box sx={{ textAlign: 'center', mb: 6 }}>
              <Typography sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 800, color: P.text, letterSpacing: '-0.03em', mb: 1 }}>
                Planos que cabem no seu bolso
              </Typography>
              <Typography sx={{ fontSize: '1.0625rem', color: P.textSub }}>
                Escolha o plano ideal para o tamanho da sua prática
              </Typography>
            </Box>

            {/* Cards */}
            <Box
              id="planos-container"
              onScroll={handleScroll}
              sx={{
                display: 'flex', justifyContent: 'center', gap: 4,
                overflowX: 'auto', scrollSnapType: 'x mandatory', scrollBehavior: 'smooth',
                py: 3, px: 2,
                '&::-webkit-scrollbar': { display: 'none' },
                msOverflowStyle: 'none', scrollbarWidth: 'none',
              }}
            >
              {planos.map((plano, index) => {
                const selected = planoSelecionado === plano.id;
                return (
                  <Paper
                    key={plano.id}
                    elevation={selected ? 8 : 0}
                    onClick={() => setPlanoSelecionado(plano.id!)}
                    sx={{
                      p: 4, display: 'flex', flexDirection: 'column',
                      borderRadius: '16px', position: 'relative',
                      border: selected ? `2px solid ${P.cyan}` : `1px solid ${P.border}`,
                      transition: 'all 0.25s ease',
                      transform: selected ? 'scale(1.03)' : 'scale(1)',
                      minWidth: '380px', maxWidth: '380px', scrollSnapAlign: 'start',
                      cursor: 'pointer',
                      backgroundColor: selected ? 'rgba(0,200,240,0.04)' : '#fff',
                      boxShadow: selected
                        ? `0 8px 32px rgba(0,200,240,0.18)`
                        : '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
                      '&:hover': { transform: 'translateY(-4px)', boxShadow: '0 12px 40px rgba(0,0,0,0.12)', borderColor: P.cyan },
                    }}
                  >
                    <Chip
                      label={index === 1 ? 'Mais Popular' : 'Ideal para iniciar'}
                      size="small"
                      sx={{
                        mb: 2, fontWeight: 700, fontSize: '0.75rem', alignSelf: 'flex-start',
                        backgroundColor: index === 1 ? P.cyan : 'rgba(15,30,60,0.07)',
                        color: index === 1 ? P.navy : P.text,
                      }}
                    />

                    <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: P.text, mb: 1.5 }}>
                      {plano.descricao}
                    </Typography>

                    <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1.5, gap: 0.5 }}>
                      <Typography sx={{ fontSize: '1rem', color: P.textSub }}>R$</Typography>
                      <Typography sx={{ fontSize: '2.25rem', fontWeight: 800, color: P.cyan, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>
                        {formatarValor(plano.valor)}
                      </Typography>
                      <Typography sx={{ fontSize: '1rem', color: P.textSub }}>/mês</Typography>
                    </Box>

                    <Typography sx={{ fontSize: '0.875rem', color: P.textSub, mb: 2.5 }}>
                      Para psicólogos e médicos em consultório individual
                    </Typography>

                    <Box sx={{ flex: 1, mb: 2 }}>
                      {plano.itens && plano.itens.length > 0
                        ? plano.itens.filter(item => item.ativo === 'S').map((item, i, arr) => (
                          <Box key={i} sx={{
                            display: 'flex', alignItems: 'flex-start', gap: 1.25, py: 1.25,
                            borderBottom: i < arr.length - 1 ? `1px solid ${P.border}` : 'none',
                          }}>
                            <Check sx={{ color: '#66BB6A', fontSize: 18, mt: 0.2, flexShrink: 0 }} />
                            <Typography sx={{ fontSize: '0.875rem', color: P.text }}>{item.descricao}</Typography>
                          </Box>
                        ))
                        : <Typography sx={{ fontSize: '0.875rem', color: P.textSub }}>Nenhum item disponível</Typography>
                      }
                    </Box>
                  </Paper>
                );
              })}
            </Box>

            {/* Dots */}
            {planos.length > 2 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', gap: 1.5, mt: 3 }}>
                {planos.slice(0, -1).map((plano, i) => (
                  <Box key={plano.id} onClick={() => scrollToCard(i)} sx={{
                    width: scrollPosition === i ? '28px' : '10px', height: '10px',
                    borderRadius: '5px', cursor: 'pointer', transition: 'all 0.25s',
                    backgroundColor: scrollPosition === i ? P.cyan : 'rgba(15,30,60,0.15)',
                    '&:hover': { backgroundColor: scrollPosition === i ? '#00b8e0' : 'rgba(15,30,60,0.3)' },
                  }} />
                ))}
              </Box>
            )}

            {/* CTA */}
            <Box sx={{ display: 'flex', justifyContent: 'center', mt: 5 }}>
              <Button
                variant="contained"
                size="large"
                disabled={!planoSelecionado}
                onClick={() => { setEtapa('dados'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                sx={{
                  height: 52, px: 6, borderRadius: '12px', fontWeight: 700,
                  fontSize: '1rem', textTransform: 'none', minWidth: 250,
                  backgroundColor: P.cyan, color: P.navy,
                  boxShadow: P.cyanGlow,
                  '&:hover': { backgroundColor: '#00b8e0' },
                  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.3)', color: P.navy },
                }}
              >
                Próximo
              </Button>
            </Box>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
              <Typography sx={{ color: P.textSub, fontSize: '1rem' }}>
                Todos os planos incluem 7 dias de teste grátis.
              </Typography>
              <Typography sx={{ color: P.textSub, fontSize: '0.9375rem', mt: 1.5 }}>
                Ao selecionar um plano, você precisará informar seus dados pessoais.{' '}
                Verifique nossa{' '}
                <a href={`${SERVER_NAME}/privacidade.html`} style={{ color: P.cyan }}>Política de Privacidade</a>{' '}
                e{' '}
                <a href={`${SERVER_NAME}/lgpd.html`} style={{ color: P.cyan }}>Conformidade LGPD</a>.
              </Typography>
            </Box>
          </>
        )}

        {/* ── ETAPA 2: Dados ───────────────────────────────────────────────── */}
        {etapa === 'dados' && (
          <Box>
            <Button
              startIcon={<ArrowBack />}
              onClick={voltarParaPlanos}
              sx={{ mb: 3, textTransform: 'none', color: P.textSub, fontWeight: 600 }}
            >
              Voltar para Planos
            </Button>

            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Typography sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 800, color: P.text, letterSpacing: '-0.03em', mb: 1 }}>
                Complete sua Assinatura
              </Typography>
              <Typography sx={{ color: P.textSub, fontSize: '1.0625rem' }}>
                Preencha seus dados para finalizar
              </Typography>
            </Box>

            {/* Resumo do plano */}
            <Paper elevation={0} sx={{
              p: 3, maxWidth: 800, mx: 'auto', mb: 4,
              borderRadius: '12px', border: `2px solid ${P.cyan}`,
              backgroundColor: 'rgba(0,200,240,0.04)',
            }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: P.textSub, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 2 }}>
                Plano Selecionado
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: P.textSub }}>Plano</Typography>
                  <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, color: P.text }}>
                    {planos.find(p => p.id === planoSelecionado)?.descricao}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: P.textSub }}>Valor Mensal</Typography>
                  <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, color: P.cyan }}>
                    R$ {formatarValor(planos.find(p => p.id === planoSelecionado)?.valor || 0)}
                  </Typography>
                </Box>
                <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#388E3C', fontWeight: 600 }}>
                    7 dias grátis — Teste até {calcularDataLimiteTeste()}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: '#D32F2F', mt: 0.5 }}>
                    *Após esse período, será cobrado o valor do plano.
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Formulário */}
            <Paper elevation={0} sx={{ p: 4, maxWidth: 800, mx: 'auto', borderRadius: '12px', border: `1px solid ${P.border}` }}>
              <form onSubmit={handleSubmit}>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: P.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 2.5 }}>
                  Dados Pessoais
                </Typography>
                <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, mb: 4 }}>
                  <TextField fullWidth label="Nome Completo"      name="nome"           value={formData.nome}           onChange={handleInputChange} required sx={inputSx} />
                  <TextField fullWidth label="Email"  type="email" name="email"          value={formData.email}          onChange={handleInputChange} required sx={inputSx} />
                  <TextField fullWidth label="CPF"                name="cpf"            value={formData.cpf}            onChange={handleInputChange} required placeholder="000.000.000-00" slotProps={{ htmlInput: { maxLength: 14 } }} sx={inputSx} />
                  <TextField fullWidth label="Data de Nascimento" name="dt_nascimento"  value={formData.dt_nascimento}  onChange={handleInputChange} required placeholder="dd/mm/aaaa"     slotProps={{ htmlInput: { maxLength: 10 } }} helperText="Formato: dd/mm/aaaa" sx={inputSx} />
                  <TextField fullWidth label="Telefone"           name="telefone"       value={formData.telefone}       onChange={handleInputChange} required placeholder="(00) 00000-0000" slotProps={{ htmlInput: { maxLength: 15 } }} sx={inputSx} />
                </Box>

                <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: P.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 2.5 }}>
                  Endereço
                </Typography>
                <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                  <TextField fullWidth label="CEP"       name="cep"          value={formData.cep}         onChange={handleInputChange} required placeholder="00000-000"  slotProps={{ htmlInput: { maxLength: 9 } }} sx={inputSx} />
                  <TextField fullWidth label="Endereço"  name="endereco"     value={formData.endereco}    onChange={handleInputChange} required sx={inputSx} />
                  <TextField fullWidth label="Número"    name="numero"       value={formData.numero}      onChange={handleInputChange} required sx={inputSx} />
                  <TextField fullWidth label="Complemento" name="complemento" value={formData.complemento} onChange={handleInputChange} sx={inputSx} />
                  <TextField fullWidth label="Bairro"    name="bairro"       value={formData.bairro}      onChange={handleInputChange} required sx={inputSx} />
                  <TextField fullWidth label="Cidade"    name="cidade"       value={formData.cidade}      onChange={handleInputChange} required sx={inputSx} />
                  <TextField fullWidth select label="UF" name="uf"           value={formData.uf}          onChange={handleInputChange} required sx={inputSx}>
                    {UFs.map(uf => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
                  </TextField>
                </Box>

                <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 4 }}>
                  <Button
                    type="button"
                    variant="outlined"
                    size="large"
                    onClick={voltarParaPlanos}
                    sx={{ height: 52, px: 4, borderRadius: '12px', textTransform: 'none', fontWeight: 600, fontSize: '1rem', borderColor: P.border, color: P.textSub }}
                  >
                    Voltar
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    disabled={salvando}
                    sx={{ height: 52, px: 4, borderRadius: '12px', fontWeight: 700, textTransform: 'none', fontSize: '1rem', minWidth: 220, backgroundColor: P.cyan, color: P.navy, boxShadow: P.cyanGlow, '&:hover': { backgroundColor: '#00b8e0' } }}
                  >
                    {salvando ? <CircularProgress size={22} sx={{ color: P.navy }} /> : 'Ir para Pagamento'}
                  </Button>
                </Box>

                <Typography sx={{ textAlign: 'center', mt: 3, color: P.textSub, fontSize: '0.875rem' }}>
                  Ao assinar, você concorda com nossos{' '}
                  <a href={`${SERVER_NAME}/termos.html`} style={{ color: P.cyan }}>Termos de Uso</a>{' '}
                  e{' '}
                  <a href={`${SERVER_NAME}/privacidade.html`} style={{ color: P.cyan }}>Política de Privacidade</a>.
                </Typography>
              </form>
            </Paper>
          </Box>
        )}

        {/* ── ETAPA 3: Pagamento ───────────────────────────────────────────── */}
        {etapa === 'pagamento' && assinaturaId && (
          <Box>
            <Button
              startIcon={<ArrowBack />}
              onClick={() => setEtapa('dados')}
              sx={{ mb: 3, textTransform: 'none', color: P.textSub, fontWeight: 600 }}
            >
              Voltar
            </Button>

            <Box sx={{ textAlign: 'center', mb: 5 }}>
              <Typography sx={{ fontSize: { xs: '1.75rem', md: '2.25rem' }, fontWeight: 800, color: P.text, letterSpacing: '-0.03em', mb: 1 }}>
                Finalize sua Assinatura
              </Typography>
              <Typography sx={{ color: P.textSub, fontSize: '1.0625rem' }}>
                Cadastre seu cartão de crédito
              </Typography>
            </Box>

            {/* Resumo */}
            <Paper elevation={0} sx={{ p: 3, maxWidth: 800, mx: 'auto', mb: 4, borderRadius: '12px', border: `2px solid ${P.cyan}`, backgroundColor: 'rgba(0,200,240,0.04)' }}>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: P.textSub, textTransform: 'uppercase', letterSpacing: '0.04em', mb: 2 }}>
                Resumo da Assinatura
              </Typography>
              <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
                <Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: P.textSub }}>Plano</Typography>
                  <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, color: P.text }}>
                    {planos.find(p => p.id === planoSelecionado)?.descricao}
                  </Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.8125rem', color: P.textSub }}>Valor Mensal</Typography>
                  <Typography sx={{ fontSize: '1.0625rem', fontWeight: 700, color: P.cyan }}>
                    R$ {formatarValor(planos.find(p => p.id === planoSelecionado)?.valor || 0)}
                  </Typography>
                </Box>
                <Box sx={{ gridColumn: { xs: '1', md: '1 / -1' } }}>
                  <Typography sx={{ fontSize: '0.875rem', color: '#388E3C', fontWeight: 600 }}>
                    7 dias grátis — Teste até {calcularDataLimiteTeste()}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: P.textSub, mt: 0.5 }}>
                    Seu cartão será validado agora, mas você só será cobrado após o período de teste.
                  </Typography>
                </Box>
              </Box>
            </Paper>

            {/* Stripe */}
            <Paper elevation={0} sx={{ p: 4, maxWidth: 800, mx: 'auto', borderRadius: '12px', border: `1px solid ${P.border}` }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, color: P.textSub, textTransform: 'uppercase', letterSpacing: '0.06em', mb: 2.5 }}>
                Dados do Cartão de Crédito
              </Typography>

              {!stripePromise ? (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                  <CircularProgress sx={{ color: P.cyan }} />
                  <Typography sx={{ mt: 2, color: P.textSub, fontSize: '0.875rem' }}>Carregando sistema de pagamento...</Typography>
                </Box>
              ) : (
                <Elements stripe={stripePromise}>
                  <PaymentForm
                    assinaturaId={assinaturaId}
                    isTestMode={import.meta.env.DEV}
                    onSuccess={() => {
                      setSuccess('Assinatura confirmada! Você receberá um email com as instruções de acesso.');
                      setTimeout(() => {
                        setFormData({ nome: '', email: '', cpf: '', id_adm_plano: 0, dt_nascimento: '', cep: '', telefone: '', endereco: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '' });
                        setPlanoSelecionado(null); setAssinaturaId(null);
                        setEtapa('planos'); setSuccess(null);
                      }, 3000);
                    }}
                    onBack={() => setEtapa('dados')}
                  />
                </Elements>
              )}

              <Box sx={{ mt: 3, p: 2, backgroundColor: '#F8FAFC', borderRadius: '10px', border: `1px solid ${P.border}` }}>
                <Typography sx={{ textAlign: 'center', fontSize: '0.8125rem', color: P.textSub }}>
                  Seus dados são protegidos com criptografia SSL/TLS.
                  Os dados do cartão são processados de forma segura pelo Stripe.
                </Typography>
              </Box>
            </Paper>
          </Box>
        )}

        {/* Sem planos */}
        {!loading && !error && planos.length === 0 && etapa === 'planos' && (
          <Alert severity="info" sx={{ mt: 4, borderRadius: '10px' }}>
            Nenhum plano disponível no momento. Entre em contato conosco.
          </Alert>
        )}
      </Container>
    </>
  );
}
