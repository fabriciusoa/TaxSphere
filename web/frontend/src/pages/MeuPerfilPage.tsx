import { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Stack,
  Alert,
  CircularProgress,
} from '@mui/material';
import { Save as SaveIcon, Person as PersonIcon } from '@mui/icons-material';
import { usuariosService } from '../services/usuariosService';
import { type Usuario } from '../types';
import { logger } from '../utils/logger';

const T = {
  cyan: '#00c8f0',
  cyanGlow: '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover: '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.10)',
  surface: '#FFFFFF',
  inputBg: '#F7F9FC',
  navy: '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
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
  '& .MuiInputBase-input.Mui-disabled': { WebkitTextFillColor: T.textSecond },
};

export default function MeuPerfilPage() {
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
   
  const [ , setUsuarios] = useState<Usuario[]>([]);

  const [formData, setFormData] = useState({ nome: '', email: '', cpf: '', dt_nascimento: '' });

  useEffect(() => { carregarPerfil(); }, []);

  const carregarPerfil = async () => {
    try {
      setLoading(true);
      setErro('');
      const usuarios = await usuariosService.buscarMeuPerfil();
      setUsuarios([usuarios]);

      let dataNascimento = '';
      if (usuarios.dt_nascimento) {
        if (/^\d{4}-\d{2}-\d{2}/.test(usuarios.dt_nascimento)) {
          dataNascimento = usuarios.dt_nascimento.substring(0, 10);
        } else {
          const match = usuarios.dt_nascimento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) dataNascimento = `${match[3]}-${match[2]}-${match[1]}`;
        }
      }

      setFormData({
        nome: usuarios.nome,
        email: usuarios.email,
        cpf: usuarios.cpf,
        dt_nascimento: dataNascimento,
      });
    } catch (error: any) {
      logger.error('Erro ao carregar perfil', error);
      setErro(error.response?.data?.error || 'Erro ao carregar perfil');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSalvando(true);
      setErro('');
      setSucesso('');

      const dados: any = {
        nome: formData.nome,
        email: formData.email,
        cpf: formData.cpf.replace(/\D/g, ''),
        dt_nascimento: formData.dt_nascimento || null,
      };

      await usuariosService.atualizarMeuPerfil(dados);
      setSucesso('Perfil atualizado com sucesso!');
      setTimeout(() => setSucesso(''), 3000);
    } catch (error: any) {
      logger.error('Erro ao atualizar perfil', error);
      setErro(error.response?.data?.error || 'Erro ao atualizar perfil');
    } finally {
      setSalvando(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress sx={{ color: T.cyan }} />
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 800, fontFamily: '"Inter", system-ui, sans-serif' }}>

      {erro && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setErro('')}>
          {erro}
        </Alert>
      )}
      {sucesso && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSucesso('')}>
          {sucesso}
        </Alert>
      )}

      <Paper elevation={0} sx={{
        borderRadius: '16px',
        border: `1px solid ${T.border}`,
        boxShadow: T.cardShadow,
        backgroundColor: T.surface,
        overflow: 'hidden',
      }}>

        <Box sx={{
          px: { xs: 3, sm: 4 }, py: 2.5,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <Box sx={{
            width: 44, height: 44, borderRadius: '12px',
            backgroundColor: 'rgba(0,200,240,0.08)',
            border: '1px solid rgba(0,200,240,0.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <PersonIcon sx={{ color: T.cyan, fontSize: 22 }} />
          </Box>
          <Box>
            <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
              Meu Perfil
            </Typography>
            <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, mt: 0.25 }}>
              Gerencie seus dados pessoais
            </Typography>
          </Box>
        </Box>

        <Box sx={{ px: { xs: 3, sm: 4 }, pb: 4, pt: 3 }}>
          <form onSubmit={handleSubmit}>
            <Stack spacing={3}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: T.textSecond, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                Dados Pessoais
              </Typography>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth label="Nome" name="nome" value={formData.nome} onChange={handleChange} required sx={inputSx} />
                <TextField fullWidth label="Data de Nascimento" name="dt_nascimento" type="date" value={formData.dt_nascimento} onChange={handleChange} slotProps={{ inputLabel: { shrink: true } }} sx={inputSx} />
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField fullWidth label="E-mail" name="email" type="email" value={formData.email} onChange={handleChange} required sx={inputSx} />
                <TextField fullWidth label="CPF" name="cpf" value={formData.cpf} disabled sx={inputSx} />
              </Stack>
            </Stack>

            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 4, pt: 3, borderTop: `1px solid ${T.border}` }}>
              <Button
                type="submit"
                variant="contained"
                disabled={salvando}
                startIcon={salvando ? <CircularProgress size={16} sx={{ color: T.navy }} /> : <SaveIcon />}
                sx={{
                  height: 44, px: 3.5, borderRadius: '10px',
                  backgroundColor: T.cyan, color: T.navy,
                  fontWeight: 700, textTransform: 'none',
                  boxShadow: T.cyanGlow,
                  '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
                  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: T.navy },
                }}
              >
                {salvando ? 'Salvando...' : 'Salvar Perfil'}
              </Button>
            </Box>
          </form>
        </Box>
      </Paper>
    </Box>
  );
}
