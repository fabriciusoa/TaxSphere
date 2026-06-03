import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Box,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  CircularProgress,
  IconButton,
  InputAdornment
} from '@mui/material';
import {
  VisibilityOff,
  Visibility,
  CheckCircle,
  Psychology,
  TrendingUp,
  Shield,
} from '@mui/icons-material';
import ForgotPasswordDialog from '../components/ForgotPasswordDialog';
import RequestAccessDialog from '../components/RequestAccessDialog';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

const APP_VERSION = '1.0.0';

// Design tokens — Synchro / TaxSphere
const T = {
  // Brand
  navy:       '#00071A',
  navyMid:    '#00071A',
  navyLight:  '#0f2347',
  cyan:       '#00c8f0',
  cyanGlow:   'rgba(0, 200, 240, 0.28)',

  // Painel esquerdo — dark (form)
  formBg:     '#00071A',
  inputBg:    'rgba(255, 255, 255, 0.06)',
  inputBorder:'rgba(255, 255, 255, 0.13)',
  inputHover: 'rgba(255, 255, 255, 0.22)',
  textWhite:  '#FFFFFF',
  textWhite60:'rgba(255, 255, 255, 0.60)',
  textWhite35:'rgba(255, 255, 255, 0.35)',

  // Painel direito — light (brand)
  brandBg:    '#FFFFFF',
  brandDot:   'rgba(10, 22, 40, 0.05)',
  navyText:   '#0a1628',
  slateText:  '#64748b',
  slateLight: 'rgba(100, 116, 139, 0.65)',
} as const;

// Inputs adaptados para superfície escura
const inputSx = {
  mb: 0.5,
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg,
    borderRadius: '10px',
    fontSize: '0.9375rem',
    color: T.textWhite,
    '& fieldset': {
      borderColor: T.inputBorder,
      transition: 'border-color 0.18s ease',
    },
    '&:hover fieldset': {
      borderColor: T.inputHover,
    },
    '&.Mui-focused fieldset': {
      borderColor: T.cyan,
      borderWidth: 1.5,
    },
  },
  // Sem label flutuante — usamos label externo (Typography) acima do input
  '& .MuiOutlinedInput-notchedOutline legend': {
    display: 'none',
  },
  '& .MuiInputBase-input': {
    color: T.textWhite,
    '&::placeholder': { color: T.textWhite35 },
  },
} as const;

// Label externo — padrão moderno (Stripe/Vercel/Linear): claro, fixo acima do input
const fieldLabelSx = {
  display: 'block',
  mb: 0.75,
  fontSize: '0.8125rem',
  fontWeight: 600,
  color: 'rgba(255,255,255,0.92)',
  letterSpacing: '0.01em',
} as const;

const SLIDES = [
  {
    icon: Psychology,
    line1: 'Gestão fiscal inteligente,',
    line2: 'sem complicações.',
    body: 'PER/DCOMP, recuperação de PIS/COFINS, DCTF Web, gestão de CNDs e reclassificação de NCM — tudo integrado em um único ambiente.',
    badges: ['Conforme LGPD', 'Suporte dedicado', 'Módulos fiscais'],
  },
  {
    icon: TrendingUp,
    line1: 'Recupere créditos tributários',
    line2: 'com precisão.',
    body: 'Identifique oportunidades de compensação de PIS, COFINS e IRPJ que passam despercebidas — maximize seus créditos fiscais automaticamente.',
    badges: ['PIS & COFINS', 'PER/DCOMP', 'MIT'],
  },
  {
    icon: Shield,
    line1: 'Conformidade fiscal',
    line2: 'em tempo real.',
    body: 'Monitore CNDs, acompanhe sua Caixa Postal eCac e mantenha suas obrigações acessórias sempre em dia — sem acessar múltiplos portais.',
    badges: ['DCTF Web', 'Gestão de CNDs', 'eCac'],
  },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const foiRedirecionadoPorManutencao = searchParams.get('manutencao') === 'true';
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [erro, setErro] = useState('');
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [requestAccessOpen, setRequestAccessOpen] = useState(false);
  const [slideIndex, setSlideIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setSlideIndex((i) => (i + 1) % SLIDES.length);
        setVisible(true);
      }, 500);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setLoading(true);
    try {
      await login(usuario, senha);
      navigate('/dashboard');
    } catch (error: any) {
      setErro(error.response?.data?.message || 'Erro ao fazer login');
      logger.error('Erro ao fazer login', error);
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    if (!usuario) {
      setErro('Por favor, informe seu e-mail antes de recuperar a senha');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(usuario)) {
      setErro('Por favor, informe um e-mail válido');
      return;
    }
    setErro('');
    setForgotPasswordOpen(true);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* ─── ESQUERDA — Form (dark) ─── */}
      <Box
        sx={{
          width: { xs: '100%', md: '38%' },
          minWidth: { md: 420 },
          background: `linear-gradient(160deg, ${T.navy} 0%, ${T.navyMid} 100%)`,
          display: 'flex',
          flexDirection: 'column',
          px: { xs: 4, sm: 7 },
          py: 6,
          position: 'relative',
          zIndex: 2,
          overflow: 'hidden',
        }}
      >
        {/* Textura de pontos sutil no fundo do form */}
        <Box sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'radial-gradient(circle, rgba(0,200,240,0.08) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
          pointerEvents: 'none',
        }} />

        {/* Glow orb no canto superior direito */}
        <Box sx={{
          position: 'absolute',
          top: '-20%',
          right: '-20%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(0,200,240,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Logo — PNG transparente limpo */}
        <Box sx={{ mb: 6, position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'center' }}>
          <img
            src="/TaxSphere_clean.png"
            alt="TaxSphere"
            style={{
              width: '100%',
              maxWidth: 320,
              height: 'auto',
              objectFit: 'contain',
              display: 'block',
            }}
          />
        </Box>

        {/* Heading */}
        <Box sx={{ mb: 3.5, position: 'relative', zIndex: 1 }}>
          <Typography sx={{
            fontSize: '1.5rem',
            fontWeight: 700,
            color: T.textWhite,
            letterSpacing: '-0.025em',
            lineHeight: 1.2,
            mb: 0.75,
          }}>
            Acesse sua conta
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textWhite60 }}>
            Bem-vindo de volta ao TaxSphere
          </Typography>
        </Box>

        {/* Alerts */}
        {foiRedirecionadoPorManutencao && (
          <Alert severity="warning" sx={{ mb: 2.5, borderRadius: 2, position: 'relative', zIndex: 1 }}>
            O sistema entrou em manutenção. Tente novamente mais tarde.
          </Alert>
        )}
        {erro && (
          <Alert severity="error" sx={{ mb: 2.5, borderRadius: 2, position: 'relative', zIndex: 1 }}>
            {erro}
          </Alert>
        )}

        {/* Form */}
        <Box component="form" onSubmit={handleSubmit} sx={{ flex: 1, position: 'relative', zIndex: 1 }}>
          <Box sx={{ mb: 2.5 }}>
            <Typography component="label" htmlFor="login-email" sx={fieldLabelSx}>
              E-mail <Box component="span" sx={{ color: T.cyan }}>*</Box>
            </Typography>
            <TextField
              id="login-email"
              fullWidth
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              required
              autoFocus
              disabled={loading}
              sx={inputSx}
            />
          </Box>

          <Box sx={{ mb: 2.5 }}>
            <Typography component="label" htmlFor="login-senha" sx={fieldLabelSx}>
              Senha <Box component="span" sx={{ color: T.cyan }}>*</Box>
            </Typography>
            <TextField
              id="login-senha"
              type={showPassword ? 'text' : 'password'}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite sua senha"
              required
              fullWidth
              disabled={loading}
              sx={inputSx}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                      size="small"
                      tabIndex={-1}
                      sx={{ color: T.textWhite60 }}
                    >
                      {showPassword
                        ? <VisibilityOff sx={{ fontSize: 18 }} />
                        : <Visibility sx={{ fontSize: 18 }} />}
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
          </Box>

          <Button
            type="submit"
            fullWidth
            disabled={loading}
            sx={{
              mt: 3,
              mb: 2,
              height: 48,
              borderRadius: '10px',
              backgroundColor: T.cyan,
              color: T.navy,
              fontWeight: 700,
              fontSize: '0.9375rem',
              letterSpacing: '0.01em',
              textTransform: 'none',
              boxShadow: `0 4px 18px ${T.cyanGlow}`,
              transition: 'background-color 0.18s ease, box-shadow 0.18s ease',
              '&:hover': {
                backgroundColor: '#00b8e0',
                boxShadow: `0 6px 22px rgba(0, 200, 240, 0.40)`,
              },
              '&:active': { backgroundColor: '#00a8d0' },
              '&.Mui-disabled': {
                backgroundColor: 'rgba(0, 200, 240, 0.3)',
                color: T.navy,
              },
            }}
          >
            {loading ? <CircularProgress size={22} sx={{ color: T.navy }} /> : 'Entrar'}
          </Button>

          <Box sx={{ textAlign: 'center' }}>
            <Link
              href="#"
              onClick={(e) => { e.preventDefault(); handleForgotPassword(); }}
              underline="hover"
              sx={{
                fontSize: '0.8125rem',
                color: T.textWhite60,
                transition: 'color 0.15s ease',
                '&:hover': { color: T.cyan },
              }}
            >
              Esqueci minha senha
            </Link>
          </Box>
        </Box>

        {/* Footer */}
        <Box sx={{ mt: 4, textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <Typography sx={{ fontSize: '0.6875rem', color: T.textWhite35, letterSpacing: '0.01em' }}>
            Versão {APP_VERSION} · © {format(new Date(), 'yyyy')} TaxSphere
          </Typography>
        </Box>
      </Box>

      {/* ─── DIREITA — Brand (light) ─── */}
      <Box
        sx={{
          display: { xs: 'none', md: 'flex' },
          flex: 1,
          backgroundColor: T.brandBg,
          flexDirection: 'column',
          justifyContent: 'center',
          px: { md: 8, lg: 12 },
          py: 8,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Textura de pontos navy — espelho do lado esquerdo */}
        <Box sx={{
          position: 'absolute',
          inset: 0,
          backgroundImage: `radial-gradient(circle, ${T.brandDot} 1px, transparent 1px)`,
          backgroundSize: '28px 28px',
          pointerEvents: 'none',
        }} />

        {/* Linha de acento no topo */}
        <Box sx={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${T.cyan} 0%, transparent 55%)`,
          opacity: 0.7,
        }} />

        {/* Glow orb no canto inferior direito */}
        <Box sx={{
          position: 'absolute',
          bottom: '-10%',
          right: '-8%',
          width: 480,
          height: 480,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(10,22,40,0.04) 0%, transparent 68%)',
          pointerEvents: 'none',
        }} />

        {/* Conteúdo com fade */}
        <Box sx={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 520,
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}>
          {/* Icon badge */}
          <Box sx={{
            width: 56,
            height: 56,
            borderRadius: '14px',
            backgroundColor: T.navy,
            border: `1px solid rgba(10,22,40,0.12)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 5,
          }}>
            {(() => { const Icon = SLIDES[slideIndex].icon; return <Icon sx={{ color: T.cyan, fontSize: 28 }} />; })()}
          </Box>

          {/* Headline */}
          <Typography sx={{
            fontSize: 'clamp(1.875rem, 3vw, 2.625rem)',
            fontWeight: 700,
            color: T.navyText,
            lineHeight: 1.15,
            letterSpacing: '-0.03em',
            mb: 0.5,
          }}>
            {SLIDES[slideIndex].line1}
          </Typography>
          <Typography sx={{
            fontSize: 'clamp(1.875rem, 3vw, 2.625rem)',
            fontWeight: 700,
            color: T.cyan,
            fontStyle: 'italic',
            lineHeight: 1.2,
            letterSpacing: '-0.03em',
            mb: 3.5,
          }}>
            {SLIDES[slideIndex].line2}
          </Typography>

          {/* Body */}
          <Typography sx={{
            color: T.slateText,
            fontSize: '0.9375rem',
            lineHeight: 1.75,
            mb: 5.5,
          }}>
            {SLIDES[slideIndex].body}
          </Typography>

          {/* Badges */}
          <Box sx={{ display: 'flex', gap: 3.5, flexWrap: 'wrap' }}>
            {SLIDES[slideIndex].badges.map((label) => (
              <Box key={label} sx={{ display: 'flex', alignItems: 'center', gap: 0.875 }}>
                <CheckCircle sx={{ color: T.cyan, fontSize: 15 }} />
                <Typography sx={{
                  color: T.slateText,
                  fontSize: '0.8125rem',
                  fontWeight: 500,
                  letterSpacing: '0.005em',
                }}>
                  {label}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>

        {/* Progress dots */}
        <Box sx={{
          position: 'absolute',
          bottom: 44,
          right: { md: 64, lg: 96 },
          display: 'flex',
          gap: 1,
          alignItems: 'center',
        }}>
          {SLIDES.map((_, i) => (
            <Box
              key={i}
              onClick={() => { setVisible(false); setTimeout(() => { setSlideIndex(i); setVisible(true); }, 500); }}
              sx={{
                width: i === slideIndex ? 28 : 8,
                height: 4,
                borderRadius: 2,
                backgroundColor: i === slideIndex ? T.cyan : 'rgba(10,22,40,0.15)',
                transition: 'all 0.4s ease',
                cursor: 'pointer',
              }}
            />
          ))}
        </Box>
      </Box>

      {/* Dialogs */}
      <ForgotPasswordDialog
        open={forgotPasswordOpen}
        onClose={() => setForgotPasswordOpen(false)}
        email={usuario}
      />
      <RequestAccessDialog
        open={requestAccessOpen}
        onClose={() => setRequestAccessOpen(false)}
      />
    </Box>
  );
}
