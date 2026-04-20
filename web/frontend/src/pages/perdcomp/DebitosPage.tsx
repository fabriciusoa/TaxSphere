import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  Alert,
  Tooltip,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import type { PerdcompEmpresa, PerdcompDebito, StatusDebito, TipoCredito } from '../../types/perdcomp';
import { logger } from '../../utils/logger';

const T = {
  navy: '#0a1628',
  cyan: '#00c8f0',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const TIPOS_TRIBUTO: TipoCredito[] = ['PIS', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'INSS', 'IOF', 'IRRF', 'CIDE', 'OUTROS'];
const STATUS_DEBITO: StatusDebito[] = ['Pendente', 'Parcialmente Compensado', 'Compensado', 'Pago'];

const inputSx = { borderRadius: '10px', '& .MuiOutlinedInput-root': { borderRadius: '10px' } };

const statusColor = (status: StatusDebito) => {
  const map: Record<StatusDebito, 'warning' | 'info' | 'success' | 'default'> = {
    'Pendente': 'warning',
    'Parcialmente Compensado': 'info',
    'Compensado': 'success',
    'Pago': 'default',
  };
  return map[status] ?? 'default';
};

interface FormData {
  id_empresa: string;
  tipo_tributo: string;
  codigo_receita: string;
  periodo_apuracao: string;
  valor_principal: string;
  valor_multa: string;
  valor_juros: string;
  dt_vencimento: string;
  observacoes: string;
}

const emptyForm: FormData = {
  id_empresa: '',
  tipo_tributo: '',
  codigo_receita: '',
  periodo_apuracao: '',
  valor_principal: '',
  valor_multa: '',
  valor_juros: '',
  dt_vencimento: '',
  observacoes: '',
};

export default function DebitosPage() {
  const [debitos, setDebitos] = useState<PerdcompDebito[]>([]);
  const [empresas, setEmpresas] = useState<PerdcompEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const [filtroEmpresa, setFiltroEmpresa] = useState<number | ''>('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const valorTotal = (() => {
    const p = parseFloat(form.valor_principal) || 0;
    const m = parseFloat(form.valor_multa) || 0;
    const j = parseFloat(form.valor_juros) || 0;
    return p + m + j;
  })();

  const carregarEmpresas = useCallback(async () => {
    try {
      const resp = await perdcompService.empresas.listar({ limit: 200 });
      setEmpresas(resp.data);
    } catch (err: any) {
      logger.error('Erro ao carregar empresas', err);
    }
  }, []);

  const carregarDebitos = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await perdcompService.debitos.listar({
        id_empresa: filtroEmpresa || undefined,
        tipo_tributo: filtroTipo || undefined,
        status: filtroStatus || undefined,
        page: page + 1,
        limit: rowsPerPage,
      });
      setDebitos(resp.data);
      setTotal(resp.pagination.total);
    } catch (err: any) {
      logger.error('Erro ao carregar débitos', err);
      setError('Erro ao carregar débitos.');
    } finally {
      setLoading(false);
    }
  }, [filtroEmpresa, filtroTipo, filtroStatus, page, rowsPerPage]);

  useEffect(() => { carregarEmpresas(); }, [carregarEmpresas]);
  useEffect(() => { carregarDebitos(); }, [carregarDebitos]);

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = (debito: PerdcompDebito) => {
    setEditingId(debito.id);
    setForm({
      id_empresa: String(debito.id_empresa),
      tipo_tributo: debito.tipo_tributo,
      codigo_receita: debito.codigo_receita || '',
      periodo_apuracao: debito.periodo_apuracao,
      valor_principal: String(debito.valor_principal),
      valor_multa: String(debito.valor_multa),
      valor_juros: String(debito.valor_juros),
      dt_vencimento: debito.dt_vencimento?.split('T')[0] || '',
      observacoes: debito.observacoes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.id_empresa || !form.tipo_tributo || !form.periodo_apuracao || !form.valor_principal) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = {
        id_empresa: Number(form.id_empresa),
        tipo_tributo: form.tipo_tributo,
        codigo_receita: form.codigo_receita || undefined,
        periodo_apuracao: form.periodo_apuracao,
        valor_principal: parseFloat(form.valor_principal),
        valor_multa: parseFloat(form.valor_multa) || 0,
        valor_juros: parseFloat(form.valor_juros) || 0,
        dt_vencimento: form.dt_vencimento || undefined,
        observacoes: form.observacoes || undefined,
      };
      if (editingId) {
        await perdcompService.debitos.atualizar(editingId, payload);
        setSuccess('Débito atualizado com sucesso.');
      } else {
        await perdcompService.debitos.criar(payload);
        setSuccess('Débito criado com sucesso.');
      }
      setDialogOpen(false);
      await carregarDebitos();
    } catch (err: any) {
      logger.error('Erro ao salvar débito', err);
      setError(err?.response?.data?.error || 'Erro ao salvar débito.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      setError('');
      await perdcompService.debitos.excluir(deleteConfirmId);
      setSuccess('Débito excluído com sucesso.');
      setDeleteConfirmId(null);
      await carregarDebitos();
    } catch (err: any) {
      logger.error('Erro ao excluir débito', err);
      setError('Erro ao excluir débito.');
    }
  };

  const handleTextField = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSelectField = (field: keyof FormData) => (e: SelectChangeEvent<unknown>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const formatDate = (dt?: string) => {
    if (!dt) return '—';
    try {
      return new Date(dt).toLocaleDateString('pt-BR');
    } catch {
      return dt;
    }
  };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
          Gestão de Débitos
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleOpenCreate}
          sx={{ borderRadius: '10px', textTransform: 'none', backgroundColor: T.cyan, '&:hover': { backgroundColor: '#00b0d8' } }}
        >
          Novo Débito
        </Button>
      </Box>

      <Box sx={{ display: 'flex', gap: 2, mb: 3, flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 200, ...inputSx }}>
          <InputLabel>Empresa</InputLabel>
          <Select
            value={filtroEmpresa}
            label="Empresa"
            onChange={(e) => { setFiltroEmpresa(e.target.value as number | ''); setPage(0); }}
          >
            <MenuItem value="">Todas</MenuItem>
            {empresas.map(emp => (
              <MenuItem key={emp.id} value={emp.id}>{emp.razao_social}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 150, ...inputSx }}>
          <InputLabel>Tipo Tributo</InputLabel>
          <Select value={filtroTipo} label="Tipo Tributo" onChange={(e) => { setFiltroTipo(e.target.value as string); setPage(0); }}>
            <MenuItem value="">Todos</MenuItem>
            {TIPOS_TRIBUTO.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 200, ...inputSx }}>
          <InputLabel>Status</InputLabel>
          <Select value={filtroStatus} label="Status" onChange={(e) => { setFiltroStatus(e.target.value as string); setPage(0); }}>
            <MenuItem value="">Todos</MenuItem>
            {STATUS_DEBITO.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </Box>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress sx={{ color: T.cyan }} />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow sx={{ backgroundColor: T.navy }}>
                  {['Empresa', 'Tipo Tributo', 'Período', 'Valor Principal', 'Multa', 'Juros', 'Valor Total', 'Vencimento', 'Saldo Devedor', 'Status', 'Ações'].map(h => (
                    <TableCell key={h} sx={{ color: '#fff', fontWeight: 600, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {debitos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={11} sx={{ textAlign: 'center', py: 4, color: T.textSecond }}>
                      Nenhum débito encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  debitos.map(d => (
                    <TableRow key={d.id} hover sx={{ '&:hover': { backgroundColor: 'rgba(0,200,240,0.04)' } }}>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{d.empresa_razao_social || d.id_empresa}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{d.tipo_tributo}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{d.periodo_apuracao}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(d.valor_principal)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(d.valor_multa)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(d.valor_juros)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(d.valor_total)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{formatDate(d.dt_vencimento)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(d.saldo_devedor)}</TableCell>
                      <TableCell><Chip label={d.status} color={statusColor(d.status)} size="small" /></TableCell>
                      <TableCell>
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => handleOpenEdit(d)} sx={{ color: T.cyan }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir">
                          <IconButton size="small" onClick={() => setDeleteConfirmId(d.id)} sx={{ color: '#ef5350' }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={total}
            page={page}
            onPageChange={(_, p) => setPage(p)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            rowsPerPageOptions={[5, 10, 25, 50]}
            labelRowsPerPage="Linhas por página:"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          />
        </Paper>
      )}

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: T.textPrimary }}>
          {editingId ? 'Editar Débito' : 'Novo Débito'}
        </DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: '16px !important' }}>
          <FormControl fullWidth size="small" sx={inputSx}>
            <InputLabel>Empresa *</InputLabel>
            <Select value={form.id_empresa} label="Empresa *" onChange={handleSelectField('id_empresa')}>
              {empresas.map(emp => (
                <MenuItem key={emp.id} value={emp.id}>{emp.razao_social}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" sx={inputSx}>
            <InputLabel>Tipo Tributo *</InputLabel>
            <Select value={form.tipo_tributo} label="Tipo Tributo *" onChange={handleSelectField('tipo_tributo')}>
              {TIPOS_TRIBUTO.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth size="small" label="Código Receita" value={form.codigo_receita} onChange={handleTextField('codigo_receita')} sx={inputSx} />
          <TextField fullWidth size="small" label="Período (MM/AAAA) *" value={form.periodo_apuracao} onChange={handleTextField('periodo_apuracao')} placeholder="01/2025" sx={inputSx} />
          <TextField fullWidth size="small" label="Valor Principal *" type="number" value={form.valor_principal} onChange={handleTextField('valor_principal')} inputProps={{ step: '0.01', min: '0' }} sx={inputSx} />
          <TextField fullWidth size="small" label="Valor Multa" type="number" value={form.valor_multa} onChange={handleTextField('valor_multa')} inputProps={{ step: '0.01', min: '0' }} sx={inputSx} />
          <TextField fullWidth size="small" label="Valor Juros" type="number" value={form.valor_juros} onChange={handleTextField('valor_juros')} inputProps={{ step: '0.01', min: '0' }} sx={inputSx} />
          <Box sx={{ px: 1, py: 1.5, backgroundColor: 'rgba(0,200,240,0.06)', borderRadius: '10px', border: `1px solid ${T.border}` }}>
            <Typography sx={{ fontSize: '0.875rem', color: T.textSecond }}>
              Valor Total: <strong style={{ color: T.textPrimary }}>{formatBRL(valorTotal)}</strong>
            </Typography>
          </Box>
          <TextField fullWidth size="small" label="Data Vencimento" type="date" value={form.dt_vencimento} onChange={handleTextField('dt_vencimento')} InputLabelProps={{ shrink: true }} sx={inputSx} />
          <TextField fullWidth size="small" label="Observações" value={form.observacoes} onChange={handleTextField('observacoes')} multiline rows={3} sx={inputSx} />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDialogOpen(false)} sx={{ borderRadius: '10px', textTransform: 'none', color: T.textSecond }}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={saving}
            startIcon={saving ? <CircularProgress size={18} /> : undefined}
            sx={{ borderRadius: '10px', textTransform: 'none', backgroundColor: T.cyan, '&:hover': { backgroundColor: '#00b0d8' } }}
          >
            {editingId ? 'Salvar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={deleteConfirmId !== null} onClose={() => setDeleteConfirmId(null)} PaperProps={{ sx: { borderRadius: '12px' } }}>
        <DialogTitle sx={{ fontWeight: 700, color: T.textPrimary }}>Confirmar Exclusão</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: T.textSecond }}>Tem certeza que deseja excluir este débito? Esta ação não pode ser desfeita.</Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setDeleteConfirmId(null)} sx={{ borderRadius: '10px', textTransform: 'none', color: T.textSecond }}>
            Cancelar
          </Button>
          <Button variant="contained" color="error" onClick={handleDelete} sx={{ borderRadius: '10px', textTransform: 'none' }}>
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
