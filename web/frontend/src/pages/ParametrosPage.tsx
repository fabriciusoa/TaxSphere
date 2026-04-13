import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, Alert, CircularProgress, Chip, Tooltip, Stack,
} from '@mui/material';
import { Edit as EditIcon, Refresh as RefreshIcon } from '@mui/icons-material';
import { parametrosService, type Parametro } from '../services/parametrosService';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:       '#00c8f0',
  cyanGlow:   '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:  '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary:'#1a2332',
  textSecond: '#64748b',
  border:     'rgba(15, 30, 60, 0.09)',
  surface:    '#FFFFFF',
  inputBg:    '#F7F9FC',
  navy:       '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg, borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
    '&.Mui-disabled': { backgroundColor: 'rgba(15,30,60,0.03)' },
  },
  '& .MuiInputLabel-root': { color: T.textSecond, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: T.cyan },
};

const btnPrimary = {
  height: 40, borderRadius: '10px',
  backgroundColor: T.cyan, color: T.navy,
  fontWeight: 700, textTransform: 'none' as const,
  boxShadow: T.cyanGlow,
  '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: T.navy },
};

const btnOutlined = {
  height: 40, borderRadius: '10px',
  borderColor: 'rgba(15,30,60,0.18)', color: T.textSecond,
  textTransform: 'none' as const, fontWeight: 600,
  '&:hover': { borderColor: 'rgba(15,30,60,0.35)', backgroundColor: 'rgba(15,30,60,0.03)' },
};

const PARAMETROS_CRITICOS = ['JWT_SECRET', 'JWT_EXPIRES_IN', 'TIMEZONE', 'BCRYPT_ROUNDS'];

export default function ParametrosPage() {
  const [parametros, setParametros]       = useState<Parametro[]>([]);
  const [loading, setLoading]             = useState(true);
  const [erro, setErro]                   = useState('');
  const [sucesso, setSucesso]             = useState('');
  const [modalAberto, setModalAberto]     = useState(false);
  const [parametroSelecionado, setParametroSelecionado] = useState<Parametro | null>(null);
  const [salvando, setSalvando]           = useState(false);
  const [formData, setFormData]           = useState({ valor: '', descricao: '' });

  useEffect(() => { carregarParametros(); }, []);

  const carregarParametros = async () => {
    try {
      setLoading(true); setErro('');
      setParametros(await parametrosService.listar());
    } catch (e: any) {
      setErro(e.response?.data?.message || 'Erro ao carregar parâmetros');
      logger.error('Erro ao carregar parâmetros', e);
    } finally { setLoading(false); }
  };

  const abrirModalEditar = (p: Parametro) => {
    setParametroSelecionado(p);
    setFormData({ valor: p.valor, descricao: p.descricao || '' });
    setModalAberto(true);
  };

  const handleSalvar = async () => {
    if (!parametroSelecionado) return;
    try {
      setSalvando(true); setErro('');
      if (!formData.valor.trim()) { setErro('O valor é obrigatório'); setSalvando(false); return; }
      await parametrosService.atualizar(parametroSelecionado.id, { valor: formData.valor.trim(), descricao: formData.descricao.trim() || undefined });
      setSucesso(`Parâmetro "${parametroSelecionado.chave}" atualizado com sucesso`);
      setModalAberto(false);
      carregarParametros();
      setTimeout(() => setSucesso(''), 3000);
    } catch (e: any) {
      logger.error('Erro ao salvar parâmetro', e);
      setErro(e.response?.data?.message || 'Erro ao salvar parâmetro');
    } finally { setSalvando(false); }
  };

  const thCellSx = {
    fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
        <CircularProgress sx={{ color: T.cyan }} />
      </Box>
    );
  }

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* Cabeçalho */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Parâmetros do Sistema
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Gerencie configurações e variáveis da aplicação
          </Typography>
        </Box>
        <Button variant="outlined" startIcon={<RefreshIcon />} onClick={carregarParametros} disabled={loading}
          sx={btnOutlined}>
          Atualizar
        </Button>
      </Box>

      {erro   && <Alert severity="error"   sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setErro('')}>{erro}</Alert>}
      {sucesso && <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSucesso('')}>{sucesso}</Alert>}

      <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {[{ label: 'Chave', w: '30%' }, { label: 'Valor', w: '40%' }, { label: 'Descrição', w: '20%' }, { label: 'Ações', w: '10%', align: 'center' as const }].map(h => (
                  <TableCell key={h.label} align={h.align} sx={{ ...thCellSx, width: h.w }}>{h.label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {parametros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 6, color: T.textSecond, fontSize: '0.875rem' }}>
                    Nenhum parâmetro encontrado
                  </TableCell>
                </TableRow>
              ) : parametros.map((p) => (
                <TableRow key={p.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.5 } }}>
                  <TableCell>
                    <Stack direction="row" alignItems="center" spacing={1}>
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, fontFamily: 'monospace' }}>
                        {p.chave}
                      </Typography>
                      {PARAMETROS_CRITICOS.includes(p.chave) && (
                        <Chip label="Crítico" size="small" color="error" variant="outlined" sx={{ fontSize: '0.6875rem', height: 20 }} />
                      )}
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <Typography sx={{
                      fontSize: '0.8125rem', fontFamily: 'monospace',
                      backgroundColor: '#F1F5F9', px: 1.25, py: 0.5,
                      borderRadius: '6px', display: 'inline-block',
                      maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: T.textPrimary, border: `1px solid ${T.border}`,
                    }} title={p.valor}>
                      {p.valor}
                    </Typography>
                  </TableCell>
                  <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{p.descricao || '—'}</TableCell>
                  <TableCell align="center">
                    <Tooltip title="Editar parâmetro">
                      <IconButton size="small" onClick={() => abrirModalEditar(p)}
                        sx={{ color: T.textSecond, '&:hover': { color: T.cyan, backgroundColor: 'rgba(0,200,240,0.08)' } }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Modal edição */}
      <Dialog open={modalAberto} onClose={() => setModalAberto(false)} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px', border: `1px solid ${T.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' } } }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          Editar Parâmetro
        </DialogTitle>
        <DialogContent>
          {erro && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{erro}</Alert>}
          <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField fullWidth label="Chave" value={parametroSelecionado?.chave || ''} disabled helperText="A chave não pode ser alterada" sx={inputSx} />
            <TextField fullWidth label="Valor" value={formData.valor} onChange={(e) => setFormData({ ...formData, valor: e.target.value })} multiline rows={3} required helperText="Conteúdo do parâmetro" sx={inputSx} />
            <TextField fullWidth label="Descrição" value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} multiline rows={2} helperText="Informação adicional sobre o parâmetro" sx={inputSx} />
            {parametroSelecionado && PARAMETROS_CRITICOS.includes(parametroSelecionado.chave) && (
              <Alert severity="warning" sx={{ borderRadius: '10px' }}>
                Este é um parâmetro crítico do sistema. Alterações podem afetar o funcionamento da aplicação.
              </Alert>
            )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setModalAberto(false)} disabled={salvando} variant="outlined" sx={btnOutlined}>Cancelar</Button>
          <Button onClick={handleSalvar} variant="contained" disabled={salvando || !formData.valor.trim()} sx={btnPrimary}>
            {salvando ? <CircularProgress size={18} sx={{ color: T.navy }} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
