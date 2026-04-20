import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TablePagination,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Alert, CircularProgress,
  Chip, Stack, InputAdornment, Switch,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { clientesService } from '../services/clientesService';
import type { Cliente } from '../types';
import { logger } from '../utils/logger';

// ─── Constantes ──────────────────────────────────────────────────────────────

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'] as const;
type Regime = typeof REGIMES[number];

// ─── Tokens de estilo ────────────────────────────────────────────────────────

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

const thCellSx = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
};

const dialogPaper = {
  borderRadius: '16px', border: `1px solid ${T.border}`,
  boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatCNPJ = (cnpj: string): string => {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14) return cnpj;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const maskCNPJ = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)}.${d.slice(2)}`;
  if (d.length <= 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
};

const maskCEP = (value: string): string => {
  const d = value.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
};

const isValidCNPJ = (cnpj: string): boolean => {
  const d = cnpj.replace(/\D/g, '');
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (slice: string, weights: number[]) => {
    const sum = slice.split('').reduce((a, c, i) => a + parseInt(c) * weights[i], 0);
    const r = sum % 11; return r < 2 ? 0 : 11 - r;
  };
  const d1 = calc(d.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const d2 = calc(d.slice(0, 13), [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return parseInt(d[12]) === d1 && parseInt(d[13]) === d2;
};

// ─── Form inicial ─────────────────────────────────────────────────────────────

const INITIAL_FORM = {
  cnpj: '', razao_social: '', nome_fantasia: '', inscricao_estadual: '',
  matriz: 'S' as 'S' | 'N', regime_tributario: '' as Regime | '',
  endereco: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '', cep: '',
};

// ─── Component ────────────────────────────────────────────────────────────────

const ClientesPage: React.FC = () => {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroRegime, setFiltroRegime] = useState('');
  const [filtroUF, setFiltroUF] = useState('');
  const [filtroAtivo, setFiltroAtivo] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const [openModal, setOpenModal] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [modalErro, setModalErro] = useState('');

  // ─── Carregamento ──────────────────────────────────────────────────────────

  const carregarClientes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await clientesService.listar({
        busca: filtroBusca || undefined,
        regime: filtroRegime || undefined,
        uf: filtroUF || undefined,
        ativo: filtroAtivo || undefined,
        page: page + 1,
        limit: rowsPerPage,
      });
      setClientes(res.data);
      setTotalRecords(res.pagination.total);
    } catch (error: any) {
      logger.error('Erro ao carregar clientes:', error);
      setErro(error.response?.data?.error || 'Erro ao carregar clientes');
    } finally {
      setLoading(false);
    }
  }, [filtroBusca, filtroRegime, filtroUF, filtroAtivo, page, rowsPerPage]);

  useEffect(() => { carregarClientes(); }, [carregarClientes]);

  useEffect(() => {
    if (sucesso) { const t = setTimeout(() => setSucesso(''), 4000); return () => clearTimeout(t); }
  }, [sucesso]);

  // ─── Modal ────────────────────────────────────────────────────────────────

  const handleOpenModal = (cliente?: Cliente) => {
    if (cliente) {
      setEditingCliente(cliente);
      setFormData({
        cnpj: maskCNPJ(cliente.cnpj),
        razao_social: cliente.razao_social,
        nome_fantasia: cliente.nome_fantasia || '',
        inscricao_estadual: cliente.inscricao_estadual || '',
        matriz: cliente.matriz,
        regime_tributario: (cliente.regime_tributario || '') as Regime | '',
        endereco: cliente.endereco || '',
        numero: cliente.numero || '',
        complemento: cliente.complemento || '',
        bairro: cliente.bairro || '',
        municipio: cliente.municipio || '',
        uf: cliente.uf || '',
        cep: maskCEP(cliente.cep || ''),
      });
    } else {
      setEditingCliente(null);
      setFormData(INITIAL_FORM);
    }
    setFormErrors({});
    setModalErro('');
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setEditingCliente(null);
    setFormData(INITIAL_FORM);
    setFormErrors({});
    setModalErro('');
  };

  // ─── Validação ────────────────────────────────────────────────────────────

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    const cnpjDigits = formData.cnpj.replace(/\D/g, '');
    if (!cnpjDigits) errors.cnpj = 'CNPJ é obrigatório';
    else if (!isValidCNPJ(cnpjDigits)) errors.cnpj = 'CNPJ inválido';
    if (!formData.razao_social.trim()) errors.razao_social = 'Razão Social é obrigatória';
    if (!formData.regime_tributario) errors.regime_tributario = 'Regime Tributário é obrigatório';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ─── Salvar ───────────────────────────────────────────────────────────────

  const handleSalvar = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      setModalErro('');
      const payload: Partial<Cliente> = {
        cnpj: formData.cnpj.replace(/\D/g, ''),
        razao_social: formData.razao_social.trim(),
        nome_fantasia: formData.nome_fantasia.trim() || undefined,
        inscricao_estadual: formData.inscricao_estadual.trim() || undefined,
        matriz: formData.matriz,
        regime_tributario: formData.regime_tributario as Regime,
        endereco: formData.endereco.trim() || undefined,
        numero: formData.numero.trim() || undefined,
        complemento: formData.complemento.trim() || undefined,
        bairro: formData.bairro.trim() || undefined,
        municipio: formData.municipio.trim() || undefined,
        uf: formData.uf || undefined,
        cep: formData.cep.replace(/\D/g, '') || undefined,
      };

      if (editingCliente) {
        await clientesService.atualizar(editingCliente.id, payload);
        setSucesso('Cliente atualizado com sucesso');
      } else {
        await clientesService.criar(payload);
        setSucesso('Cliente criado com sucesso');
      }
      handleCloseModal();
      carregarClientes();
    } catch (error: any) {
      logger.error('Erro ao salvar cliente:', error);
      const rd = error.response?.data;
      let msg = 'Erro ao salvar cliente';
      if (rd?.errors && Array.isArray(rd.errors)) msg = rd.errors.map((e: any) => e.message || e.msg).join('; ');
      else if (rd?.error) msg = rd.error;
      else if (rd?.erro) msg = rd.erro;
      setModalErro(msg);
    } finally {
      setSaving(false);
    }
  };

  // ─── Excluir ──────────────────────────────────────────────────────────────

  const handleExcluir = async (cliente: Cliente) => {
    if (!window.confirm(`Deseja realmente excluir o cliente "${cliente.razao_social}"?`)) return;
    try {
      await clientesService.excluir(cliente.id);
      setSucesso('Cliente excluído com sucesso');
      carregarClientes();
    } catch (error: any) {
      logger.error('Erro ao excluir cliente:', error);
      setErro(error.response?.data?.error || 'Erro ao excluir cliente');
    }
  };

  // ─── Toggle ativo ─────────────────────────────────────────────────────────

  const handleToggleAtivo = async (cliente: Cliente) => {
    try {
      await clientesService.alternarAtivo(cliente.id);
      carregarClientes();
    } catch (error: any) {
      logger.error('Erro ao alterar status do cliente:', error);
      setErro(error.response?.data?.error || 'Erro ao alterar status');
    }
  };

  // ─── Campo helper ─────────────────────────────────────────────────────────

  const field = (key: keyof typeof INITIAL_FORM) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setFormData(prev => ({ ...prev, [key]: e.target.value }));

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Cadastro de Clientes
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Gerencie os clientes do sistema
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenModal()} sx={btnPrimary}>
          Novo Cliente
        </Button>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2, borderRadius: '10px' }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2, borderRadius: '10px' }}>{sucesso}</Alert>}

      {/* Filtros */}
      <Paper elevation={0} sx={{ p: 2.5, mb: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <Box sx={{ flex: 3 }}>
            <TextField
              fullWidth size="small" placeholder="Buscar por CNPJ ou Razão Social"
              value={filtroBusca}
              onChange={(e) => { setFiltroBusca(e.target.value); setPage(0); }}
              sx={inputSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ fontSize: 18, color: T.textSecond }} />
                    </InputAdornment>
                  ),
                },
              }}
            />
          </Box>
          <Box sx={{ flex: 2 }}>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Regime Tributário</InputLabel>
              <Select value={filtroRegime} label="Regime Tributário"
                onChange={(e) => { setFiltroRegime(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                {REGIMES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flex: 1 }}>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>UF</InputLabel>
              <Select value={filtroUF} label="UF"
                onChange={(e) => { setFiltroUF(e.target.value); setPage(0); }}>
                <MenuItem value="">Todas</MenuItem>
                {UF_LIST.map(uf => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ flex: 1 }}>
            <FormControl fullWidth size="small" sx={inputSx}>
              <InputLabel>Status</InputLabel>
              <Select value={filtroAtivo} label="Status"
                onChange={(e) => { setFiltroAtivo(e.target.value); setPage(0); }}>
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="1">Ativo</MenuItem>
                <MenuItem value="0">Inativo</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Stack>
      </Paper>

      {/* Tabela */}
      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
          <CircularProgress sx={{ color: T.cyan }} />
        </Box>
      ) : (
        <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={thCellSx}>CNPJ</TableCell>
                  <TableCell sx={thCellSx}>Razão Social</TableCell>
                  <TableCell sx={thCellSx}>Nome Fantasia</TableCell>
                  <TableCell sx={thCellSx}>Regime</TableCell>
                  <TableCell align="center" sx={thCellSx}>Matriz</TableCell>
                  <TableCell align="center" sx={thCellSx}>UF</TableCell>
                  <TableCell align="center" sx={thCellSx}>Ativo</TableCell>
                  <TableCell align="center" sx={thCellSx}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {clientes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4, color: T.textSecond, fontSize: '0.875rem' }}>
                      Nenhum cliente encontrado
                    </TableCell>
                  </TableRow>
                ) : clientes.map((cli) => (
                  <TableRow key={cli.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8125rem', color: T.textSecond }}>
                      {formatCNPJ(cli.cnpj)}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}>
                      {cli.razao_social}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                      {cli.nome_fantasia || '—'}
                    </TableCell>
                    <TableCell>
                      <Chip label={cli.regime_tributario} size="small" variant="outlined"
                        sx={{ fontSize: '0.6875rem', fontWeight: 600 }} />
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={cli.matriz === 'S' ? 'Matriz' : 'Filial'}
                        size="small"
                        sx={{
                          fontSize: '0.6875rem', fontWeight: 600,
                          backgroundColor: cli.matriz === 'S' ? 'rgba(0,200,240,0.10)' : 'rgba(100,116,139,0.10)',
                          color: cli.matriz === 'S' ? T.cyan : T.textSecond,
                        }}
                      />
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                      {cli.uf || '—'}
                    </TableCell>
                    <TableCell align="center">
                      <Switch
                        checked={cli.ativo === 1}
                        onChange={() => handleToggleAtivo(cli)}
                        size="small"
                        sx={{
                          '& .MuiSwitch-switchBase.Mui-checked': { color: T.cyan },
                          '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.cyan },
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleOpenModal(cli)}
                        sx={{ color: T.textSecond, '&:hover': { color: T.cyan, backgroundColor: T.cyanDim } }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleExcluir(cli)}
                        sx={{ color: T.textSecond, '&:hover': { color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)' } }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalRecords}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            labelRowsPerPage="Registros por página"
            labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count !== -1 ? count : `mais de ${to}`}`}
            sx={{ borderTop: `1px solid ${T.border}`, '& .MuiTablePagination-toolbar': { px: 2 } }}
          />
        </Paper>
      )}

      {/* Modal */}
      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth scroll="paper"
        slotProps={{ paper: { sx: dialogPaper } }}>
        <DialogTitle sx={{ fontSize: '1.0625rem', fontWeight: 700, color: T.textPrimary, pb: 0 }}>
          {editingCliente ? 'Editar Cliente' : 'Novo Cliente'}
        </DialogTitle>
        <DialogContent sx={{ pt: 0 }}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 3 }}>
            {modalErro && (
              <Alert severity="error" onClose={() => setModalErro('')} sx={{ borderRadius: '10px' }}>{modalErro}</Alert>
            )}

            {/* CNPJ + Razão Social */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="CNPJ" value={formData.cnpj} fullWidth required
                disabled={!!editingCliente}
                onChange={(e) => setFormData(p => ({ ...p, cnpj: maskCNPJ(e.target.value) }))}
                error={!!formErrors.cnpj} helperText={formErrors.cnpj}
                placeholder="00.000.000/0000-00"
                slotProps={{ htmlInput: { maxLength: 18 } }}
                sx={inputSx}
              />
              <TextField
                label="Razão Social" value={formData.razao_social} fullWidth required
                onChange={field('razao_social')}
                error={!!formErrors.razao_social} helperText={formErrors.razao_social}
                sx={inputSx}
              />
            </Stack>

            {/* Nome Fantasia + Inscrição Estadual */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Nome Fantasia" value={formData.nome_fantasia} fullWidth
                onChange={field('nome_fantasia')} sx={inputSx} />
              <TextField label="Inscrição Estadual" value={formData.inscricao_estadual} fullWidth
                onChange={field('inscricao_estadual')} sx={inputSx} />
            </Stack>

            {/* Regime + Matriz */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth required error={!!formErrors.regime_tributario} sx={inputSx}>
                <InputLabel>Regime Tributário</InputLabel>
                <Select value={formData.regime_tributario} label="Regime Tributário"
                  onChange={(e) => setFormData(p => ({ ...p, regime_tributario: e.target.value as Regime }))}>
                  {REGIMES.map(r => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                </Select>
                {formErrors.regime_tributario && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {formErrors.regime_tributario}
                  </Typography>
                )}
              </FormControl>
              <FormControl fullWidth sx={inputSx}>
                <InputLabel>Tipo</InputLabel>
                <Select value={formData.matriz} label="Tipo"
                  onChange={(e) => setFormData(p => ({ ...p, matriz: e.target.value as 'S' | 'N' }))}>
                  <MenuItem value="S">Matriz</MenuItem>
                  <MenuItem value="N">Filial</MenuItem>
                </Select>
              </FormControl>
            </Stack>

            {/* Endereço */}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <Box sx={{ flex: 3 }}>
                <TextField label="Endereço (Logradouro)" value={formData.endereco} fullWidth
                  onChange={field('endereco')} sx={inputSx} />
              </Box>
              <Box sx={{ flex: 1 }}>
                <TextField label="Número" value={formData.numero} fullWidth
                  onChange={field('numero')} sx={inputSx} />
              </Box>
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Complemento" value={formData.complemento} fullWidth
                onChange={field('complemento')} sx={inputSx} />
              <TextField label="Bairro" value={formData.bairro} fullWidth
                onChange={field('bairro')} sx={inputSx} />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField label="Município" value={formData.municipio} fullWidth
                onChange={field('municipio')} sx={inputSx} />
              <FormControl fullWidth sx={inputSx}>
                <InputLabel>UF</InputLabel>
                <Select value={formData.uf} label="UF"
                  onChange={(e) => setFormData(p => ({ ...p, uf: e.target.value }))}>
                  <MenuItem value="">Selecione</MenuItem>
                  {UF_LIST.map(uf => <MenuItem key={uf} value={uf}>{uf}</MenuItem>)}
                </Select>
              </FormControl>
              <TextField label="CEP" value={formData.cep} fullWidth
                onChange={(e) => setFormData(p => ({ ...p, cep: maskCEP(e.target.value) }))}
                placeholder="00000-000"
                slotProps={{ htmlInput: { maxLength: 9 } }}
                sx={inputSx} />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, pt: 2, borderTop: `1px solid ${T.border}` }}>
          <Button onClick={handleCloseModal} variant="outlined" disabled={saving} sx={btnOutlined}>
            Cancelar
          </Button>
          <Button onClick={handleSalvar} variant="contained" disabled={saving} sx={btnPrimary}>
            {saving
              ? <CircularProgress size={20} sx={{ color: T.navy }} />
              : editingCliente ? 'Atualizar' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ClientesPage;
