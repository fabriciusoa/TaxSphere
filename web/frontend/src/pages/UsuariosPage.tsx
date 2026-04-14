import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, TextField, IconButton, Dialog,
  DialogTitle, DialogContent, Tabs, Tab, Alert, CircularProgress,
  Stack, InputAdornment, FormControl, InputLabel, Select, MenuItem,
  List, ListItem, ListItemIcon, ListItemText, Switch, TablePagination, Chip,
} from '@mui/material';
import {
  Add as AddIcon, Edit as EditIcon, LockOpen as UnlockIcon,
  CheckCircle as CheckCircleIcon, RadioButtonUnchecked as UncheckedIcon,
  Search as SearchIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { ptBR } from 'date-fns/locale';
import { usuariosService } from '../services/usuariosService';
import { perfisService } from '../services/perfisService';
import usuarioParametrosService from '../services/usuarioParametrosService';
import perfilService from '../services/perfilService';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:       '#00c8f0',
  cyanGlow:   '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:  '0 6px 22px rgba(0,200,240,0.38)',
  cyanDim:    'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
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

const tabsSx = {
  '& .MuiTab-root': { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none', color: T.textSecond, minHeight: 44 },
  '& .MuiTab-root.Mui-selected': { color: T.cyan },
  '& .MuiTabs-indicator': { backgroundColor: T.cyan },
};

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface Usuario {
  id: number; nome: string; email: string; cpf: string;
  perfil: string; perfil_id: number; status: string;
  criado?: string | null; dt_inativacao?: string | null;
  dt_nascimento?: string | null; dt_ativacao?: string | null;
  ultimo_login?: string | null; tentativas_login?: number; dt_bloqueio?: string | null;
}

interface Perfil { id: number; perfil: string; }

interface DadosMedico {
  especialidade?: number; inscricao: string; tempo_sessao?: number;
  endereco: string; numero?: number; complemento: string;
  bairro: string; cidade: string; uf: string; cep: string;
  nacionalidade: string; estado_civil: string; telefone: string;
  logo?: string; assinatura?: string;
}

interface TabPanelProps { children?: React.ReactNode; index: number; value: number; }

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 2.5 }}>{children}</Box>}
    </div>
  );
}

const STATUS_CHIP: Record<string, { bg: string; color: string; label: string }> = {
  Ativo:     { bg: 'rgba(102,187,106,0.12)', color: '#388E3C', label: 'Ativo'     },
  Inativo:   { bg: 'rgba(158,158,158,0.12)', color: '#616161', label: 'Inativo'   },
  Bloqueado: { bg: 'rgba(239,83,80,0.12)',   color: '#C62828', label: 'Bloqueado' },
};

const EMPTY_MEDICO: DadosMedico = {
  especialidade: undefined, inscricao: '', tempo_sessao: undefined,
  endereco: '', numero: undefined, complemento: '', bairro: '',
  cidade: '', uf: '', cep: '', nacionalidade: '', estado_civil: '',
  telefone: '', logo: '', assinatura: '',
};

const EMPTY_PARAMS = {
  duracao_sessao: 50, tempo_entre_sessao: 10,
  enviar_email: true, enviar_whats: false, tempo_lembrete: 24,
  permite_paciente_remarcar: true, tempo_remarcacao: 24,
  permite_paciente_cancelar: true, tempo_cancelamento: 24,
};

// ─── Component ───────────────────────────────────────────────────────────────

const UsuariosPage: React.FC = () => {
  const [usuarios, setUsuarios]         = useState<Usuario[]>([]);
  const [perfis, setPerfis]             = useState<Perfil[]>([]);
  const [loading, setLoading]           = useState(false);
  const [openModal, setOpenModal]       = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
  const [tabValue, setTabValue]         = useState(0);
  const [erro, setErro]                 = useState('');
  const [sucesso, setSucesso]           = useState('');
  const [loadingPerfis, setLoadingPerfis] = useState(true);
  const [buscandoCEP, setBuscandoCEP]   = useState(false);

  const [filtroDataCriacaoInicio, setFiltroDataCriacaoInicio] = useState<Date | null>(null);
  const [filtroDataCriacaoFim, setFiltroDataCriacaoFim]       = useState<Date | null>(null);
  const [filtroBusca, setFiltroBusca]   = useState('');
  const [page, setPage]                 = useState(0);
  const [rowsPerPage, setRowsPerPage]   = useState(10);
  const [totalRecords, setTotalRecords] = useState(0);

  const [formData, setFormData] = useState({
    nome: '', email: '', cpf: '', senha: '', confirmarSenha: '',
    perfil: '', dt_nascimento: '', status: 'Ativo',
  });

  const [dadosMedico, setDadosMedico] = useState<DadosMedico>(EMPTY_MEDICO);

  const [parametros, setParametros] = useState(EMPTY_PARAMS);

  const requisitos = [
    { id: 'length',    label: 'Mínimo 8 caracteres',             test: (s: string) => s.length >= 8 },
    { id: 'lowercase', label: 'Pelo menos 1 letra minúscula',    test: (s: string) => /[a-z]/.test(s) },
    { id: 'uppercase', label: 'Pelo menos 1 letra maiúscula',    test: (s: string) => /[A-Z]/.test(s) },
    { id: 'special',   label: 'Pelo menos 1 caractere especial', test: (s: string) => /[\W_]/.test(s) },
  ];

  const ehMedico = editingUsuario?.perfil === 'MEDICO' || editingUsuario?.perfil === 'ADMIN';

  // ─── Data loaders ──────────────────────────────────────────────────────────

  const carregarPerfis = useCallback(async () => {
    try {
      setLoadingPerfis(true);
      setPerfis(await perfisService.listar());
    } catch (error: any) {
      logger.error('Erro ao carregar perfis:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar perfis');
    } finally { setLoadingPerfis(false); }
  }, []);

  const carregarUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const filtros: Record<string, string | number> = {};
      if (filtroDataCriacaoInicio) filtros.data_criacao_inicio = filtroDataCriacaoInicio.toISOString().split('T')[0];
      if (filtroDataCriacaoFim)   filtros.data_criacao_fim    = filtroDataCriacaoFim.toISOString().split('T')[0];
      if (filtroBusca.trim())     filtros.busca               = filtroBusca.trim();
      filtros.page  = page + 1;
      filtros.limit = rowsPerPage;
      const response = await usuariosService.listar(filtros);
      setUsuarios(response.data);
      setTotalRecords(response.totalRecords);
    } catch (error: any) {
      logger.error('Erro ao carregar usuários:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar usuários');
    } finally { setLoading(false); }
  }, [filtroDataCriacaoInicio, filtroDataCriacaoFim, filtroBusca, page, rowsPerPage]);

  useEffect(() => { carregarPerfis(); }, [carregarPerfis]);
  useEffect(() => { carregarUsuarios(); }, [carregarUsuarios]);

  // ─── Modal ─────────────────────────────────────────────────────────────────

  const handleOpenModal = async (usuario?: Usuario) => {
    if (usuario) {
      setEditingUsuario(usuario);

      let dataNascimento = '';
      if (usuario.dt_nascimento) {
        if (/^\d{4}-\d{2}-\d{2}/.test(usuario.dt_nascimento)) {
          dataNascimento = usuario.dt_nascimento.split(' ')[0];
        } else {
          const match = usuario.dt_nascimento.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (match) dataNascimento = `${match[3]}-${match[2]}-${match[1]}`;
        }
      }

      setFormData({
        nome: usuario.nome, email: usuario.email, cpf: usuario.cpf,
        senha: '', confirmarSenha: '',
        perfil: usuario.perfil_id?.toString() || '',
        dt_nascimento: dataNascimento, status: usuario.status,
      });

      if (usuario.perfil === 'MEDICO' || usuario.perfil === 'ADMIN') {
        try {
          const dadosPerfil = await perfilService.buscarPerfilUsuario(usuario.id);
          if (dadosPerfil.dados_medico) {
            setDadosMedico({
              especialidade: dadosPerfil.dados_medico.especialidade != null && !isNaN(Number(dadosPerfil.dados_medico.especialidade))
                ? Number(dadosPerfil.dados_medico.especialidade) : undefined,
              inscricao:     dadosPerfil.dados_medico.inscricao     || '',
              tempo_sessao:  dadosPerfil.dados_medico.tempo_sessao  || undefined,
              endereco:      dadosPerfil.dados_medico.endereco      || '',
              numero:        dadosPerfil.dados_medico.numero,
              complemento:   dadosPerfil.dados_medico.complemento   || '',
              bairro:        dadosPerfil.dados_medico.bairro        || '',
              cidade:        dadosPerfil.dados_medico.cidade        || '',
              uf:            dadosPerfil.dados_medico.uf            || '',
              cep:           dadosPerfil.dados_medico.cep           || '',
              nacionalidade: dadosPerfil.dados_medico.nacionalidade || '',
              estado_civil:  dadosPerfil.dados_medico.estado_civil  || '',
              telefone:      dadosPerfil.dados_medico.telefone      || '',
              logo:          dadosPerfil.dados_medico.logo          || '',
              assinatura:    dadosPerfil.dados_medico.assinatura    || '',
            });
          }
          try {
            const params = await usuarioParametrosService.buscarPorUsuario(usuario.id);
            if (params) {
              setParametros({
                duracao_sessao:           params.duracao_sessao           || 50,
                tempo_entre_sessao:       params.tempo_entre_sessao       || 10,
                enviar_email:             params.enviar_email             !== false,
                enviar_whats:             params.enviar_whats             || false,
                tempo_lembrete:           params.tempo_lembrete           || 24,
                permite_paciente_remarcar:params.permite_paciente_remarcar !== false,
                tempo_remarcacao:         params.tempo_remarcacao         || 24,
                permite_paciente_cancelar:params.permite_paciente_cancelar !== false,
                tempo_cancelamento:       params.tempo_cancelamento       || 24,
              });
            }
          } catch (error: any) {
            logger.error('Erro ao carregar parâmetros:', error);
            if (error.response?.status !== 404) {
              setErro(error.response?.data?.erro || error.response?.data?.error || 'Erro ao carregar parâmetros');
            }
          }
        } catch (error: any) {
          logger.error('Erro ao carregar dados profissionais:', error);
          setErro(error.response?.data?.erro || error.response?.data?.error || 'Erro ao carregar dados profissionais');
        }
      }
    }
    setTabValue(0);
    setOpenModal(true);
  };

  const handleCloseModal = () => {
    setOpenModal(false);
    setEditingUsuario(null);
    setDadosMedico(EMPTY_MEDICO);
    setParametros(EMPTY_PARAMS);
  };

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleInputChange = (field: string, value: string) =>
    setFormData(prev => ({ ...prev, [field]: value }));

  const handleMedicoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'especialidade') {
      setDadosMedico(prev => ({ ...prev, especialidade: value ? Number(value) : undefined }));
    } else if (name === 'tempo_sessao') {
      setDadosMedico(prev => ({ ...prev, tempo_sessao: value ? Number(value) : undefined }));
    } else {
      setDadosMedico(prev => ({ ...prev, [name]: value }));
    }
  };

  const formatarCEP = (v: string) => {
    const n = v.replace(/\D/g, '');
    return n.length <= 5 ? n : `${n.slice(0, 5)}-${n.slice(5, 8)}`;
  };

  const formatarTelefone = (v: string) => {
    const n = v.replace(/\D/g, '');
    return n.length <= 10
      ? n.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3')
      : n.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  };

  const formatarCPF = (cpf: string) =>
    cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');

  const buscarCEP = async (cep: string) => {
    const cepLimpo = cep.replace(/\D/g, '');
    if (cepLimpo.length !== 8) return;
    try {
      setBuscandoCEP(true);
      const response = await fetch(`https://viacep.com.br/ws/${cepLimpo}/json/`);
      const data = await response.json();
      if (data.erro) { setErro('CEP não encontrado'); return; }
      setDadosMedico(prev => ({
        ...prev,
        endereco: data.logradouro || '',
        bairro:   data.bairro     || '',
        cidade:   data.localidade || '',
        uf:       data.uf         || '',
      }));
    } catch (error: any) {
      logger.error('Erro ao buscar CEP:', error);
      setErro('Erro ao buscar CEP');
    } finally { setBuscandoCEP(false); }
  };

  const handleSalvar = async () => {
    try {
      if (!formData.nome || !formData.email || !formData.cpf || !formData.perfil) {
        setErro('Preencha todos os campos obrigatórios'); return;
      }
      if (!editingUsuario && !formData.senha) {
        setErro('Senha é obrigatória para novo usuário'); return;
      }
      if (formData.senha) {
        if (formData.senha !== formData.confirmarSenha) { setErro('A senha e a confirmação não coincidem'); return; }
        if (formData.senha.length < 8)                 { setErro('A senha deve ter no mínimo 8 caracteres'); return; }
        if (!/[a-z]/.test(formData.senha))             { setErro('A senha deve conter pelo menos 1 letra minúscula'); return; }
        if (!/[A-Z]/.test(formData.senha))             { setErro('A senha deve conter pelo menos 1 letra maiúscula'); return; }
        if (!/[\W_]/.test(formData.senha))             { setErro('A senha deve conter pelo menos 1 caractere especial'); return; }
      }

      const dados: any = {
        nome: formData.nome, email: formData.email,
        cpf: formData.cpf.replace(/\D/g, ''),
        perfil_id: parseInt(formData.perfil),
        dt_nascimento: formData.dt_nascimento || null,
      };
      if (editingUsuario) dados.status = formData.status;
      if (formData.senha) dados.senha  = formData.senha;
      if (ehMedico) {
        dados.dados_medico = { ...dadosMedico, numero: dadosMedico.numero ? Number(dadosMedico.numero) : undefined };
      }

      if (editingUsuario) {
        await usuariosService.atualizar(editingUsuario.id, dados);
        if (ehMedico) {
          try {
            await usuarioParametrosService.atualizarPorUsuario(editingUsuario.id, { ...parametros });
          } catch (error: any) {
            logger.error('Erro ao atualizar parâmetros:', error);
            if (error.response?.status === 404) {
              try {
                await usuarioParametrosService.criarParaUsuario(editingUsuario.id, { ...parametros } as any);
              } catch (criarError: any) {
                logger.error('Erro ao criar parâmetros:', criarError);
                setErro(criarError.response?.data?.erro || 'Erro ao criar parâmetros');
              }
            }
          }
        }
        setSucesso('Usuário atualizado com sucesso');
      } else {
        await usuariosService.criar(dados);
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

  const handleToggleStatus = async (id: number, nome: string, statusAtual: string) => {
    const novoStatus = statusAtual === 'Ativo' ? 'Inativo' : 'Ativo';
    const acao = novoStatus === 'Inativo' ? 'desativar' : 'ativar';
    if (!window.confirm(`Deseja realmente ${acao} o usuário ${nome}?`)) return;
    try {
      const dados: any = { status: novoStatus };
      if (novoStatus === 'Ativo') dados.dt_inativacao = null;
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
    if (!window.confirm(`Deseja desbloquear o usuário ${nome}?`)) return;
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
    setFormData({ nome: '', email: '', cpf: '', senha: '', confirmarSenha: '', perfil: '', dt_nascimento: '', status: 'Ativo' });
    setEditingUsuario(null);
    setTabValue(0);
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

        {erro   && <Alert severity="error"   onClose={() => setErro('')}    sx={{ mb: 2, borderRadius: '10px' }}>{erro}</Alert>}
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
                    {['Nome', 'Email', 'CPF', 'Perfil', 'Status', 'Último Login'].map(h => (
                      <TableCell key={h} sx={thCellSx}>{h}</TableCell>
                    ))}
                    <TableCell align="center" sx={thCellSx}>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {usuarios.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: T.textSecond, fontSize: '0.875rem' }}>
                        Nenhum usuário encontrado
                      </TableCell>
                    </TableRow>
                  ) : usuarios.map((usuario) => {
                    const sc = STATUS_CHIP[usuario.status] || STATUS_CHIP['Inativo'];
                    return (
                      <TableRow key={usuario.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                        <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}>{usuario.nome}</TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{usuario.email}</TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: T.textSecond }}>{formatarCPF(usuario.cpf)}</TableCell>
                        <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{usuario.perfil}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Switch
                              checked={usuario.status === 'Ativo'}
                              onChange={() => handleToggleStatus(usuario.id, usuario.nome, usuario.status)}
                              disabled={usuario.status === 'Bloqueado'}
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
                        <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{usuario.ultimo_login || 'Nunca'}</TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={() => handleOpenModal(usuario)}
                            sx={{ color: T.textSecond, '&:hover': { color: T.cyan, backgroundColor: 'rgba(0,200,240,0.08)' } }}
                          >
                            <EditIcon fontSize="small" />
                          </IconButton>
                          {usuario.status === 'Bloqueado' && (
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

            {/* Tabs */}
            <Box sx={{ borderBottom: `1px solid ${T.border}` }}>
              <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)} sx={tabsSx}>
                <Tab label="Dados Pessoais" />
                <Tab label="Acesso" />
                {ehMedico && <Tab label="Dados Profissionais" />}
                {ehMedico && <Tab label="Endereço" />}
              </Tabs>
            </Box>

            {/* Tab 0 — Dados Pessoais */}
            <TabPanel value={tabValue} index={0}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Nome Completo"   value={formData.nome}  onChange={(e) => handleInputChange('nome', e.target.value)}  fullWidth required sx={inputSx} />
                <TextField label="Email" type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} fullWidth required sx={inputSx} />
                <TextField label="CPF" value={formData.cpf} onChange={(e) => handleInputChange('cpf', e.target.value)} fullWidth required placeholder="000.000.000-00" sx={inputSx} />
                <FormControl fullWidth required sx={inputSx}>
                  <InputLabel>Perfil</InputLabel>
                  <Select value={formData.perfil} onChange={(e) => handleInputChange('perfil', e.target.value)} label="Perfil" disabled={loadingPerfis}>
                    {perfis.map((p) => <MenuItem key={p.id} value={p.id}>{p.perfil}</MenuItem>)}
                  </Select>
                </FormControl>
                <TextField
                  label="Data de Nascimento" type="date"
                  value={formData.dt_nascimento}
                  onChange={(e) => handleInputChange('dt_nascimento', e.target.value)}
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  sx={inputSx}
                />
                {editingUsuario && (
                  <FormControl fullWidth sx={inputSx}>
                    <InputLabel>Status</InputLabel>
                    <Select value={formData.status} onChange={(e) => handleInputChange('status', e.target.value)} label="Status">
                      <MenuItem value="Ativo">Ativo</MenuItem>
                      <MenuItem value="Inativo">Inativo</MenuItem>
                    </Select>
                  </FormControl>
                )}
              </Box>
            </TabPanel>

            {/* Tab 1 — Acesso */}
            <TabPanel value={tabValue} index={1}>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                                : <UncheckedIcon   sx={{ fontSize: 16, color: T.textSecond }} />
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
              </Box>
            </TabPanel>

            {/* Tab 2 — Dados Profissionais */}
            {ehMedico && (
              <TabPanel value={tabValue} index={2}>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField fullWidth label="Nacionalidade" name="nacionalidade" value={dadosMedico.nacionalidade} onChange={handleMedicoChange} sx={inputSx} />
                    <TextField fullWidth select label="Estado Civil" name="estado_civil" value={dadosMedico.estado_civil} onChange={handleMedicoChange} sx={inputSx}>
                      <MenuItem value="">Selecione</MenuItem>
                      <MenuItem value="Solteiro(a)">Solteiro(a)</MenuItem>
                      <MenuItem value="Casado(a)">Casado(a)</MenuItem>
                      <MenuItem value="Divorciado(a)">Divorciado(a)</MenuItem>
                      <MenuItem value="Viúvo(a)">Viúvo(a)</MenuItem>
                    </TextField>
                    <TextField
                      fullWidth label="Telefone" name="telefone"
                      value={dadosMedico.telefone}
                      onChange={(e) => setDadosMedico(prev => ({ ...prev, telefone: formatarTelefone(e.target.value) }))}
                      slotProps={{ htmlInput: { maxLength: 15 } }}
                      sx={inputSx}
                    />
                  </Stack>
                </Stack>
              </TabPanel>
            )}

            {/* Tab 3 — Endereço */}
            {ehMedico && (
              <TabPanel value={tabValue} index={3}>
                <Stack spacing={2}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField
                      sx={{ flex: 1, ...inputSx }} label="CEP" name="cep"
                      value={dadosMedico.cep}
                      onChange={(e) => setDadosMedico(prev => ({ ...prev, cep: formatarCEP(e.target.value) }))}
                      onBlur={(e) => buscarCEP(e.target.value)}
                      slotProps={{ htmlInput: { maxLength: 9 } }}
                    />
                    <TextField sx={{ flex: 3, ...inputSx }} label="Endereço" name="endereco" value={dadosMedico.endereco} onChange={handleMedicoChange} disabled={buscandoCEP} />
                  </Stack>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField sx={{ flex: 1, ...inputSx }} label="Número"     name="numero"      type="number"  value={dadosMedico.numero || ''}      onChange={handleMedicoChange} />
                    <TextField sx={{ flex: 2, ...inputSx }} label="Complemento" name="complemento"               value={dadosMedico.complemento}       onChange={handleMedicoChange} />
                    <TextField sx={{ flex: 2, ...inputSx }} label="Bairro"      name="bairro"                    value={dadosMedico.bairro}            onChange={handleMedicoChange} disabled={buscandoCEP} />
                  </Stack>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                    <TextField sx={{ flex: 3, ...inputSx }} label="Cidade" name="cidade" value={dadosMedico.cidade} onChange={handleMedicoChange} disabled={buscandoCEP} />
                    <TextField
                      sx={{ flex: 1, ...inputSx }} label="UF" name="uf"
                      value={dadosMedico.uf} onChange={handleMedicoChange} disabled={buscandoCEP}
                      slotProps={{ htmlInput: { maxLength: 2, style: { textTransform: 'uppercase' } } }}
                    />
                  </Stack>
                </Stack>
              </TabPanel>
            )}

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
