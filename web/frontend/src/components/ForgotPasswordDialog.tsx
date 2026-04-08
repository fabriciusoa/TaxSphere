import { useState } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Box,
  Alert,
  Typography,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { CheckCircle, Cancel } from '@mui/icons-material';
import { authService } from '../services/authService';
import { limparCPF, validarCPF, formatarCPF } from '../utils/cpf';
import { logger } from '../utils/logger';

export default function ForgotPasswordDialog({ open, onClose, email }: { open: boolean; onClose: () => void; email: string }) {
  const [step, setStep] = useState(1); // 1: CPF, 2: Nova senha
  const [cpf, setCpf] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const passwordCriteria = {
    length: newPassword.length >= 8,
    number: /[0-9]/.test(newPassword),
    lowercase: /[a-z]/.test(newPassword),
    uppercase: /[A-Z]/.test(newPassword),
    special: /[^A-Za-z0-9]/.test(newPassword),
  };


  const handleCPFSubmit = async () => {
    setError('');

    if (!validarCPF(cpf)) {
      setError('CPF inválido');
      return;
    }

    setLoading(true);

    try {
      const result = await authService.validate_reset(email, limparCPF(cpf));

      if (result?.valid) {
        setSuccess('Dados validados. Defina a nova senha.');
        setStep(2);
      } else {
        setError('E-mail e CPF não conferem');
      }
    } catch (error: any) {
      if (error.response?.status === 404) {
        logger.error(`Usuário não encontrado para email: ${email} e CPF: ${limparCPF(cpf)}`, error);
        setError('Usuário não encontrado');
      } else if (error.response?.data?.status === 'INATIVO') {
        logger.error(`Seu acesso está inativado: email: ${email} e CPF: ${limparCPF(cpf)}`, error);
        setError('Seu acesso está inativado. Entre em contato com o administrador do sistema.');
      } else if (error.response?.status === 400) {
        setError('E-mail e CPF são obrigatórios');
      } else if (error.response?.status === 401) {
        setError('E-mail e CPF não conferem');
      } else if (error.response?.status === 500) {
        logger.error(`Erro interno do servidor ao validar reset`, error);
        setError('Erro interno do servidor');
      } else {
        logger.error(`Erro desconhecido`, error);
        setError(error.response?.data?.error || 'Erro ao validar dados');
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async () => {
    setError('');

    if (newPassword !== confirmPassword) {
      setError('As senhas não conferem');
      return;
    }

    if (!Object.values(passwordCriteria).every(Boolean)) {
      setError('A senha não atende aos critérios de segurança');
      return;
    }

    setLoading(true);
    try {

      const result = await authService.reset_reset(email, limparCPF(cpf), newPassword);

      if (result?.status === 400) {
        setError('A senha não atende aos critérios de segurança');
      } else if (result?.status === 401) {
        setError('E-mail e CPF não conferem');
      } else if (result?.status === 500) {
        setError('Erro interno do servidor');
      } else if (result?.status === 404) {
        setError('Usuário não encontrado');
      } else if (result?.status === 403) {
        setError('Sua conta está inativa. Entre em contato com o administrador do sistema.');
      } else if (result?.status === 200) {
        setSuccess('Senha alterada com sucesso!');
      }
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (error: any) {
      logger.error(`Erro ao alterar senha para email: ${email} e CPF: ${limparCPF(cpf)}`, error);
      setError(error.response?.data?.message || 'Erro ao alterar senha');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep(1);
    setCpf('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {step === 1 ? 'Recuperar Senha' : 'Definir Nova Senha'}
      </DialogTitle>

      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        {step === 1 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="E-mail"
              value={email}
              disabled
              fullWidth
            />
            <TextField
              label="CPF"
              value={cpf}
              onChange={(e) => setCpf(formatarCPF(e.target.value))}
              placeholder="000.000.000-00"
              required
              fullWidth
              inputProps={{ maxLength: 14 }}
            />
          </Box>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            <TextField
              label="Nova Senha"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              fullWidth
            />
            <TextField
              label="Confirmar Nova Senha"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              fullWidth
            />

            <Box sx={{ mt: 1 }}>
              <Typography variant="subtitle2" gutterBottom>
                Critérios da senha:
              </Typography>
              <List dense>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {passwordCriteria.length ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="error" fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText primary="Mínimo 8 caracteres" />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {passwordCriteria.number ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="error" fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText primary="Pelo menos 1 número" />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {passwordCriteria.lowercase ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="error" fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText primary="Pelo menos 1 letra minúscula" />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {passwordCriteria.uppercase ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="error" fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText primary="Pelo menos 1 letra maiúscula" />
                </ListItem>
                <ListItem>
                  <ListItemIcon sx={{ minWidth: 32 }}>
                    {passwordCriteria.special ? (
                      <CheckCircle color="success" fontSize="small" />
                    ) : (
                      <Cancel color="error" fontSize="small" />
                    )}
                  </ListItemIcon>
                  <ListItemText primary="Pelo menos 1 caractere especial" />
                </ListItem>
              </List>
            </Box>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancelar</Button>
        {step === 1 ? (
          <Button
            variant="contained"
            onClick={handleCPFSubmit}
            disabled={loading}
          >
            Redefinir Senha
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handlePasswordSubmit}
            disabled={loading || !Object.values(passwordCriteria).every(Boolean)}
          >
            Salvar
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
