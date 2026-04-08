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
} from '@mui/material';
import axios from 'axios';
import { validarCPF, formatarCPF } from '../utils/cpf';
import { formatarData } from '../utils/dateHelpers';
import { logger } from '../utils/logger';

export default function RequestAccessDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    dt_nascimento: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);



  const validateEmail = (email:any) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const validateAge = (dateString:any) => {
    const [day, month, year] = dateString.split('/');
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age >= 18;
  };

  const handleChange = (field: string, value: any) => {
    if (field === 'cpf') {
      value = formatarCPF(value);
    } else if (field === 'dt_nascimento') {
      value = formatarData(value);
    }
    setFormData({ ...formData, [field]: value });
  };

  const handleSubmit = async () => {
    setError('');

    if (!formData.nome || !formData.email || !formData.cpf || !formData.dt_nascimento) {
      setError('Todos os campos são obrigatórios');
      return;
    }

    if (!validateEmail(formData.email)) {
      setError('E-mail inválido');
      return;
    }

    if (!validarCPF(formData.cpf)) {
      setError('CPF inválido');
      return;
    }

    if (formData.dt_nascimento.length !== 10) {
      setError('Data de nascimento inválida. Use o formato DD/MM/AAAA');
      return;
    }

    if (!validateAge(formData.dt_nascimento)) {
      setError('É necessário ter pelo menos 18 anos para solicitar acesso');
      return;
    }

    setLoading(true);
    try {
      const [day, month, year] = formData.dt_nascimento.split('/');
      const isoDate = `${year}-${month}-${day}`;

      await axios.post('/api/auth/request-access', {
        nome: formData.nome,
        email: formData.email,
        cpf: formData.cpf.replace(/\D/g, ''),
        dt_nascimento: isoDate,
      });

      setSuccess('Solicitação enviada com sucesso! Aguarde aprovação do administrador.');
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err : any) {
      if (err.response?.status === 409) {
        logger.error('E-mail já cadastrado', err);
        setError('E-mail já cadastrado');
      } else {
        logger.error('Erro ao solicitar acesso', err);
        setError(err.response?.data?.error || 'Erro ao solicitar acesso');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFormData({ nome: '', email: '', cpf: '', dt_nascimento: '' });
    setError('');
    setSuccess('');
    onClose();
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>Solicitar Acesso</DialogTitle>

      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        {success && <Alert severity="success" sx={{ mb: 2 }}>{success}</Alert>}

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
          <TextField
            label="Nome Completo"
            value={formData.nome}
            onChange={(e) => handleChange('nome', e.target.value)}
            required
            fullWidth
          />

          <TextField
            label="E-mail"
            type="email"
            value={formData.email}
            onChange={(e) => handleChange('email', e.target.value)}
            required
            fullWidth
          />

          <TextField
            label="CPF"
            value={formData.cpf}
            onChange={(e) => handleChange('cpf', e.target.value)}
            placeholder="000.000.000-00"
            required
            fullWidth
            inputProps={{ maxLength: 14 }}
          />

          <TextField
            label="Data de Nascimento"
            value={formData.dt_nascimento}
            onChange={(e) => handleChange('dt_nascimento', e.target.value)}
            placeholder="DD/MM/AAAA"
            required
            fullWidth
            inputProps={{ maxLength: 10 }}
            helperText="Você deve ter pelo menos 18 anos"
          />
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose}>Cancelar</Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={loading}
        >
          Confirmar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
