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
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  DeleteOutline as DeleteIcon
} from '@mui/icons-material';
import { format, parseISO } from 'date-fns';
import { manutencaoService, type Manutencao, type ManutencaoPayload } from '../services/manutencaoService';
import { logger } from '../utils/logger';

// ─── helpers de status ───────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  Manutencao['status'],
  { label: string; color: 'warning' | 'error' | 'default' }
> = {
  planejada:    { label: 'Planejada',    color: 'warning' },
  em_execucao:  { label: 'Em Execução',  color: 'error'   },
  terminado:    { label: 'Terminado',    color: 'default'  }
};

const STATUS_OPTIONS: { value: Manutencao['status']; label: string }[] = [
  { value: 'planejada',   label: 'Planejada'   },
  { value: 'em_execucao', label: 'Em Execução' },
  { value: 'terminado',   label: 'Terminado'   }
];

// ─── helpers de data ─────────────────────────────────────────────────────────

function toDatetimeLocal(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    return format(parseISO(isoString), "yyyy-MM-dd'T'HH:mm");
  } catch (error: any) {
    logger.error('Erro ao formatar data', error);
    return '';
  }
}

function formatDisplay(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    return format(parseISO(isoString), 'dd/MM/yyyy HH:mm');
  } catch (error: any) {
    logger.error('Erro ao formatar data para exibição', error);
    return isoString;
  }
}

// ─── form vazio ──────────────────────────────────────────────────────────────

const EMPTY_FORM: ManutencaoPayload = {
  descricao: '',
  dt_inicio: '',
  dt_fim: null,
  status: 'planejada'
};

// ─── componente ──────────────────────────────────────────────────────────────

export default function ManutencaoPage() {
  const [manutencoes, setManutencoes] = useState<Manutencao[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState('');

  const [dialogOpen, setDialogOpen]   = useState(false);
  const [editando, setEditando]       = useState<Manutencao | null>(null);
  const [form, setForm]               = useState<ManutencaoPayload>(EMPTY_FORM);
  const [saving, setSaving]           = useState(false);
  const [formError, setFormError]     = useState('');

  // ── carregar lista ────────────────────────────────────────────────────────

  const carregar = async () => {
    try {
      setLoading(true);
      setError('');
      const dados = await manutencaoService.listar();
      setManutencoes(dados);
    } catch (error: any) {
      logger.error('Erro ao carregar manutenções', error);
      setError('Erro ao carregar manutenções.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  // ── handlers do dialog ───────────────────────────────────────────────────

  const handleNovo = () => {
    setEditando(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setDialogOpen(true);
  };

  const handleEditar = (m: Manutencao) => {
    setEditando(m);
    setForm({
      descricao: m.descricao,
      dt_inicio: toDatetimeLocal(m.dt_inicio),
      dt_fim:    toDatetimeLocal(m.dt_fim) || null,
      status:    m.status
    });
    setFormError('');
    setDialogOpen(true);
  };

  const handleFechar = () => {
    setDialogOpen(false);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleSalvar = async () => {
    if (!form.descricao.trim()) {
      setFormError('Descrição é obrigatória.');
      return;
    }
    if (!form.dt_inicio) {
      setFormError('Data de início é obrigatória.');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      if (editando) {
        await manutencaoService.atualizar(editando.id, form);
        setSuccess('Manutenção atualizada com sucesso.');
      } else {
        await manutencaoService.criar(form);
        setSuccess('Manutenção cadastrada com sucesso.');
      }
      handleFechar();
      await carregar();
      setTimeout(() => setSuccess(''), 4000);
    } catch (error: any) {
      logger.error('Erro ao salvar manutenção', error);
      setFormError('Erro ao salvar manutenção. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  // ── handler exclusão lógica ───────────────────────────────────────────────

  const handleExcluir = async (m: Manutencao) => {
    if (!window.confirm(`Deseja arquivar a manutenção "${m.descricao}"?\n\nO registro não será excluído, apenas arquivado.`)) return;
    try {
      await manutencaoService.excluir(m.id);
      setSuccess('Manutenção arquivada com sucesso.');
      await carregar();
      setTimeout(() => setSuccess(''), 4000);
    } catch (error: any) {
      logger.error('Erro ao arquivar manutenção', error);
      setError('Erro ao arquivar manutenção.');
    }
  };

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <Box>
      {/* cabeçalho */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Manutenções do Sistema</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={handleNovo}>
          Nova Manutenção
        </Button>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {/* tabela */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell><strong>Descrição</strong></TableCell>
                <TableCell><strong>Data Início</strong></TableCell>
                <TableCell><strong>Data Fim (previsão)</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell align="center"><strong>Ações</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {manutencoes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                    Nenhuma manutenção cadastrada
                  </TableCell>
                </TableRow>
              ) : (
                manutencoes.map((m) => {
                  const cfg = STATUS_CONFIG[m.status] ?? { label: m.status, color: 'default' as const };
                  return (
                    <TableRow key={m.id} hover>
                      <TableCell>{m.descricao}</TableCell>
                      <TableCell>{formatDisplay(m.dt_inicio)}</TableCell>
                      <TableCell>{formatDisplay(m.dt_fim)}</TableCell>
                      <TableCell>
                        <Chip label={cfg.label} color={cfg.color} size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => handleEditar(m)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Arquivar">
                          <IconButton size="small" color="error" onClick={() => handleExcluir(m)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* dialog criar / editar */}
      <Dialog open={dialogOpen} onClose={handleFechar} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editando ? 'Editar Manutenção' : 'Nova Manutenção'}
        </DialogTitle>

        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>

            {formError && (
              <Alert severity="error">{formError}</Alert>
            )}

            <TextField
              label="Descrição"
              value={form.descricao}
              onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
              fullWidth
              required
              multiline
              rows={2}
            />

            <TextField
              label="Data de Início"
              type="datetime-local"
              value={form.dt_inicio}
              onChange={(e) => setForm(f => ({ ...f, dt_inicio: e.target.value }))}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />

            <TextField
              label="Data de Término (previsão)"
              type="datetime-local"
              value={form.dt_fim ?? ''}
              onChange={(e) => setForm(f => ({ ...f, dt_fim: e.target.value || null }))}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Opcional"
            />

            <FormControl fullWidth required>
              <InputLabel>Status</InputLabel>
              <Select
                value={form.status}
                label="Status"
                onChange={(e) =>
                  setForm(f => ({ ...f, status: e.target.value as Manutencao['status'] }))
                }
              >
                {STATUS_OPTIONS.map(opt => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleFechar} disabled={saving}>Cancelar</Button>
          <Button variant="contained" onClick={handleSalvar} disabled={saving}>
            {saving ? <CircularProgress size={20} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
