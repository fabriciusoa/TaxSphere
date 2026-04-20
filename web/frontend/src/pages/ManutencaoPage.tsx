import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  IconButton,
  Alert,
  CircularProgress,
  Tooltip,
  Stack,
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, DeleteOutline as DeleteIcon } from '@mui/icons-material';
import { toDatetimeLocal, formatDisplay } from '../utils/dateHelpers';
import { manutencaoService, type Manutencao, type ManutencaoPayload } from '../services/manutencaoService';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan: '#00c8f0',
  cyanGlow: '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover: '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  inputBg: '#F7F9FC',
  navy: '#0a1628',
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

const selectSx = {
  borderRadius: '10px', backgroundColor: T.inputBg,
  '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
  '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
  '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
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

const dialogPaper = {
  borderRadius: '16px', border: `1px solid ${T.border}`,
  boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
};

const STATUS_CONFIG: Record<Manutencao['status'], { label: string; color: 'warning' | 'error' | 'default' }> = {
  planejada: { label: 'Planejada', color: 'warning' },
  em_execucao: { label: 'Em Execução', color: 'error' },
  terminado: { label: 'Terminado', color: 'default' },
};

const STATUS_OPTIONS: { value: Manutencao['status']; label: string }[] = [
  { value: 'planejada', label: 'Planejada' },
  { value: 'em_execucao', label: 'Em Execução' },
  { value: 'terminado', label: 'Terminado' },
];

const EMPTY_FORM: ManutencaoPayload = { descricao: '', dt_inicio: '', dt_fim: null, status: 'planejada' };

export default function ManutencaoPage() {
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editando, setEditando] = useState<Manutencao | null>(null);
  const [form, setForm] = useState<ManutencaoPayload>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const carregar = async () => {
    try {
      setLoading(true); setError('');
      setManutencoes(await manutencaoService.listar());
    } catch (e: any) {
      logger.error('Erro ao carregar manutenções', e);
      setError('Erro ao carregar manutenções.');
    } finally { setLoading(false); }
  };

  useEffect(() => { carregar(); }, []);

  const handleNovo = () => {
    setEditando(null); setForm(EMPTY_FORM); setFormError(''); setDialogOpen(true);
  };

  const handleEditar = (m: Manutencao) => {
    setEditando(m);
    setForm({ descricao: m.descricao, dt_inicio: toDatetimeLocal(m.dt_inicio), dt_fim: toDatetimeLocal(m.dt_fim) || null, status: m.status });
    setFormError(''); setDialogOpen(true);
  };

  const handleFechar = () => {
    setDialogOpen(false); setEditando(null); setForm(EMPTY_FORM); setFormError('');
  };

  const handleSalvar = async () => {
    if (!form.descricao.trim()) { setFormError('Descrição é obrigatória.'); return; }
    if (!form.dt_inicio) { setFormError('Data de início é obrigatória.'); return; }
    setSaving(true); setFormError('');
    try {
      if (editando) {
        await manutencaoService.atualizar(editando.id, form);
        setSuccess('Manutenção atualizada com sucesso.');
      } else {
        await manutencaoService.criar(form);
        setSuccess('Manutenção cadastrada com sucesso.');
      }
      handleFechar(); await carregar();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      logger.error('Erro ao salvar manutenção', e);
      setFormError('Erro ao salvar manutenção. Tente novamente.');
    } finally { setSaving(false); }
  };

  const handleExcluir = async (m: Manutencao) => {
    if (!window.confirm(`Deseja arquivar a manutenção "${m.descricao}"?\n\nO registro não será excluído, apenas arquivado.`)) return;
    try {
      await manutencaoService.excluir(m.id);
      setSuccess('Manutenção arquivada com sucesso.');
      await carregar();
      setTimeout(() => setSuccess(''), 4000);
    } catch (e: any) {
      logger.error('Erro ao arquivar manutenção', e);
      setError('Erro ao arquivar manutenção.');
    }
  };

  const thCellSx = {
    fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
    letterSpacing: '0.04em', textTransform: 'uppercase' as const,
    borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
  };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* Cabeçalho */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Manutenções do Sistema
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Gerencie janelas de manutenção e indisponibilidade planejada
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNovo} sx={btnPrimary}>
          Nova Manutenção
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>{success}</Alert>}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 6 }}>
          <CircularProgress sx={{ color: T.cyan }} />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {['Descrição', 'Data Início', 'Data Fim (previsão)', 'Status', 'Ações'].map((h, i) => (
                    <TableCell key={h} align={i === 4 ? 'center' : 'left'} sx={thCellSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {manutencoes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: T.textSecond, fontSize: '0.875rem' }}>
                      Nenhuma manutenção cadastrada
                    </TableCell>
                  </TableRow>
                ) : manutencoes.map((m) => {
                  const cfg = STATUS_CONFIG[m.status] ?? { label: m.status, color: 'default' as const };
                  return (
                    <TableRow key={m.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.5 } }}>
                      <TableCell sx={{ fontSize: '0.875rem', color: T.textPrimary, fontWeight: 500 }}>{m.descricao}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, whiteSpace: 'nowrap' }}>{formatDisplay(m.dt_inicio)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, whiteSpace: 'nowrap' }}>{formatDisplay(m.dt_fim)}</TableCell>
                      <TableCell>
                        <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22 }} />
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Editar">
                            <IconButton size="small" onClick={() => handleEditar(m)}
                              sx={{ color: T.textSecond, '&:hover': { color: '#FFA726', backgroundColor: 'rgba(255,167,38,0.08)' } }}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Arquivar">
                            <IconButton size="small" onClick={() => handleExcluir(m)}
                              sx={{ color: T.textSecond, '&:hover': { color: '#D32F2F', backgroundColor: 'rgba(211,47,47,0.08)' } }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Dialog */}
      <Dialog key={editando ? `edit-${editando.id}` : 'new'} open={dialogOpen} onClose={handleFechar} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogPaper } }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          {editando ? 'Editar Manutenção' : 'Nova Manutenção'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
            {formError && <Alert severity="error" sx={{ borderRadius: '10px' }}>{formError}</Alert>}
            <TextField label="Descrição" value={form.descricao} onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))} fullWidth required multiline rows={2} sx={inputSx} />
            <TextField label="Data de Início" type="datetime-local" defaultValue={form.dt_inicio || undefined} onChange={(e) => setForm(f => ({ ...f, dt_inicio: e.target.value }))} fullWidth required slotProps={{ inputLabel: { shrink: true }, input: { inputProps: { autoComplete: 'off' } } }} sx={inputSx} />
            <TextField label="Data de Término (previsão)" type="datetime-local" defaultValue={form.dt_fim || undefined} onChange={(e) => setForm(f => ({ ...f, dt_fim: e.target.value || null }))} fullWidth slotProps={{ inputLabel: { shrink: true }, input: { inputProps: { autoComplete: 'off' } } }} helperText="Opcional" sx={inputSx} />
            <FormControl fullWidth required>
              <InputLabel sx={{ color: T.textSecond, '&.Mui-focused': { color: T.cyan } }}>Status</InputLabel>
              <Select value={form.status} label="Status" onChange={(e) => setForm(f => ({ ...f, status: e.target.value as Manutencao['status'] }))} sx={selectSx}>
                {STATUS_OPTIONS.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleFechar} disabled={saving} variant="outlined" sx={btnOutlined}>Cancelar</Button>
          <Button variant="contained" onClick={handleSalvar} disabled={saving} sx={btnPrimary}>
            {saving ? <CircularProgress size={18} sx={{ color: T.navy }} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
