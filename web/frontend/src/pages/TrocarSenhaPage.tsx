import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  List,
  ListItem,
  ListItemIcon,
  ListItemText
} from '@mui/material';
import {
  Lock as LockIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:        '#00c8f0',
  cyanGlow:    '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:   '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary: '#1a2332',
  textSecond:  '#64748b',
  border:      'rgba(15, 30, 60, 0.10)',
  surface:     '#FFFFFF',
  inputBg:     '#F7F9FC',
  navy:        '#0a1628',
  cardShadow:  '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg,
    borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { color: T.textSecond, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: T.cyan },
};

export default function TrocarSenhaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const requisitos = [
    { id: 'length',    label: 'Mínimo 8 caracteres',          test: (s: string) => s.length >= 8 },
    { id: 'lowercase', label: 'Pelo menos 1 letra minúscula', test: (s: string) => /[a-z]/.test(s) },
    { id: 'uppercase', label: 'Pelo menos 1 letra maiúscula', test: (s: string) => /[A-Z]/.test(s) },
    { id: 'special',   label: 'Pelo menos 1 caractere especial', test: (s: string) => /[\W_]/.test(s) },
  ];

  const validarSenha = (senha: string) => {
    const erros = [];
    if (senha.length < 8) erros.push('mínimo 8 caracteres');
    if (!/[a-z]/.test(senha)) erros.push('pelo menos 1 letra minúscula');
    if (!/[A-Z]/.test(senha)) erros.push('pelo menos 1 letra maiúscula');
    if (!/[\W_]/.test(senha)) erros.push('pelo menos 1 caractere especial');
    return erros;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErro('');
    setSucesso('');

    if (!senhaAtual || !novaSenha || !confirmarSenha) {
      setErro('Todos os campos são obrigatórios');
      return;
    }
    if (novaSenha !== confirmarSenha) {
      setErro('A nova senha e a confirmação não coincidem');
      return;
    }
    if (senhaAtual === novaSenha) {
      setErro('A nova senha deve ser diferente da senha atual');
      return;
    }
    const errosValidacao = validarSenha(novaSenha);
    if (errosValidacao.length > 0) {
      setErro(`A senha deve ter: ${errosValidacao.join(', ')}`);
      return;
    }

    if (!user?.id) {
      setErro('Sessão expirada. Faça login novamente.');
      return;
    }

    setLoading(true);
    try {
      await api.put(`/usuarios/${user.id}/senha`, { senhaAtual, novaSenha });
      setSucesso('Senha alterada com sucesso!');
      setTimeout(() => navigate('/dashboard'), 2000);
    } catch (error: any) {
      logger.error('Erro ao alterar senha', { error: error.message, userId: user?.id });
      setErro(error.response?.data?.message || 'Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  const allOk = requisitos.every(r => r.test(novaSenha));

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto', mt: 2, fontFamily: '"Inter", system-ui, sans-serif' }}>
      <Card elevation={0} sx={{
        borderRadius: '16px',
        border: `1px solid ${T.border}`,
        boxShadow: T.cardShadow,
        backgroundColor: T.surface,
      }}>
        <CardContent sx={{ p: { xs: 3, sm: 4 } }}>

          {/* Header */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3.5 }}>
            <Box sx={{
              width: 44, height: 44, borderRadius: '12px',
              backgroundColor: 'rgba(0,200,240,0.08)',
              border: '1px solid rgba(0,200,240,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <LockIcon sx={{ color: T.cyan, fontSize: 22 }} />
            </Box>
            <Box>
              <Typography sx={{
                fontSize: '1.125rem', fontWeight: 700,
                color: T.textPrimary, letterSpacing: '-0.02em',
              }}>
                Trocar Senha
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, mt: 0.25 }}>
                Altere sua senha de acesso ao sistema
              </Typography>
            </Box>
          </Box>

          {erro && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: '10px', fontSize: '0.875rem' }}>
              {erro}
            </Alert>
          )}
          {sucesso && (
            <Alert severity="success" sx={{ mb: 2.5, borderRadius: '10px', fontSize: '0.875rem' }}>
              {sucesso}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              fullWidth
              type="password"
              label="Senha Atual"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              required
              disabled={loading}
              autoFocus
              sx={inputSx}
            />
            <TextField
              fullWidth
              type="password"
              label="Nova Senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              required
              disabled={loading}
              sx={inputSx}
            />
            <TextField
              fullWidth
              type="password"
              label="Confirmar Nova Senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              required
              disabled={loading}
              sx={inputSx}
            />

            {/* Requisitos */}
            {novaSenha.length > 0 && (
              <Box sx={{
                p: 2, borderRadius: '10px',
                backgroundColor: allOk ? 'rgba(102,187,106,0.06)' : 'rgba(15,30,60,0.03)',
                border: `1px solid ${allOk ? 'rgba(102,187,106,0.22)' : 'rgba(15,30,60,0.08)'}`,
              }}>
                <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textPrimary, mb: 1 }}>
                  Requisitos da senha
                </Typography>
                <List dense disablePadding>
                  {requisitos.map((req) => {
                    const ok = req.test(novaSenha);
                    return (
                      <ListItem key={req.id} disablePadding sx={{ py: 0.25 }}>
                        <ListItemIcon sx={{ minWidth: 28 }}>
                          {ok
                            ? <CheckCircleIcon sx={{ fontSize: 16, color: '#66BB6A' }} />
                            : <UncheckedIcon sx={{ fontSize: 16, color: 'rgba(100,116,139,0.5)' }} />}
                        </ListItemIcon>
                        <ListItemText
                          primary={req.label}
                          primaryTypographyProps={{
                            fontSize: '0.8125rem',
                            color: ok ? T.textPrimary : T.textSecond,
                            fontWeight: ok ? 500 : 400,
                          }}
                        />
                      </ListItem>
                    );
                  })}
                </List>
              </Box>
            )}

            {/* Ações */}
            <Box sx={{ display: 'flex', gap: 1.5, mt: 0.5 }}>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => navigate('/dashboard')}
                disabled={loading}
                sx={{
                  height: 44, borderRadius: '10px',
                  borderColor: 'rgba(15,30,60,0.18)',
                  color: T.textSecond,
                  textTransform: 'none', fontWeight: 600,
                  '&:hover': { borderColor: 'rgba(15,30,60,0.35)', backgroundColor: 'rgba(15,30,60,0.03)' },
                }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                fullWidth
                disabled={loading}
                sx={{
                  height: 44, borderRadius: '10px',
                  backgroundColor: T.cyan, color: T.navy,
                  fontWeight: 700, textTransform: 'none',
                  boxShadow: T.cyanGlow,
                  '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
                  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: T.navy },
                }}
              >
                {loading ? <CircularProgress size={20} sx={{ color: T.navy }} /> : 'Alterar Senha'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
