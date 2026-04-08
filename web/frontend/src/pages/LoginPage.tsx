import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import {
  Box,
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Alert,
  Link,
  CircularProgress,
  IconButton,
  InputAdornment
} from '@mui/material';
import { VisibilityOff, Visibility } from '@mui/icons-material';
import ForgotPasswordDialog from '../components/ForgotPasswordDialog';
import RequestAccessDialog from '../components/RequestAccessDialog';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

const APP_VERSION = '1.0.0';

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
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'background.default'
      }}
    >
      <Container maxWidth="sm">
        <Paper elevation={3} sx={{ p: 4 }}>
          <Box sx={{ textAlign: 'center', mb: 0 }}>
            <img src="/imagens/logo_login.png" alt="Logo" className="logo" />
          </Box>

          {foiRedirecionadoPorManutencao && (
            <Alert severity="warning" sx={{ mb: 2 }}>
              O sistema entrou em manutenção. Tente novamente mais tarde.
            </Alert>
          )}

          {erro && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {erro}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="E-Mail"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              margin="normal"
              required
              autoFocus
              disabled={loading}
            />
            <TextField
              label="Senha"
              type={showPassword ? 'text' : 'password'}
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Digite sua senha"
              required
              fullWidth
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => setShowPassword(!showPassword)}
                      edge="end"
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Box sx={{ display: 'flex', gap: 2, }}>
              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                sx={{ mt: 3, mb: 2 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Entrar'}
              </Button>
            </Box>
            <Box sx={{ display: 'flex', gap: 2, textAlign: 'center', justifyContent: 'center' }}>
              <Link
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  handleForgotPassword();
                }}
                underline="hover"
                sx={{ fontSize: '0.875rem' }}
              >
                Esqueci minha senha
              </Link>

            </Box>
          </Box>
          <Box sx={{ mt: 1, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">
              Versão {APP_VERSION} | © {format(new Date(), 'dd/MM/yyyy')}
            </Typography>
          </Box>
        </Paper>
      </Container>
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
