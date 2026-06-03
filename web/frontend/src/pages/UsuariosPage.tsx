import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  Alert,
  CircularProgress,
  Stack,
  InputAdornment,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Switch,
  TablePagination,
  Chip,
  Checkbox,
  Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  LockOpen as UnlockIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as UncheckedIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ptBR } from 'date-fns/locale';
import { usuariosService } from '../services/usuariosService';
import { perfisService } from '../services/perfisService';
import { logger } from '../utils/logger';
import { type Usuario, type Perfil } from '../types';
import { formatDisplay } from '../utils/dateHelpers';

// Tokens Synchro
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

const STATUS_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  Ativo: { bg: 'rgba(102,187,106,0.12)', color: '#388E3C', label: 'Ativo' },
  Inativo: { bg: 'rgba(158,158,158,0.12)', color: '#616161', label: 'Inativo' },
  Bloqueado: { bg: 'rgba(239,83,80,0.12)', color: '#C62828', label: 'Bloqueado' },
};

// ─── Component ───────────────────────────────────────────────────────────────

const UsuariosPage: React.FC = () => {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(false);
  const [openModal, setOpenModal] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [filtroDataCriacaoInicio, setFiltroDataCriacaoInicio] = useState<Date | null>(null);
  const [filtroDataCriacaoFim, setFiltroDataCriacaoFim] = useState<Date | null>(null);
  const [filtroBusca, setFiltroBusca] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  // Perfis
  const [perfisDisponiveis, setPerfisDisponiveis] = useState<Perfil[]>([]);
  const [perfilIds, setPerfilIds] = useState<number[]>([]);
  const [perfisLoading, setPerfisLoading] = useState(false);

  const [formData, setFormData] = useState({
    nome: '',
    email: '',
    cpf: '',
    senha: '',
    confirmarSenha: '',
    dt_nascimento: '',
    status: false,
    cliente_id: 0,
  });

  const requisitos = [
    { id: 'length', label: 'Mínimo 8 caracteres', test: (s: string) => s.length >= 8 },
    { id: 'lowercase', label: 'Pelo menos 1 letra minúscula', test: (s: string) => /[a-z]/.test(s) },
    { id: 'uppercase', label: 'Pelo menos 1 letra maiúscula', test: (s: string) => /[A-Z]/.test(s) },
    { id: 'special', label: 'Pelo menos 1 caractere especial', test: (s: string) => /[\W_]/.test(s) },
  ];

  // ─── Data loaders ──────────────────────────────────────────────────────────

  const carregarUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const filtros: Record<string, string | number> = {};
      if (filtroDataCriacaoInicio)
        filtros.data_criacao_inicio = filtroDataCriacaoInicio.toISOString().split('T')[0];

      if (filtroDataCriacaoFim)
        filtros.data_criacao_fim = filtroDataCriacaoFim.toISOString().split('T')[0];

      if (filtroBusca.trim())
        filtros.busca = filtroBusca.trim();

      filtros.page = page + 1;
      filtros.limit = rowsPerPage;
      const response = await usuariosService.listar(filtros);

      setUsuarios(response.data);
      setTotalRecords(response.totalRecords);
    } catch (error: any) {
      logger.error('Erro ao carregar usuários:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar usuários');
    } finally { setLoading(false); }
  }, [filtroDataCriacaoInicio, filtroDataCriacaoFim, filtroBusca, page, rowsPerPage]);

  useEffect(() => { carregarUsuarios(); }, [carregarUsuarios]);

  useEffect(() => {
    perfisService.listar({ limit: 200 })
      .then(res => setPerfisDisponiveis(res.data))
      .catch(err => logger.error('Erro ao carregar perfis:', err));
  }, []);

  // ─── Modal ─────────────────────────────────────────────────────────────────

  const handleOpenModal = async (usuario?: Usuario) => {
    setPerfilIds([]);
    if (usuario) {
      setEditingUsuario(usuario);

      let dataNascimento = '';
      if (usuario.dt_nascimento) {
        if (/^\d{4}-\d{2}-\d{2}/.test(usuario.dt_nascimento)) {
          dataNascimento = usuario.dt_nascimento.substring(0, 10);
        } else {
          const match = usuario.dt_nascimento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) dataNascimento = `${match[3]}-${match[2]}-${match[1]}`;
        }
      }

      setFormData({
        nome: usuario.nome,
        email: usuario.email,
        cpf: usuario.cpf,
        senha: '',
        confirmarSenha: '',
        dt_nascimento: dataNascimento,
        status: usuario.status,
        cliente_id: usuario.cliente_id || 0,
      });

      // Carregar perfis do usuário
      setPerfisLoading(true);
      try {
        const perfisUsuario = await usuariosService.buscarPerfisDoUsuario(usuario.id);
        setPerfilIds(perfisUsuario.map(p => p.perfil_id));
      } catch (err) {
        logger.error('Erro ao carregar perfis do usuário:', err);
      } finally {
        setPerfisLoading(false);
      }
    }
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setEditingUsuario(null);
    setPerfilIds([]);
  };

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleInputChange = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const formatarCPF = (cpf: string | null | undefined) => {
    if (!cpf) return '';
    return cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };


  const handleSalvar = async () => {
    try {
      if (!formData.nome || !formData.email || !formData.cpf) {
        setErro('Preencha todos os campos obrigatórios'); return;
      }
      if (!editingUsuario && !formData.senha) {
        setErro('Senha é obrigatória para novo usuário'); return;
      }
      if (formData.senha) {
        if (formData.senha !== formData.confirmarSenha) { setErro('A senha e a confirmação não coincidem'); return; }
        if (formData.senha.length < 8) { setErro('A senha deve ter no mínimo 8 caracteres'); return; }
        if (!/[a-z]/.test(formData.senha)) { setErro('A senha deve conter pelo menos 1 letra minúscula'); return; }
        if (!/[A-Z]/.test(formData.senha)) { setErro('A senha deve conter pelo menos 1 letra maiúscula'); return; }
        if (!/[\W_]/.test(formData.senha)) { setErro('A senha deve conter pelo menos 1 caractere especial'); return; }
      }

      const dados: any = {
        nome: formData.nome,
        email: formData.email,
        cpf: formData.cpf.replace(/\D/g, ''),
        dt_nascimento: formData.dt_nascimento || null,
        cliente_id: formData.cliente_id || 0,
      };
      if (editingUsuario)
        dados.status = formData.status;
      if (formData.senha)
        dados.senha = formData.senha;

      if (editingUsuario) {
        await usuariosService.atualizar(editingUsuario.id, dados);
        await usuariosService.sincronizarPerfisDoUsuario(editingUsuario.id, perfilIds);
        setSucesso('Usuário atualizado com sucesso');
      } else {
        const criado = await usuariosService.criar(dados);
        if (perfilIds.length > 0) {
          await usuariosService.sincronizarPerfisDoUsuario(criado.id, perfilIds);
        }
        setSucesso('Usuário criado com sucesso');
      }

      handleCloseModal();
      carregarUsuarios();
    } catch (error: any) {
      if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
        setErro(error.response.data.errors.map((e: any) => `${e.path?.join('.')}: ${e.message}`).join(', '));
      } else {
        logger.error('Erro ao salvar usuário:', error);
        setErro(error.response?.data?.message || 'Erro ao salvar usuário');
      }
    }
  };

  const handleToggleStatus = async (id: number, nome: string, statusAtual: boolean) => {
    const novoStatus = !statusAtual;
    const acao = novoStatus ? 'ativar' : 'desativar';
    if (!window.confirm(`Deseja realmente ${acao} o usuário ${nome}?`))
      return;
    try {
      const dados: any = { status: novoStatus };
      if (novoStatus)
        dados.dt_inativacao = null;

      await usuariosService.atualizar(id, dados);

      setSucesso(`Usuário ${acao === 'desativar' ? 'desativado' : 'ativado'} com sucesso`);
      carregarUsuarios();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error: any) {
      logger.error(`Erro ao ${acao} usuário:`, error);
      setErro(error.response?.data?.message || `Erro ao ${acao} usuário`);
    }
  };

  const handleDesbloquear = async (id: number, nome: string) => {
    if (!window.confirm(`Deseja desbloquear o usuário ${nome}?`))
      return;
    try {
      await usuariosService.desbloquear(id);
      setSucesso('Usuário desbloqueado com sucesso');
      carregarUsuarios();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error: any) {
      logger.error('Erro ao desbloquear usuário:', error);
      setErro(error.response?.data?.message || 'Erro ao desbloquear usuário');
    }
  };

  const abrirModalNovo = () => {
    setFormData({ nome: '', email: '', cpf: '', senha: '', confirmarSenha: '', dt_nascimento: '', status: true, cliente_id: 0 });
    setEditingUsuario(null);
    setPerfilIds([]);
    setOpenModal(true);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={ptBR}>
      <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
              Cadastro de Usuários
            </Typography>
            <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
              Gerencie os usuários e seus acessos
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={abrirModalNovo} sx={btnPrimary}>
            Novo Usuário
          </Button>
        </Box>

        {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2, borderRadius: '10px' }}>{erro}</Alert>}
        {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2, borderRadius: '10px' }}>{sucesso}</Alert>}

        {/* Filtros */}
        <Paper elevation={0} sx={{ p: 2.5, mb: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <Box sx={{ flex: 1 }}>
              <DatePicker
                label="Criação — Início"
                value={filtroDataCriacaoInicio}
                onChange={setFiltroDataCriacaoInicio}
                slotProps={{ textField: { fullWidth: true, size: 'small', sx: inputSx } }}
              />
            </Box>
            <Box sx={{ flex: 1 }}>
              <DatePicker
                label="Criação — Fim"
                value={filtroDataCriacaoFim}
                onChange={setFiltroDataCriacaoFim}
                slotProps={{ textField: { fullWidth: true, size: 'small', sx: inputSx } }}
              />
            </Box>
            <Box sx={{ flex: 2 }}>
              <TextField
                fullWidth size="small"
                placeholder="Buscar por nome, email ou CPF"
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
          </Stack>
        </Paper>

        {/* Table */}
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
                    <TableCell align="center" sx={thCellSx}>Nome</TableCell>
                    <TableCell align="center" sx={thCellSx}>Email</TableCell>
                    <TableCell align="center" sx={thCellSx}>CPF</TableCell>
                    <TableCell align="center" sx={thCellSx}>Cliente</TableCell>
                    <TableCell sx={thCellSx}>Status</TableCell>
                    <TableCell align="center" sx={thCellSx}>Data Bloqueio</TableCell>
                    <TableCell align="center" sx={thCellSx}>Último Login</TableCell>
                    <TableCell align="center" sx={thCellSx}>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 4, color: T.textSecond, fontSize: '0.875rem' }}>
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : usuarios.map((usuario) => {
                    const sc = STATUS_CHIP[usuario.status ? 'Ativo' : 'Inativo'] || STATUS_CHIP['Inativo'];
                    return (
                      <TableRow key={usuario.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                        <TableCell align="center" sx={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}>{usuario.nome}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{usuario.email}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: T.textSecond }}>{formatarCPF(usuario.cpf)}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{usuario.cliente_id || 'N/A'}</TableCell>
                        <TableCell align="center">
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Switch
                              checked={usuario.status}
                              onChange={() => handleToggleStatus(usuario.id, usuario.nome, usuario.status)}
                              size="small"
                              sx={{
                                '& .MuiSwitch-switchBase.Mui-checked': { color: T.cyan },
                                '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.cyan },
                              }}
                            />
                            <Chip
                              label={sc.label}
                              size="small"
                              sx={{ fontSize: '0.6875rem', fontWeight: 600, height: 20, backgroundColor: sc.bg, color: sc.color, border: `1px solid ${sc.color}22` }}
                            />
                          </Box>
                        </TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{formatDisplay(usuario.dt_bloqueio) || '-'}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{formatDisplay(usuario.ultimo_login) || 'Nunca'}</TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenModal(usuario)}
                            sx={{ color: T.textSecond, '&:hover': { color: T.cyan, backgroundColor: 'rgba(0,200,240,0.08)' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          {usuario.dt_bloqueio && (
                            <IconButton
                              size="small"
                              onClick={() => handleDesbloquear(usuario.id, usuario.nome)}
                              sx={{ color: T.textSecond, '&:hover': { color: '#66BB6A', backgroundColor: 'rgba(102,187,106,0.08)' } }}
                            >
                              <UnlockIcon fontSize="small" />
                            </IconButton>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
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
              labelDisplayedRows={({ from, to, count }) =>
                `${from}–${to} de ${count !== -1 ? count : `mais de ${to}`}`
              }
              sx={{ borderTop: `1px solid ${T.border}`, '& .MuiTablePagination-toolbar': { px: 2 } }}
            />
          </Paper>
        )}

        {/* Modal */}
        <Dialog
          open={openModal}
          onClose={handleCloseModal}
          maxWidth="lg"
          fullWidth
          scroll="paper"
          slotProps={{ paper: { sx: dialogPaper } }}
        >
          <DialogTitle sx={{ fontSize: '1.0625rem', fontWeight: 700, color: T.textPrimary, pb: 0 }}>
            {editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}
          </DialogTitle>
          <DialogContent sx={{ pt: 0 }}>
            {erro && (
              <Alert severity="error" onClose={() => setErro('')} sx={{ mt: 2, mb: 1, borderRadius: '10px' }}>{erro}</Alert>
            )}
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 4, mb: 5 }}>
              <TextField label="Nome Completo" value={formData.nome} onChange={(e) => handleInputChange('nome', e.target.value)} fullWidth required sx={inputSx} />
              <TextField label="Email" type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} fullWidth required sx={inputSx} />
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField label="CPF" value={formData.cpf} onChange={(e) => handleInputChange('cpf', e.target.value)} fullWidth required placeholder="000.000.000-00" sx={inputSx} />
                <TextField
                  label="Data de Nascimento" type="date"
                  value={formData.dt_nascimento}
                  onChange={(e) => handleInputChange('dt_nascimento', e.target.value)}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={inputSx}
                />
              </Stack>
              {editingUsuario && (
                <FormControl fullWidth sx={inputSx}>
                  <InputLabel>Status</InputLabel>
                  <Select
                    value={formData.status ? 'Ativo' : 'Inativo'}
                    onChange={(e) => setFormData(prev => ({ ...prev, status: e.target.value === 'Ativo' }))}
                    label="Status"
                  >
                    <MenuItem value="Ativo">Ativo</MenuItem>
                    <MenuItem value="Inativo">Inativo</MenuItem>
                  </Select>
                </FormControl>
              )}
              <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                <TextField
                  type="password"
                  label={editingUsuario ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha'}
                  value={formData.senha}
                  onChange={(e) => handleInputChange('senha', e.target.value)}
                  fullWidth required={!editingUsuario} sx={inputSx}
                />
                <TextField
                  type="password"
                  label={editingUsuario ? 'Confirmar Nova Senha' : 'Confirmar Senha'}
                  value={formData.confirmarSenha}
                  onChange={(e) => handleInputChange('confirmarSenha', e.target.value)}
                  fullWidth required={!editingUsuario} sx={inputSx}
                />
              </Stack>


              {formData.senha && (
                <Box sx={{ p: 2, borderRadius: '10px', border: `1px solid ${T.border}`, backgroundColor: '#F8FAFC' }}>
                  <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, mb: 1, fontWeight: 600 }}>
                    Requisitos da senha
                  </Typography>
                  <List dense disablePadding>
                    {requisitos.map((req) => {
                      const ok = req.test(formData.senha);
                      return (
                        <ListItem key={req.id} disablePadding sx={{ py: 0.375 }}>
                          <ListItemIcon sx={{ minWidth: 28 }}>
                            {ok
                              ? <CheckCircleIcon sx={{ fontSize: 16, color: '#66BB6A' }} />
                              : <UncheckedIcon sx={{ fontSize: 16, color: T.textSecond }} />
                            }
                          </ListItemIcon>
                          <ListItemText
                            primary={req.label}
                            slotProps={{ primary: { style: { fontSize: '0.8125rem', color: ok ? T.textPrimary : T.textSecond } } }}
                          />
                        </ListItem>
                      );
                    })}
                  </List>
                </Box>
              )}

              {/* Perfis de Acesso */}
              <Divider sx={{ my: 0.5 }} />
              <Box>
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 700, color: T.textPrimary, mb: 1.5 }}>
                  Perfis de Acesso
                </Typography>
                {perfisLoading ? (
                  <Box sx={{ display: 'flex', justifyContent: 'center', py: 2 }}>
                    <CircularProgress size={24} sx={{ color: T.cyan }} />
                  </Box>
                ) : perfisDisponiveis.length === 0 ? (
                  <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond }}>Nenhum perfil cadastrado</Typography>
                ) : (
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 0.5 }}>
                    {perfisDisponiveis.map((perfil) => {
                      const selecionado = perfilIds.includes(perfil.id);
                      return (
                        <Box
                          key={perfil.id}
                          onClick={() => setPerfilIds(prev =>
                            selecionado ? prev.filter(id => id !== perfil.id) : [...prev, perfil.id]
                          )}
                          sx={{
                            display: 'flex', alignItems: 'center', gap: 1,
                            px: 1.5, py: 0.75, borderRadius: '8px', cursor: 'pointer',
                            border: `1px solid ${selecionado ? T.cyan : T.border}`,
                            backgroundColor: selecionado ? T.cyanDim : T.surface,
                            transition: 'all 0.15s',
                            '&:hover': { borderColor: T.cyan, backgroundColor: T.cyanDim },
                          }}
                        >
                          <Checkbox
                            size="small"
                            checked={selecionado}
                            onChange={() => {}}
                            sx={{ p: 0, '&.Mui-checked': { color: T.cyan } }}
                          />
                          <Typography sx={{ fontSize: '0.8125rem', fontWeight: selecionado ? 600 : 400, color: selecionado ? T.textPrimary : T.textSecond }}>
                            {perfil.perfil}
                          </Typography>
                        </Box>
                      );
                    })}
                  </Box>
                )}
              </Box>
            </Box>


            {/* Footer */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1.5, mt: 3, pt: 2.5, borderTop: `1px solid ${T.border}` }}>
              <Button onClick={handleCloseModal} variant="outlined" sx={btnOutlined}>Cancelar</Button>
              <Button onClick={handleSalvar} variant="contained" sx={btnPrimary}>
                {editingUsuario ? 'Atualizar' : 'Salvar'}
              </Button>
            </Box>
          </DialogContent>
        </Dialog>
      </Box>
    </LocalizationProvider>
  );
};

export default UsuariosPage;
