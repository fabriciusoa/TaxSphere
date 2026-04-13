import { useState, useEffect } from 'react';
import {
  Box, Typography, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  TextField, Switch, FormControlLabel, Chip, Alert, List, ListItem, ListItemText,
  ListItemSecondaryAction, Tooltip, Divider, Stack, CircularProgress,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon, Close as CloseIcon } from '@mui/icons-material';
import admPlanosService, { type Plano, type PlanoItem } from '../services/admPlanosService';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:       '#00c8f0',
  cyanDim:    'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
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

const thCellSx = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
};

interface PlanoFormData {
  descricao: string;
  valor: number;
  ativo: boolean;
  itens: PlanoItem[];
}

export default function AdmPlanosPage() {
  const [planos, setPlanos]           = useState<Plano[]>([]);
  const [loading, setLoading]         = useState(true);
  const [openDialog, setOpenDialog]   = useState(false);
  const [editingPlano, setEditingPlano] = useState<Plano | null>(null);
  const [error, setError]             = useState<string | null>(null);
  const [success, setSuccess]         = useState<string | null>(null);
  const [formData, setFormData]       = useState<PlanoFormData>({ descricao: '', valor: 0, ativo: true, itens: [] });
  const [valorInput, setValorInput]   = useState('0,00');
  const [novoItem, setNovoItem]       = useState('');

  useEffect(() => { carregarPlanos(); }, []);

  const carregarPlanos = async () => {
    try {
      setLoading(true);
      setPlanos(await admPlanosService.listar());
      setError(null);
    } catch (e: any) {
      setError('Erro ao carregar planos');
      logger.error('Erro ao carregar planos', e);
    } finally { setLoading(false); }
  };

  const parseValorInput = (v: string) => parseFloat(v.replace(',', '.')) || 0;

  const handleValorChange = (value: string) => {
    if (/^[0-9]*,?[0-9]*$/.test(value) || value === '') {
      setValorInput(value);
      setFormData({ ...formData, valor: parseValorInput(value) });
    }
  };

  const handleOpenDialog = (plano?: Plano) => {
    if (plano) {
      setEditingPlano(plano);
      setFormData({ descricao: plano.descricao, valor: plano.valor, ativo: plano.ativo === 'S', itens: plano.itens || [] });
      setValorInput(plano.valor.toFixed(2).replace('.', ','));
    } else {
      setEditingPlano(null);
      setFormData({ descricao: '', valor: 0, ativo: true, itens: [] });
      setValorInput('0,00');
    }
    setOpenDialog(true); setError(null); setSuccess(null);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false); setEditingPlano(null);
    setFormData({ descricao: '', valor: 0, ativo: true, itens: [] });
    setNovoItem('');
  };

  const handleAddItem = () => {
    if (novoItem.trim()) {
      setFormData({ ...formData, itens: [...formData.itens, { descricao: novoItem.trim(), ativo: 'S' }] });
      setNovoItem('');
    }
  };

  const handleRemoveItem = (i: number) =>
    setFormData({ ...formData, itens: formData.itens.filter((_, idx) => idx !== i) });

  const handleToggleItemAtivo = (i: number) => {
    const novos = [...formData.itens];
    novos[i].ativo = novos[i].ativo === 'S' ? 'N' : 'S';
    setFormData({ ...formData, itens: novos });
  };

  const handleSubmit = async () => {
    try {
      if (!formData.descricao.trim()) { setError('Descrição é obrigatória'); return; }
      if (formData.valor <= 0) { setError('Valor deve ser maior que zero'); return; }
      const planoData: Plano = { descricao: formData.descricao, valor: formData.valor, ativo: formData.ativo ? 'S' : 'N', itens: formData.itens };
      if (editingPlano) {
        await admPlanosService.atualizar(editingPlano.id!, planoData);
        setSuccess('Plano atualizado com sucesso');
      } else {
        await admPlanosService.criar(planoData);
        setSuccess('Plano criado com sucesso');
      }
      handleCloseDialog(); carregarPlanos();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      logger.error('Erro ao salvar plano', e);
      setError(e.response?.data?.error || 'Erro ao salvar plano');
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Deseja realmente excluir este plano?')) return;
    try {
      await admPlanosService.excluir(id);
      setSuccess('Plano excluído com sucesso');
      carregarPlanos();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      logger.error('Erro ao excluir plano', e);
      setError(e.response?.data?.error || 'Erro ao excluir plano');
    }
  };

  const formatarValor = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Planos do Sistema
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Gerenciamento dos planos para assinatura
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={btnPrimary}>
          Novo Plano
        </Button>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess(null)}>{success}</Alert>}

      <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {[
                  { label: 'Descrição' }, { label: 'Valor', align: 'right' as const },
                  { label: 'Itens', align: 'center' as const },
                  { label: 'Id Stripe Produto', align: 'center' as const },
                  { label: 'Id Stripe Preço', align: 'center' as const },
                  { label: 'Status', align: 'center' as const },
                  { label: 'Ações', align: 'center' as const },
                ].map(h => (
                  <TableCell key={h.label} align={h.align} sx={thCellSx}>{h.label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} sx={{ color: T.cyan }} />
                  </TableCell>
                </TableRow>
              ) : planos.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 6, color: T.textSecond, fontSize: '0.875rem' }}>
                    Nenhum plano cadastrado
                  </TableCell>
                </TableRow>
              ) : planos.map((plano) => (
                <TableRow key={plano.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.5 } }}>
                  <TableCell sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>{plano.descricao}</TableCell>
                  <TableCell align="right">
                    <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: T.cyan, fontVariantNumeric: 'tabular-nums' }}>
                      {formatarValor(plano.valor)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={`${plano.itens?.length || 0} itens`} size="small"
                      sx={{ fontSize: '0.75rem', height: 22, backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid ${T.cyanBorder}` }} />
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond, fontFamily: 'monospace' }}>
                    {plano.id_product_stripe || '—'}
                  </TableCell>
                  <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond, fontFamily: 'monospace' }}>
                    {plano.id_price_stripe || '—'}
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={plano.ativo === 'S' ? 'Ativo' : 'Inativo'} color={plano.ativo === 'S' ? 'success' : 'default'}
                      size="small" sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22 }} />
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="Editar">
                        <IconButton size="small" onClick={() => handleOpenDialog(plano)}
                          sx={{ color: T.textSecond, '&:hover': { color: '#FFA726', backgroundColor: 'rgba(255,167,38,0.08)' } }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Excluir">
                        <IconButton size="small" onClick={() => handleDelete(plano.id!)}
                          sx={{ color: T.textSecond, '&:hover': { color: '#D32F2F', backgroundColor: 'rgba(211,47,47,0.08)' } }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px', border: `1px solid ${T.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' } } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary }}>
            {editingPlano ? 'Editar Plano' : 'Novo Plano'}
          </Typography>
          <IconButton onClick={handleCloseDialog} size="small" sx={{ color: T.textSecond }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ borderColor: T.border }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
            {error && <Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert>}

            <TextField label="Descrição do Plano" fullWidth value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              required helperText="Ex: Plano Solo, Plano Profissional" sx={inputSx} />

            <TextField label="Valor Mensal" fullWidth value={valorInput}
              onChange={(e) => handleValorChange(e.target.value)}
              required placeholder="0,00"
              slotProps={{ input: { startAdornment: <Typography sx={{ mr: 1, color: T.textSecond, fontSize: '0.875rem' }}>R$</Typography> } }}
              helperText="Use vírgula para decimais. Ex: 199,90" sx={inputSx} />

            <FormControlLabel
              control={<Switch checked={formData.ativo} onChange={(e) => setFormData({ ...formData, ativo: e.target.checked })}
                sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.cyan }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.cyan } }} />}
              label={<Typography sx={{ fontSize: '0.875rem', color: T.textPrimary }}>Plano Ativo</Typography>}
            />

            <Divider sx={{ borderColor: T.border }} />

            <Box>
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 0.5 }}>
                Itens do Plano
              </Typography>
              <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, mb: 2 }}>
                Adicione os recursos e funcionalidades incluídos neste plano
              </Typography>

              <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
                <TextField label="Novo item" fullWidth value={novoItem}
                  onChange={(e) => setNovoItem(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                  placeholder="Ex: Pacientes ilimitados" sx={inputSx} />
                <Button variant="contained" onClick={handleAddItem} disabled={!novoItem.trim()} sx={{ ...btnPrimary, px: 2, whiteSpace: 'nowrap' }}>
                  Adicionar
                </Button>
              </Stack>

              {formData.itens.length > 0 ? (
                <Paper elevation={0} sx={{ borderRadius: '10px', border: `1px solid ${T.border}` }}>
                  <List dense disablePadding>
                    {formData.itens.map((item, idx) => (
                      <ListItem key={idx} divider={idx < formData.itens.length - 1}
                        sx={{ opacity: item.ativo === 'S' ? 1 : 0.5, py: 1, '& .MuiDivider-root': { borderColor: T.border } }}>
                        <ListItemText
                          primary={`✓ ${item.descricao}`}
                          primaryTypographyProps={{ fontSize: '0.875rem', color: T.textPrimary,
                            textDecoration: item.ativo === 'N' ? 'line-through' : 'none' }} />
                        <ListItemSecondaryAction>
                          <Switch edge="end" checked={item.ativo === 'S'} onChange={() => handleToggleItemAtivo(idx)} size="small"
                            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.cyan }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.cyan } }} />
                          <IconButton edge="end" size="small" onClick={() => handleRemoveItem(idx)}
                            sx={{ color: T.textSecond, '&:hover': { color: '#D32F2F' } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              ) : (
                <Alert severity="info" sx={{ borderRadius: '10px' }}>
                  Nenhum item adicionado. Adicione itens para descrever o que está incluído no plano.
                </Alert>
              )}
            </Box>
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleCloseDialog} variant="outlined" sx={btnOutlined}>Cancelar</Button>
          <Button variant="contained" onClick={handleSubmit} disabled={!formData.descricao.trim()} sx={btnPrimary}>
            {editingPlano ? 'Atualizar' : 'Criar Plano'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
