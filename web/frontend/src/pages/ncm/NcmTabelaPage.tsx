import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Alert, CircularProgress, Stack, InputAdornment, Switch,
  FormControl, InputLabel, Select, MenuItem,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Search as SearchIcon, Close as CloseIcon,
} from '@mui/icons-material';
import { ncmTabelaService } from '../../services/ncmTabelaService';
import type { NcmTabela } from '../../types';
import { logger } from '../../utils/logger';

// ─── Constantes ──────────────────────────────────────────────────────────────

const T = {
  cyan: '#00c8f0',
  cyanGlow: '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover: '0 6px 22px rgba(0,200,240,0.38)',
  cyanDim: 'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  inputBg: '#F7F9FC',
  navy: '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
  emerald: '#2BCB9A',
  red: '#EF4444',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg,
    borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
    '&.Mui-disabled': { backgroundColor: 'rgba(15,30,60,0.03)' },
  },
  '& .MuiOutlinedInput-input::placeholder': { color: '#A0AEC0', opacity: 1 },
};

// ─── Estado inicial de formulário ─────────────────────────────────────────────

const formInicial: Partial<NcmTabela> = {
  codigo: '',
  descricao: '',
  dt_inicio: undefined,
  dt_fim: undefined,
  ato_legal: '',
  numero: '',
  ano: undefined,
  status: true,
};

// ─── Componente Principal ────────────────────────────────────────────────────

export default function NcmTabelaPage() {
  const [ncms, setNcms] = useState<NcmTabela[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Paginação
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(20);
  const [total, setTotal] = useState(0);

  // Filtros
  const [busca, setBusca] = useState('');
  const [filtroStatus, setFiltroStatus] = useState<string>('');

  // Dialogs
  const [openDialog, setOpenDialog] = useState(false);
  const [openDeleteDialog, setOpenDeleteDialog] = useState(false);

  // Formulário
  const [form, setForm] = useState<Partial<NcmTabela>>(formInicial);
  const [editandoId, setEditandoId] = useState<number | null>(null);

  // Pré-seleção para deletar
  const [ncmParaDeleta, setNcmParaDeleta] = useState<NcmTabela | null>(null);

  // ─── Funções ─────────────────────────────────────────────────────────────

  // Carregar lista
  const carregarNcms = useCallback(async () => {
    try {
      setCarregando(true);
      setErro(null);
      const resultado = await ncmTabelaService.listar({
        busca: busca || undefined,
        status: filtroStatus || undefined,
        page: page + 1,
        limit,
      });
      setNcms(resultado.data);
      setTotal(resultado.pagination.total);
    } catch (err: any) {
      const mensagem = err?.response?.data?.error || 'Erro ao carregar NCMs';
      setErro(mensagem);
      logger.error(`[NcmTabelaPage] Erro: ${mensagem}`, err);
    } finally {
      setCarregando(false);
    }
  }, [busca, filtroStatus, page, limit]);

  useEffect(() => {
    carregarNcms();
  }, [carregarNcms]);

  // Abrir dialog para criar/editar
  const abrirDialog = (ncm?: NcmTabela) => {
    if (ncm) {
      setForm(ncm);
      setEditandoId(ncm.id);
    } else {
      setForm(formInicial);
      setEditandoId(null);
    }
    setOpenDialog(true);
  };

  // Fechar dialog
  const fecharDialog = () => {
    setOpenDialog(false);
    setForm(formInicial);
    setEditandoId(null);
  };

  // Salvar (criar ou atualizar)
  const salvar = async () => {
    try {
      setCarregando(true);

      if (editandoId) {
        await ncmTabelaService.atualizar(editandoId, form);
      } else {
        await ncmTabelaService.criar(form);
      }

      fecharDialog();
      await carregarNcms();
    } catch (err: any) {
      const mensagem = err?.response?.data?.error || 'Erro ao salvar NCM';
      setErro(mensagem);
      logger.error(`[NcmTabelaPage] Erro ao salvar: ${mensagem}`, err);
    } finally {
      setCarregando(false);
    }
  };

  // Alterar status
  const alternarStatus = async (ncm: NcmTabela) => {
    try {
      setCarregando(true);
      await ncmTabelaService.alternarStatus(ncm.id);
      await carregarNcms();
    } catch (err: any) {
      const mensagem = err?.response?.data?.error || 'Erro ao alterar status';
      setErro(mensagem);
      logger.error(`[NcmTabelaPage] Erro ao alterar status: ${mensagem}`, err);
    } finally {
      setCarregando(false);
    }
  };

  // Deletar
  const deletar = async () => {
    if (!ncmParaDeleta) return;

    try {
      setCarregando(true);
      await ncmTabelaService.excluir(ncmParaDeleta.id);
      setOpenDeleteDialog(false);
      setNcmParaDeleta(null);
      await carregarNcms();
    } catch (err: any) {
      const mensagem = err?.response?.data?.error || 'Erro ao deletar NCM';
      setErro(mensagem);
      logger.error(`[NcmTabelaPage] Erro ao deletar: ${mensagem}`, err);
    } finally {
      setCarregando(false);
    }
  };

  // Mudar página
  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  // Mudar items por página
  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setLimit(parseInt(event.target.value, 10));
    setPage(0);
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em', mb: 0.5 }}>
          Tabela de NCM
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: T.textSecond }}>
          NCM - Nomenclatura Comum do MERCOSUL
        </Typography>
      </Box>

      {/* Alertas */}
      {erro && (
        <Alert severity="error" onClose={() => setErro(null)} sx={{ mb: 2 }}>
          {erro}
        </Alert>
      )}

      {/* Barra de filtros e ações */}
      <Paper
        sx={{
          mb: 2,
          p: 2,
          backgroundColor: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: '12px',
          boxShadow: T.cardShadow,
        }}
      >
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mb: 2 }}>
          {/* Campo de Busca */}
          <TextField
            placeholder="Buscar por código ou descrição..."
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setPage(0);
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: T.textSecond, fontSize: '1.25rem' }} />
                </InputAdornment>
              ),
            }}
            sx={{ flex: 1, ...inputSx }}
            size="small"
          />

          {/* Filtro de Status */}
          <FormControl size="small" sx={{ minWidth: 140, ...inputSx }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filtroStatus}
              label="Status"
              onChange={(e) => {
                setFiltroStatus(e.target.value);
                setPage(0);
              }}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="true">Ativo</MenuItem>
              <MenuItem value="false">Inativo</MenuItem>
            </Select>
          </FormControl>

          {/* Botão Criar */}
          <Button
            startIcon={<AddIcon />}
            onClick={() => abrirDialog()}
            sx={{
              backgroundColor: T.cyan,
              color: T.navy,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              padding: '8px 16px',
              boxShadow: T.cyanGlow,
              '&:hover': {
                backgroundColor: T.cyan,
                boxShadow: T.cyanHover,
              },
            }}
          >
            Novo NCM
          </Button>
        </Stack>
      </Paper>

      {/* Tabela */}
      <TableContainer
        component={Paper}
        sx={{
          backgroundColor: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: '12px',
          boxShadow: T.cardShadow,
          position: 'relative',
        }}
      >
        {carregando && (
          <Box
            sx={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(255,255,255,0.7)',
              zIndex: 10,
              borderRadius: '12px',
            }}
          >
            <CircularProgress size={40} sx={{ color: T.cyan }} />
          </Box>
        )}

        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: 'rgba(0, 200, 240, 0.04)', borderBottom: `2px solid ${T.border}` }}>
              <TableCell sx={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.875rem' }}>Código</TableCell>
              <TableCell sx={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.875rem' }}>Descrição</TableCell>
              <TableCell sx={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.875rem' }}>Ano</TableCell>
              <TableCell sx={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.875rem' }}>Ato Legal</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.875rem' }}>
                Status
              </TableCell>
              <TableCell align="center" sx={{ fontWeight: 700, color: T.textPrimary, fontSize: '0.875rem' }}>
                Ações
              </TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {ncms.map((ncm) => (
              <TableRow
                key={ncm.id}
                sx={{
                  '&:hover': { backgroundColor: 'rgba(0, 200, 240, 0.02)' },
                  borderBottom: `1px solid ${T.border}`,
                }}
              >
                <TableCell sx={{ fontSize: '0.875rem', color: T.textPrimary, fontWeight: 500 }}>
                  {ncm.codigo}
                </TableCell>
                <TableCell sx={{ fontSize: '0.875rem', color: T.textSecond }}>
                  {ncm.descricao?.substring(0, 50)}
                  {ncm.descricao && ncm.descricao.length > 50 ? '...' : ''}
                </TableCell>
                <TableCell sx={{ fontSize: '0.875rem', color: T.textSecond }}>
                  {ncm.ano || '—'}
                </TableCell>
                <TableCell sx={{ fontSize: '0.875rem', color: T.textSecond }}>
                  {ncm.ato_legal || '—'}
                </TableCell>
                <TableCell align="center">
                  <Switch
                    checked={ncm.status}
                    onChange={() => alternarStatus(ncm)}
                    disabled={carregando}
                    size="small"
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: T.emerald },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.emerald },
                    }}
                  />
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    size="small"
                    onClick={() => abrirDialog(ncm)}
                    sx={{ color: T.cyan }}
                  >
                    <EditIcon fontSize="small" />
                  </IconButton>
                  <IconButton
                    size="small"
                    onClick={() => {
                      setNcmParaDeleta(ncm);
                      setOpenDeleteDialog(true);
                    }}
                    sx={{ color: T.red }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {ncms.length === 0 && !carregando && (
          <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography sx={{ color: T.textSecond }}>Nenhum NCM encontrado</Typography>
          </Box>
        )}
      </TableContainer>

      {/* Paginação */}
      <TablePagination
        component="div"
        count={total}
        page={page}
        onPageChange={handleChangePage}
        rowsPerPage={limit}
        onRowsPerPageChange={handleChangeRowsPerPage}
        rowsPerPageOptions={[10, 20, 50]}
        sx={{
          backgroundColor: T.surface,
          border: `1px solid ${T.border}`,
          borderTop: 'none',
          borderRadius: '0 0 12px 12px',
        }}
      />

      {/* Dialog: Criar/Editar */}
      <Dialog
        open={openDialog}
        onClose={fecharDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: '12px',
            boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: T.textPrimary, pb: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {editandoId ? 'Editar NCM' : 'Novo NCM'}
          <IconButton size="small" onClick={fecharDialog}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          <Stack spacing={2}>
            <TextField
              label="Código *"
              value={form.codigo || ''}
              onChange={(e) => setForm({ ...form, codigo: e.target.value })}
              fullWidth
              sx={inputSx}
              size="small"
            />

            <TextField
              label="Descrição *"
              value={form.descricao || ''}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              fullWidth
              multiline
              rows={3}
              sx={inputSx}
              size="small"
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Data Início"
                type="date"
                value={form.dt_inicio || ''}
                onChange={(e) => setForm({ ...form, dt_inicio: e.target.value || undefined })}
                fullWidth
                sx={inputSx}
                size="small"
                InputLabelProps={{ shrink: true }}
              />

              <TextField
                label="Data Fim"
                type="date"
                value={form.dt_fim || ''}
                onChange={(e) => setForm({ ...form, dt_fim: e.target.value || undefined })}
                fullWidth
                sx={inputSx}
                size="small"
                InputLabelProps={{ shrink: true }}
              />
            </Stack>

            <TextField
              label="Ato Legal"
              value={form.ato_legal || ''}
              onChange={(e) => setForm({ ...form, ato_legal: e.target.value })}
              fullWidth
              sx={inputSx}
              size="small"
            />

            <Stack direction="row" spacing={2}>
              <TextField
                label="Número"
                value={form.numero || ''}
                onChange={(e) => setForm({ ...form, numero: e.target.value })}
                fullWidth
                sx={inputSx}
                size="small"
              />

              <TextField
                label="Ano"
                type="number"
                value={form.ano || ''}
                onChange={(e) => setForm({ ...form, ano: e.target.value ? parseInt(e.target.value) : undefined })}
                fullWidth
                sx={inputSx}
                size="small"
              />
            </Stack>

            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Switch
                checked={form.status ?? true}
                onChange={(e) => setForm({ ...form, status: e.target.checked })}
              />
              <Typography sx={{ fontSize: '0.875rem', color: T.textSecond }}>
                {(form.status ?? true) ? 'Ativo' : 'Inativo'}
              </Typography>
            </Box>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={fecharDialog}
            sx={{
              color: T.textSecond,
              textTransform: 'none',
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={salvar}
            disabled={!form.codigo || !form.descricao || carregando}
            sx={{
              backgroundColor: T.cyan,
              color: T.navy,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              '&:hover': { backgroundColor: T.cyan },
              '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.3)', color: T.navy },
            }}
          >
            {editandoId ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: Confirmar Exclusão */}
      <Dialog
        open={openDeleteDialog}
        onClose={() => {
          setOpenDeleteDialog(false);
          setNcmParaDeleta(null);
        }}
        PaperProps={{
          sx: {
            borderRadius: '12px',
            boxShadow: '0 20px 25px rgba(0,0,0,0.15)',
          },
        }}
      >
        <DialogTitle sx={{ fontWeight: 700, color: T.textPrimary }}>
          Confirmar exclusão
        </DialogTitle>

        <DialogContent>
          <Typography sx={{ color: T.textSecond }}>
            Tem certeza que deseja deletar o NCM <strong>{ncmParaDeleta?.codigo}</strong>?
            Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>

        <DialogActions sx={{ p: 2, gap: 1 }}>
          <Button
            onClick={() => {
              setOpenDeleteDialog(false);
              setNcmParaDeleta(null);
            }}
            sx={{
              color: T.textSecond,
              textTransform: 'none',
              '&:hover': { backgroundColor: 'rgba(0,0,0,0.04)' },
            }}
          >
            Cancelar
          </Button>
          <Button
            onClick={deletar}
            disabled={carregando}
            sx={{
              backgroundColor: T.red,
              color: T.surface,
              fontWeight: 600,
              textTransform: 'none',
              borderRadius: '8px',
              '&:hover': { backgroundColor: '#DC2626' },
              '&.Mui-disabled': { backgroundColor: 'rgba(239,68,68,0.3)', color: T.surface },
            }}
          >
            Deletar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
