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
  RadioButtonUnchecked as UncheckedIcon
} from '@mui/icons-material';
import api from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

export default function TrocarSenhaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Requisitos da senha
  const requisitos = [
    { id: 'length', label: 'Mínimo 8 caracteres', test: (senha: string) => senha.length >= 8 },
    { id: 'lowercase', label: 'Pelo menos 1 letra minúscula', test: (senha: string) => /[a-z]/.test(senha) },
    { id: 'uppercase', label: 'Pelo menos 1 letra maiúscula', test: (senha: string) => /[A-Z]/.test(senha) },
    { id: 'special', label: 'Pelo menos 1 caractere especial', test: (senha: string) => /[\W_]/.test(senha) }
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

    // Validações
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

    setLoading(true);

    try {
      await api.put(`/usuarios/${user?.id}/senha`, {
        senhaAtual,
        novaSenha
      });

      setSucesso('Senha alterada com sucesso!');
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
      logger.error('Erro ao alterar senha', { error: error.message, userId: user?.id });
      setErro(error.response?.data?.message || 'Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4 }}>
      <Card>
        <CardContent sx={{ p: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
            <LockIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
            <Box>
              <Typography variant="h5" component="h1">
                Trocar Senha
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Altere sua senha de acesso
              </Typography>
            </Box>
          </Box>

          {erro && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {erro}
            </Alert>
          )}

          {sucesso && (
            <Alert severity="success" sx={{ mb: 2 }}>
              {sucesso}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              type="password"
              label="Senha Atual"
              value={senhaAtual}
              onChange={(e) => setSenhaAtual(e.target.value)}
              margin="normal"
              required
              disabled={loading}
              autoFocus
            />

            <TextField
              fullWidth
              type="password"
              label="Nova Senha"
              value={novaSenha}
              onChange={(e) => setNovaSenha(e.target.value)}
              margin="normal"
              required
              disabled={loading}
            />

            <TextField
              fullWidth
              type="password"
              label="Confirmar Nova Senha"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              margin="normal"
              required
              disabled={loading}
            />

            <Box sx={{ mt: 2 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Requisitos da senha:
              </Typography>
              <List dense disablePadding>
                {requisitos.map((req) => {
                  const isSatisfeito = req.test(novaSenha);
                  return (
                    <ListItem key={req.id} disablePadding sx={{ py: 0.5 }}>
                      <ListItemIcon sx={{ minWidth: 36 }}>
                        {isSatisfeito ? (
                          <CheckCircleIcon sx={{ fontSize: 20, color: 'success.main' }} />
                        ) : (
                          <UncheckedIcon sx={{ fontSize: 20, color: 'text.disabled' }} />
                        )}
                      </ListItemIcon>
                      <ListItemText
                        primary={req.label}
                        primaryTypographyProps={{
                          variant: 'body2',
                          color: isSatisfeito ? 'text.primary' : 'text.secondary'
                        }}
                      />
                    </ListItem>
                  );
                })}
              </List>
            </Box>

            <Box sx={{ display: 'flex', gap: 2, mt: 3 }}>
              <Button
                variant="outlined"
                fullWidth
                onClick={() => navigate('/dashboard')}
                disabled={loading}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="contained"
                fullWidth
                disabled={loading}
              >
                {loading ? <CircularProgress size={24} /> : 'Alterar Senha'}
              </Button>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
