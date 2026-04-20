import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  Chip,
  Stack,
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { empresasService } from '../services/empresasService';
import type { RegimeTributario } from '../types/perdcomp';
import type { Empresas } from '../types/index';
import { logger } from '../utils/logger';

const UF_LIST = [
  'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO',
];

const REGIMES: RegimeTributario[] = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'];

const formatCNPJ = (cnpj: string): string => {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return cnpj;
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const maskCNPJ = (value: string): string => {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 2) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 2)}.${digits.slice(2)}`;
  if (digits.length <= 8) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5)}`;
  if (digits.length <= 12) return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8)}`;
  return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
};

const isValidCNPJ = (cnpj: string): boolean => {
  const digits = cnpj.replace(/\D/g, '');
  if (digits.length !== 14) return false;
  if (/^(\d)\1+$/.test(digits)) return false;

  const calc = (slice: string, weights: number[]): number => {
    const sum = slice.split('').reduce((acc, d, i) => acc + parseInt(d) * weights[i], 0);
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = calc(digits.slice(0, 12), w1);
  const d2 = calc(digits.slice(0, 13), w2);
  return parseInt(digits[12]) === d1 && parseInt(digits[13]) === d2;
};

const INITIAL_FORM = {
  cnpj: '',
  razao_social: '',
  nome_fantasia: '',
  inscricao_estadual: '',
  regime_tributario: '' as RegimeTributario | '',
  uf: '',
  municipio: '',
};

const EmpresasPage: React.FC = () => {
  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [filtroBusca, setFiltroBusca] = useState('');
  const [filtroRegime, setFiltroRegime] = useState('');
  const [filtroUF, setFiltroUF] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const [openModal, setOpenModal] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresas | null>(null);
  const [formData, setFormData] = useState(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [buscandoCNPJ, setBuscandoCNPJ] = useState(false);
  const [cnpjInfo, setCnpjInfo] = useState('');
  const [modalErro, setModalErro] = useState('');

  const carregarEmpresas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await empresasService.listar({
        busca: filtroBusca || undefined,
        regime: filtroRegime || undefined,
        uf: filtroUF || undefined,
        page: page + 1,
        limit: rowsPerPage,
      });
      setEmpresas(res.data);
      setTotalRecords(res.pagination.total);
    } catch (error: any) {
      logger.error('Erro ao carregar empresas:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar empresas');
    } finally {
      setLoading(false);
    }
  }, [filtroBusca, filtroRegime, filtroUF, page, rowsPerPage]);

  useEffect(() => {
    carregarEmpresas();
  }, [carregarEmpresas]);

  useEffect(() => {
    if (sucesso) {
      const t = setTimeout(() => setSucesso(''), 4000);
      return () => clearTimeout(t);
    }
  }, [sucesso]);

  useEffect(() => {
    const cnpjDigits = formData.cnpj.replace(/\D/g, '');
    if (cnpjDigits.length !== 14 || editingEmpresa || !openModal) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      setBuscandoCNPJ(true);
      setCnpjInfo('');
      empresasService.buscarCNPJ(cnpjDigits)
        .then((dados) => {
          if (cancelled) return;
          setFormData(prev => ({
            ...prev,
            razao_social: dados.razao_social || prev.razao_social,
            nome_fantasia: dados.nome_fantasia || prev.nome_fantasia,
            uf: dados.uf || prev.uf,
            municipio: dados.municipio || prev.municipio,
            regime_tributario: dados.regime_tributario || prev.regime_tributario,
          }));
          const parts: string[] = [];
          if (dados.situacao) parts.push(`Situação: ${dados.situacao}`);
          if (dados.atividade_principal) parts.push(`Atividade: ${dados.atividade_principal}`);
          if (dados.natureza_juridica) parts.push(`Natureza: ${dados.natureza_juridica}`);
          if (dados.endereco) parts.push(`Endereço: ${dados.endereco}`);
          if (dados.telefone) parts.push(`Telefone: ${dados.telefone}`);
          if (dados.email) parts.push(`Email: ${dados.email}`);
          if (!dados.nome_fantasia) parts.push('Nome fantasia não registrado na Receita Federal');
          setCnpjInfo(parts.join(' | '));
        })
        .catch(() => {
          if (!cancelled) setCnpjInfo('Não foi possível buscar dados do CNPJ automaticamente.');
        })
        .finally(() => {
          if (!cancelled) setBuscandoCNPJ(false);
        });
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [formData.cnpj, editingEmpresa, openModal]);

  const handleOpenModal = (empresa?: Empresas) => {
    if (empresa) {
      setEditingEmpresa(empresa);
      setFormData({
        cnpj: maskCNPJ(empresa.cnpj),
        razao_social: empresa.razao_social,
        nome_fantasia: empresa.nome_fantasia || '',
        inscricao_estadual: empresa.inscricao_estadual || '',
        regime_tributario: (empresa.regime_tributario || '') as RegimeTributario | '',
        uf: empresa.uf || '',
        municipio: empresa.municipio || '',
      });
    } else {
      setEditingEmpresa(null);
      setFormData(INITIAL_FORM);
    }
    setFormErrors({});
    setCnpjInfo('');
    setModalErro('');
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setEditingEmpresa(null);
    setFormData(INITIAL_FORM);
    setFormErrors({});
    setModalErro('');
  };

  const validate = (): boolean => {
    const errors: Record<string, string> = {};
    const cnpjDigits = formData.cnpj.replace(/\D/g, '');

    if (!cnpjDigits) {
      errors.cnpj = 'CNPJ é obrigatório';
    } else if (!isValidCNPJ(cnpjDigits)) {
      errors.cnpj = 'CNPJ inválido';
    }

    if (!formData.razao_social.trim()) {
      errors.razao_social = 'Razão Social é obrigatória';
    }

    if (!formData.regime_tributario) {
      errors.regime_tributario = 'Regime Tributário é obrigatório';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSalvar = async () => {
    if (!validate()) return;

    try {
      setSaving(true);
      setModalErro('');

      const payload: Partial<Empresas> = {
        cnpj: formData.cnpj.replace(/\D/g, ''),
        razao_social: formData.razao_social.trim(),
        nome_fantasia: formData.nome_fantasia.trim() || undefined,
        inscricao_estadual: formData.inscricao_estadual.trim() || undefined,
        regime_tributario: formData.regime_tributario as RegimeTributario,
        uf: formData.uf || undefined,
        municipio: formData.municipio.trim() || undefined,
      };

      if (editingEmpresa) {
        await empresasService.atualizar(editingEmpresa.id, payload);
        setSucesso('Empresa atualizada com sucesso');
      } else {
        await empresasService.criar(payload);
        setSucesso('Empresa criada com sucesso');
      }

      handleCloseModal();
      carregarEmpresas();
    } catch (error: any) {
      logger.error('Erro ao salvar empresa:', error);
      const resData = error.response?.data;
      let msg = 'Erro ao salvar empresa';
      if (resData?.errors && Array.isArray(resData.errors)) {
        msg = resData.errors.map((e: any) => e.message || e.msg || JSON.stringify(e)).join('; ');
      } else if (resData?.error) {
        msg = resData.error;
      } else if (resData?.erro) {
        msg = resData.erro;
      } else if (resData?.message) {
        msg = resData.message;
      }
      setModalErro(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (empresa: Empresas) => {
    if (!window.confirm(`Deseja realmente excluir a empresa "${empresa.razao_social}"?`)) return;

    try {
      setErro('');
      await empresasService.excluir(empresa.id);
      setSucesso('Empresa excluída com sucesso');
      carregarEmpresas();
    } catch (error: any) {
      logger.error('Erro ao excluir empresa:', error);
      setErro(error.response?.data?.erro || 'Erro ao excluir empresa');
    }
  };

  const inputSx = { borderRadius: '10px' };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0a1628' }}>
          Gestão de Empresas
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenModal()}
          sx={{ bgcolor: '#00c8f0', '&:hover': { bgcolor: '#00b0d8' }, borderRadius: '10px' }}
        >
          Nova Empresa
        </Button>
      </Box>

      {erro && (
        <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>
          {erro}
        </Alert>
      )}
      {sucesso && (
        <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>
          {sucesso}
        </Alert>
      )}

      <Paper sx={{ p: 2, mb: 2, borderRadius: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
          <TextField
            fullWidth
            size="small"
            placeholder="Buscar por CNPJ ou Razão Social"
            value={filtroBusca}
            onChange={(e) => { setFiltroBusca(e.target.value); setPage(0); }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon sx={{ color: '#64748b' }} />
                </InputAdornment>
              ),
              sx: inputSx,
            }}
          />
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel>Regime Tributário</InputLabel>
            <Select
              value={filtroRegime}
              label="Regime Tributário"
              onChange={(e) => { setFiltroRegime(e.target.value); setPage(0); }}
              sx={inputSx}
            >
              <MenuItem value="">Todos</MenuItem>
              {REGIMES.map((r) => (
                <MenuItem key={r} value={r}>{r}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>UF</InputLabel>
            <Select
              value={filtroUF}
              label="UF"
              onChange={(e) => { setFiltroUF(e.target.value); setPage(0); }}
              sx={inputSx}
            >
              <MenuItem value="">Todas</MenuItem>
              {UF_LIST.map((uf) => (
                <MenuItem key={uf} value={uf}>{uf}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {loading ? (
        <Box display="flex" justifyContent="center" p={4}>
          <CircularProgress sx={{ color: '#00c8f0' }} />
        </Box>
      ) : (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>CNPJ</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Razão Social</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Regime</TableCell>
                <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>UF</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#64748b' }}>Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#64748b' }}>Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {empresas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ color: '#64748b', py: 4 }}>
                    Nenhuma empresa encontrada
                  </TableCell>
                </TableRow>
              ) : (
                empresas.map((emp) => (
                  <TableRow key={emp.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>
                      {formatCNPJ(emp.cnpj)}
                    </TableCell>
                    <TableCell>{emp.razao_social}</TableCell>
                    <TableCell>
                      <Chip label={emp.regime_tributario} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>{emp.uf || '—'}</TableCell>
                    <TableCell align="center">
                      <Chip
                        label={emp.ativo ? 'Ativo' : 'Inativo'}
                        size="small"
                        sx={{
                          fontWeight: 600,
                          bgcolor: emp.ativo ? '#dcfce7' : '#fee2e2',
                          color: emp.ativo ? '#16a34a' : '#dc2626',
                        }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => handleOpenModal(emp)} sx={{ color: '#00c8f0' }}>
                        <EditIcon fontSize="small" />
                      </IconButton>
                      <IconButton size="small" onClick={() => handleExcluir(emp)} sx={{ color: '#ef4444' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          <TablePagination
            component="div"
            count={totalRecords}
            page={page}
            onPageChange={(_, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
            labelRowsPerPage="Registros por página"
            labelDisplayedRows={({ from, to, count }) =>
              `${from}-${to} de ${count !== -1 ? count : `mais de ${to}`}`
            }
          />
        </TableContainer>
      )}

      <Dialog open={openModal} onClose={handleCloseModal} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: '#0a1628' }}>
          {editingEmpresa ? 'Editar Empresa' : 'Nova Empresa'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1 }}>
            {modalErro && (
              <Alert severity="error" onClose={() => setModalErro('')} sx={{ borderRadius: 2 }}>
                {modalErro}
              </Alert>
            )}
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="CNPJ"
                value={formData.cnpj}
                onChange={(e) => setFormData((p) => ({ ...p, cnpj: maskCNPJ(e.target.value) }))}
                fullWidth
                required
                disabled={!!editingEmpresa}
                error={!!formErrors.cnpj}
                helperText={formErrors.cnpj || (buscandoCNPJ ? 'Buscando dados na Receita Federal...' : '')}
                placeholder="00.000.000/0000-00"
                inputProps={{ maxLength: 18 }}
                InputProps={{
                  sx: inputSx,
                  endAdornment: buscandoCNPJ ? (
                    <InputAdornment position="end">
                      <CircularProgress size={20} sx={{ color: '#00c8f0' }} />
                    </InputAdornment>
                  ) : undefined,
                }}
              />
              <TextField
                label="Razão Social"
                value={formData.razao_social}
                onChange={(e) => setFormData((p) => ({ ...p, razao_social: e.target.value }))}
                fullWidth
                required
                error={!!formErrors.razao_social}
                helperText={formErrors.razao_social}
                InputProps={{ sx: inputSx }}
              />
            </Stack>

            {cnpjInfo && (
              <Alert severity="info" sx={{ borderRadius: 2, fontSize: '0.8rem' }}>
                {cnpjInfo}
              </Alert>
            )}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                label="Nome Fantasia"
                value={formData.nome_fantasia}
                onChange={(e) => setFormData((p) => ({ ...p, nome_fantasia: e.target.value }))}
                fullWidth
                InputProps={{ sx: inputSx }}
              />
              <TextField
                label="Inscrição Estadual"
                value={formData.inscricao_estadual}
                onChange={(e) => setFormData((p) => ({ ...p, inscricao_estadual: e.target.value }))}
                fullWidth
                helperText="Preenchimento manual (dado estadual)"
                InputProps={{ sx: inputSx }}
              />
            </Stack>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <FormControl fullWidth required error={!!formErrors.regime_tributario}>
                <InputLabel>Regime Tributário</InputLabel>
                <Select
                  value={formData.regime_tributario}
                  label="Regime Tributário"
                  onChange={(e) => setFormData((p) => ({ ...p, regime_tributario: e.target.value as RegimeTributario }))}
                  sx={inputSx}
                >
                  {REGIMES.map((r) => (
                    <MenuItem key={r} value={r}>{r}</MenuItem>
                  ))}
                </Select>
                {formErrors.regime_tributario && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.5 }}>
                    {formErrors.regime_tributario}
                  </Typography>
                )}
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>UF</InputLabel>
                <Select
                  value={formData.uf}
                  label="UF"
                  onChange={(e) => setFormData((p) => ({ ...p, uf: e.target.value }))}
                  sx={inputSx}
                >
                  <MenuItem value="">Selecione</MenuItem>
                  {UF_LIST.map((uf) => (
                    <MenuItem key={uf} value={uf}>{uf}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <TextField
                label="Município"
                value={formData.municipio}
                onChange={(e) => setFormData((p) => ({ ...p, municipio: e.target.value }))}
                fullWidth
                InputProps={{ sx: inputSx }}
              />
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCloseModal} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="contained"
            onClick={handleSalvar}
            disabled={saving}
            sx={{ bgcolor: '#00c8f0', '&:hover': { bgcolor: '#00b0d8' }, borderRadius: '10px' }}
          >
            {saving ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : editingEmpresa ? 'Atualizar' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default EmpresasPage;
