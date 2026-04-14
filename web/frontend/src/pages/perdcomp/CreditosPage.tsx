import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Select, MenuItem, FormControl, InputLabel,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination,
  Paper, Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  CircularProgress, Alert, Tooltip, SelectChangeEvent,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import type { PerdcompEmpresa, PerdcompCredito, TipoCredito, OrigemCredito, StatusCredito } from '../../types/perdcomp';
import { logger } from '../../utils/logger';

const T = {
  navy:        '#0a1628',
  cyan:        '#00c8f0',
  textPrimary: '#1a2332',
  textSecond:  '#64748b',
  border:      'rgba(15, 30, 60, 0.09)',
  surface:     '#FFFFFF',
  cardShadow:  '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const TIPOS_CREDITO: TipoCredito[] = ['PIS', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'INSS', 'IOF', 'IRRF', 'CIDE', 'OUTROS'];
const ORIGENS_CREDITO: OrigemCredito[] = ['Pagamento Indevido', 'Pagamento a Maior', 'Crédito Presumido', 'Saldo Negativo IRPJ/CSLL', 'Retenção na Fonte', 'Exportação'];
const STATUS_CREDITO: StatusCredito[] = ['Disponível', 'Parcialmente Utilizado', 'Esgotado', 'Prescrito', 'Suspenso'];

const inputSx = { borderRadius: '10px', '& .MuiOutlinedInput-root': { borderRadius: '10px' } };

const statusColor = (status: StatusCredito) => {
  const map: Record<StatusCredito, 'success' | 'warning' | 'error' | 'default' | 'info'> = {
    'Disponível': 'success',
    'Parcialmente Utilizado': 'warning',
    'Esgotado': 'error',
    'Prescrito': 'default',
    'Suspenso': 'info',
  };
  return map[status] ?? 'default';
};

const prescricaoChip = (dias?: number) => {
  if (dias === undefined || dias === null) return <Chip label="—" size="small" />;
  const color = dias < 90 ? 'error' : dias < 180 ? 'warning' : 'success';
  return <Chip label={`${dias} dias`} color={color} size="small" variant="outlined" />;
};

interface FormData {
  id_empresa: number | '';
  tipo_credito: TipoCredito | '';
  origem_credito: OrigemCredito | '';
  periodo_apuracao: string;
  codigo_receita: string;
  valor_original: string;
  dt_pagamento_original: string;
  observacoes: string;
}

const emptyForm: FormData = {
  id_empresa: '',
  tipo_credito: '',
  origem_credito: '',
  periodo_apuracao: '',
  codigo_receita: '',
  valor_original: '',
  dt_pagamento_original: '',
  observacoes: '',
};

export default function CreditosPage() {
  const [creditos, setCreditos] = useState<PerdcompCredito[]>([]);
  const [empresas, setEmpresas] = useState<PerdcompEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selicLoading, setSelicLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const [filtroEmpresa, setFiltroEmpresa] = useState<number | ''>('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroBusca, setFiltroBusca] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const carregarEmpresas = useCallback(async () => {
    try {
      const resp = await perdcompService.empresas.listar({ limit: 200 });
      setEmpresas(resp.data);
    } catch (err: any) {
      logger.error('Erro ao carregar empresas', err);
    }
  }, []);

  const carregarCreditos = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await perdcompService.creditos.listar({
        id_empresa: filtroEmpresa || undefined,
        tipo_credito: filtroTipo || undefined,
        status: filtroStatus || undefined,
        busca: filtroBusca || undefined,
        page: page + 1,
        limit: rowsPerPage,
      });
      setCreditos(resp.data);
      setTotal(resp.pagination.total);
    } catch (err: any) {
      logger.error('Erro ao carregar créditos', err);
      setError('Erro ao carregar créditos.');
    } finally {
      setLoading(false);
    }
  }, [filtroEmpresa, filtroTipo, filtroStatus, filtroBusca, page, rowsPerPage]);

  useEffect(() => { carregarEmpresas(); }, [carregarEmpresas]);
  useEffect(() => { carregarCreditos(); }, [carregarCreditos]);

  const handleAtualizarSelic = async () => {
    try {
      setSelicLoading(true);
      setError('');
      const resp = await perdcompService.creditos.atualizarSelic(filtroEmpresa || undefined);
      setSuccess(resp.message || 'SELIC atualizada com sucesso.');
      await carregarCreditos();
    } catch (err: any) {
      logger.error('Erro ao atualizar SELIC', err);
      setError('Erro ao atualizar SELIC.');
    } finally {
      setSelicLoading(false);
    }
  };

  const handleOpenCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const handleOpenEdit = async (credito: PerdcompCredito) => {
    setEditingId(credito.id);
    setForm({
      id_empresa: credito.id_empresa,
      tipo_credito: credito.tipo_credito,
      origem_credito: credito.origem_credito,
      periodo_apuracao: credito.periodo_apuracao,
      codigo_receita: credito.codigo_receita || '',
      valor_original: String(credito.valor_original),
      dt_pagamento_original: credito.dt_pagamento_original?.split('T')[0] || '',
      observacoes: credito.observacoes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.id_empresa || !form.tipo_credito || !form.origem_credito || !form.periodo_apuracao || !form.valor_original) {
      setError('Preencha todos os campos obrigatórios.');
      return;
    }
    try {
      setSaving(true);
      setError('');
      const payload = {
        id_empresa: form.id_empresa,
        tipo_credito: form.tipo_credito,
        origem_credito: form.origem_credito,
        periodo_apuracao: form.periodo_apuracao,
        codigo_receita: form.codigo_receita || undefined,
        valor_original: parseFloat(form.valor_original),
        dt_pagamento_original: form.dt_pagamento_original || undefined,
        observacoes: form.observacoes || undefined,
      };
      if (editingId) {
        await perdcompService.creditos.atualizar(editingId, payload);
        setSuccess('Crédito atualizado com sucesso.');
      } else {
        await perdcompService.creditos.criar(payload);
        setSuccess('Crédito criado com sucesso.');
      }
      setDialogOpen(false);
      await carregarCreditos();
    } catch (err: any) {
      logger.error('Erro ao salvar crédito', err);
      setError(err?.response?.data?.error || 'Erro ao salvar crédito.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      setError('');
      await perdcompService.creditos.excluir(deleteConfirmId);
      setSuccess('Crédito excluído com sucesso.');
      setDeleteConfirmId(null);
      await carregarCreditos();
    } catch (err: any) {
      logger.error('Erro ao excluir crédito', err);
      setError('Erro ao excluir crédito.');
    }
  };

  const handleTextField = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const handleSelectField = (field: keyof FormData) => (e: SelectChangeEvent<unknown>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
          Gestão de Créditos
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            variant="outlined"
            startIcon={selicLoading ? <CircularProgress size={18} /> : <RefreshIcon />}
            disabled={selicLoading}
            onClick={handleAtualizarSelic}
            sx={{ borderRadius: '10px', textTransform: 'none', borderColor: T.textSecond, color: T.textSecond, '&:hover': { borderColor: T.navy } }}
          >
            Atualizar SELIC
          </Button>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={handleOpenCreate}
            sx={{ borderRadius: '10px', textTransform: 'none', backgroundColor: T.cyan, '&:hover': { backgroundColor: '#00b0d8' } }}
          >
            Novo Crédito
          </Button>
        </Box>
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
          <InputLabel>Tipo Crédito</InputLabel>
          <Select value={filtroTipo} label="Tipo Crédito" onChange={(e) => { setFiltroTipo(e.target.value as string); setPage(0); }}>
            <MenuItem value="">Todos</MenuItem>
            {TIPOS_CREDITO.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl size="small" sx={{ minWidth: 180, ...inputSx }}>
          <InputLabel>Status</InputLabel>
          <Select value={filtroStatus} label="Status" onChange={(e) => { setFiltroStatus(e.target.value as string); setPage(0); }}>
            <MenuItem value="">Todos</MenuItem>
            {STATUS_CREDITO.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
        <TextField
          size="small"
          placeholder="Buscar..."
          value={filtroBusca}
          onChange={(e) => { setFiltroBusca(e.target.value); setPage(0); }}
          InputProps={{ startAdornment: <SearchIcon sx={{ color: T.textSecond, mr: 0.5, fontSize: 20 }} /> }}
          sx={{ minWidth: 200, ...inputSx }}
        />
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
                  {['Empresa', 'Tipo Crédito', 'Origem', 'Período', 'Valor Original', 'Valor Atualizado', 'Saldo Disponível', 'Prescrição', 'Status', 'Ações'].map(h => (
                    <TableCell key={h} sx={{ color: '#fff', fontWeight: 600, fontSize: '0.8125rem', whiteSpace: 'nowrap' }}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {creditos.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} sx={{ textAlign: 'center', py: 4, color: T.textSecond }}>
                      Nenhum crédito encontrado.
                    </TableCell>
                  </TableRow>
                ) : (
                  creditos.map(c => (
                    <TableRow key={c.id} hover sx={{ '&:hover': { backgroundColor: 'rgba(0,200,240,0.04)' } }}>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{c.empresa_razao_social || c.id_empresa}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{c.tipo_credito}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{c.origem_credito}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem' }}>{c.periodo_apuracao}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(c.valor_original)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>{formatBRL(c.valor_atualizado)}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{formatBRL(c.saldo_disponivel)}</TableCell>
                      <TableCell>{prescricaoChip(c.dias_para_prescricao)}</TableCell>
                      <TableCell><Chip label={c.status} color={statusColor(c.status)} size="small" /></TableCell>
                      <TableCell>
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => handleOpenEdit(c)} sx={{ color: T.cyan }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir">
                          <IconButton size="small" onClick={() => setDeleteConfirmId(c.id)} sx={{ color: '#ef5350' }}>
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
          {editingId ? 'Editar Crédito' : 'Novo Crédito'}
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
            <InputLabel>Tipo de Crédito *</InputLabel>
            <Select value={form.tipo_credito} label="Tipo de Crédito *" onChange={handleSelectField('tipo_credito')}>
              {TIPOS_CREDITO.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" sx={inputSx}>
            <InputLabel>Origem do Crédito *</InputLabel>
            <Select value={form.origem_credito} label="Origem do Crédito *" onChange={handleSelectField('origem_credito')}>
              {ORIGENS_CREDITO.map(o => <MenuItem key={o} value={o}>{o}</MenuItem>)}
            </Select>
          </FormControl>
          <TextField fullWidth size="small" label="Período (MM/AAAA) *" value={form.periodo_apuracao} onChange={handleTextField('periodo_apuracao')} placeholder="01/2025" sx={inputSx} />
          <TextField fullWidth size="small" label="Código Receita" value={form.codigo_receita} onChange={handleTextField('codigo_receita')} sx={inputSx} />
          <TextField fullWidth size="small" label="Valor Original *" type="number" value={form.valor_original} onChange={handleTextField('valor_original')} inputProps={{ step: '0.01', min: '0' }} sx={inputSx} />
          <TextField fullWidth size="small" label="Data Pagamento Original" type="date" value={form.dt_pagamento_original} onChange={handleTextField('dt_pagamento_original')} InputLabelProps={{ shrink: true }} sx={inputSx} />
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
          <Typography sx={{ color: T.textSecond }}>Tem certeza que deseja excluir este crédito? Esta ação não pode ser desfeita.</Typography>
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
