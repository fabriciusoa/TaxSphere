import React, { useState, useEffect, useCallback } from 'react';
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
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  TablePagination,
  Tooltip,
  Badge,
  Tabs,
  Tab,
  Card,
  CardContent,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Alert,
  CircularProgress,
  Stack,
  InputAdornment,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Search as SearchIcon,
  ExpandMore as ExpandMoreIcon,
  AttachFile as AttachFileIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import chamadosService from '../services/chamadosService';
import { useAuth } from '../contexts/AuthContext';
import type {
  Chamado,
  ChamadoComentario,
  StatusChamado,
  CategoriaChamado,
  PrioridadeChamado,
  CriarChamadoDTO,
  AtualizarChamadoDTO,
} from '../types';
import AnexosUpload from '../components/AnexosUpload';
import AnexosGaleria from '../components/AnexosGaleria';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:        '#00c8f0',
  cyanDim:     'rgba(0, 200, 240, 0.08)',
  cyanBorder:  'rgba(0, 200, 240, 0.18)',
  cyanGlow:    '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:   '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary: '#1a2332',
  textSecond:  '#64748b',
  border:      'rgba(15, 30, 60, 0.09)',
  surface:     '#FFFFFF',
  inputBg:     '#F7F9FC',
  navy:        '#0a1628',
  cardShadow:  '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg,
    borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { color: T.textSecond, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: T.cyan },
};

const selectSx = {
  borderRadius: '10px',
  backgroundColor: T.inputBg,
  '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
  '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
  '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
};

// Mapeamento de cores semânticas para chips
const statusColors: Record<StatusChamado, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'Aberto': 'info',
  'Em Andamento': 'warning',
  'Aguardando Resposta': 'secondary',
  'Resolvido': 'success',
  'Fechado': 'default',
  'Cancelado': 'error'
};

const prioridadeColors: Record<PrioridadeChamado, 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning'> = {
  'Baixa': 'info',
  'Normal': 'default',
  'Alta': 'warning',
  'Urgente': 'error'
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index, ...other }: TabPanelProps) {
  return (
    <div role="tabpanel" hidden={value !== index} id={`tabpanel-${index}`} aria-labelledby={`tab-${index}`} {...other}>
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

const ChamadoPage: React.FC = () => {
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);

  const [filtroStatus, setFiltroStatus] = useState<StatusChamado | ''>('');
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaChamado | ''>('');
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeChamado | ''>('');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');

  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalDetalhes, setModalDetalhes] = useState(false);
  const [chamadoSelecionado, setChamadoSelecionado] = useState<Chamado | null>(null);

  const [formCriar, setFormCriar] = useState<CriarChamadoDTO>({
    titulo: '', descricao: '', categoria: 'Dúvida', prioridade: 'Normal'
  });
  const [formEditar, setFormEditar] = useState<AtualizarChamadoDTO>({});

  const [comentarios, setComentarios] = useState<ChamadoComentario[]>([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [comentarioIdParaAnexo, setComentarioIdParaAnexo] = useState<number | null>(null);
  const [tabValue, setTabValue] = useState(0);
  const [anexosNovoChamado, setAnexosNovoChamado] = useState<File[]>([]);
  const [criandoChamado, setCriandoChamado] = useState(false);

  const { user } = useAuth();
  const isAdmin = user?.perfil === 'ADMIN';

  useEffect(() => {
    const timer = setTimeout(() => setBuscaDebounced(busca), 500);
    return () => clearTimeout(timer);
  }, [busca]);

  const carregarChamados = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const filtros: any = { page: page + 1, limit };
      if (filtroStatus) filtros.status = filtroStatus;
      if (filtroCategoria) filtros.categoria = filtroCategoria;
      if (filtroPrioridade) filtros.prioridade = filtroPrioridade;
      if (buscaDebounced) filtros.busca = buscaDebounced;
      const response = await chamadosService.listar(filtros);
      setChamados(response.data);
      setTotal(response.total);
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Erro ao carregar chamados');
      logger.error('Erro ao carregar chamados', error);
    } finally {
      setLoading(false);
    }
  }, [page, limit, filtroStatus, filtroCategoria, filtroPrioridade, buscaDebounced]);

  useEffect(() => { carregarChamados(); }, [carregarChamados]);

  const handleStatusChange = (event: SelectChangeEvent<StatusChamado | ''>) => {
    setFiltroStatus(event.target.value as StatusChamado | '');
    setPage(0);
  };
  const handleCategoriaChange = (event: SelectChangeEvent<CategoriaChamado | ''>) => {
    setFiltroCategoria(event.target.value as CategoriaChamado | '');
    setPage(0);
  };
  const handlePrioridadeChange = (event: SelectChangeEvent<PrioridadeChamado | ''>) => {
    setFiltroPrioridade(event.target.value as PrioridadeChamado | '');
    setPage(0);
  };

  const handleCriarSubmit = async () => {
    setCriandoChamado(true);
    try {
      const chamadoCriado = await chamadosService.criar(formCriar);
      if (anexosNovoChamado.length > 0) {
        const comentarioInicial = await chamadosService.criarComentario(chamadoCriado.id, {
          comentario: 'Anexos enviados na abertura do chamado'
        });
        await chamadosService.uploadAnexos(comentarioInicial.id, anexosNovoChamado);
      }
      setModalCriar(false);
      setFormCriar({ titulo: '', descricao: '', categoria: 'Dúvida', prioridade: 'Normal' });
      setAnexosNovoChamado([]);
      carregarChamados();
    } catch (error: any) {
      logger.error('Erro ao criar chamado', error);
      alert(error.response?.data?.erro || 'Erro ao criar chamado');
    } finally {
      setCriandoChamado(false);
    }
  };

  const handleEditarSubmit = async () => {
    if (!chamadoSelecionado) return;
    try {
      await chamadosService.atualizar(chamadoSelecionado.id, formEditar);
      setModalEditar(false);
      setFormEditar({});
      carregarChamados();
      if (modalDetalhes) {
        const atualizado = await chamadosService.buscarPorId(chamadoSelecionado.id);
        setChamadoSelecionado(atualizado);
      }
    } catch (error: any) {
      logger.error('Erro ao atualizar chamado', error);
      alert(error.response?.data?.erro || 'Erro ao atualizar chamado');
    }
  };

  const handleDeletar = async (id: number) => {
    if (!confirm('Tem certeza que deseja deletar este chamado?')) return;
    try {
      await chamadosService.deletar(id);
      carregarChamados();
    } catch (error: any) {
      logger.error('Erro ao deletar chamado', error);
      alert(error.response?.data?.erro || 'Erro ao deletar chamado');
    }
  };

  const handleAbrirDetalhes = async (chamado: Chamado) => {
    setChamadoSelecionado(chamado);
    setModalDetalhes(true);
    setTabValue(0);
    setNovoComentario('');
    setComentarioIdParaAnexo(null);
    try {
      const comentariosData = await chamadosService.listarComentarios(chamado.id);
      setComentarios(comentariosData);
    } catch (error: any) {
      alert(error.response?.data?.erro || 'Erro ao carregar comentários');
      logger.error('Erro ao carregar comentários', error);
    }
  };

  const handleEnviarComentario = async () => {
    if (!chamadoSelecionado || !novoComentario.trim()) return;
    try {
      const comentarioCriado = await chamadosService.criarComentario(chamadoSelecionado.id, { comentario: novoComentario });
      setNovoComentario('');
      const comentariosData = await chamadosService.listarComentarios(chamadoSelecionado.id);
      setComentarios(comentariosData);
      setComentarioIdParaAnexo(comentarioCriado.id);
    } catch (error: any) {
      logger.error('Erro ao enviar comentário', error);
      alert(error.response?.data?.erro || 'Erro ao enviar comentário');
    }
  };

  const handleAnexosUploadSuccess = async () => {
    if (!chamadoSelecionado) return;
    const comentariosData = await chamadosService.listarComentarios(chamadoSelecionado.id);
    setComentarios(comentariosData);
    setComentarioIdParaAnexo(null);
  };

  const formatarDataChamado = (data: string) =>
    format(new Date(data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });

  // Estilos compartilhados para Dialog
  const dialogPaperSx = {
    borderRadius: '16px',
    border: `1px solid ${T.border}`,
    boxShadow: '0 8px 40px rgba(0,0,0,0.12)',
  };

  const btnPrimarySx = {
    height: 40, borderRadius: '10px',
    backgroundColor: T.cyan, color: T.navy,
    fontWeight: 700, textTransform: 'none' as const,
    boxShadow: T.cyanGlow,
    '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
    '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: T.navy },
  };

  const btnOutlinedSx = {
    height: 40, borderRadius: '10px',
    borderColor: 'rgba(15,30,60,0.18)', color: T.textSecond,
    textTransform: 'none' as const, fontWeight: 600,
    '&:hover': { borderColor: 'rgba(15,30,60,0.35)', backgroundColor: 'rgba(15,30,60,0.03)' },
  };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* Cabeçalho */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Chamados
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Gerencie e acompanhe seus chamados de suporte
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setModalCriar(true)}
          sx={btnPrimarySx}
        >
          Novo Chamado
        </Button>
      </Box>

      {erro && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{erro}</Alert>
      )}

      {/* Filtros */}
      <Paper elevation={0} sx={{
        p: 2, mb: 2,
        borderRadius: '12px',
        border: `1px solid ${T.border}`,
        boxShadow: T.cardShadow,
        backgroundColor: T.surface,
      }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems="center">
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <TextField
              size="small" fullWidth
              placeholder="Buscar por título..."
              value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(0); }}
              sx={inputSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon sx={{ color: T.textSecond, fontSize: 18 }} />
                    </InputAdornment>
                  )
                }
              }}
            />
          </Box>

          <FormControl size="small" sx={{ width: { xs: '100%', md: 140 } }}>
            <InputLabel sx={{ color: T.textSecond, fontSize: '0.875rem', '&.Mui-focused': { color: T.cyan } }}>Status</InputLabel>
            <Select value={filtroStatus} onChange={handleStatusChange} label="Status" sx={selectSx}>
              <MenuItem value="">Todos</MenuItem>
              {(['Aberto','Em Andamento','Aguardando Resposta','Resolvido','Fechado','Cancelado'] as StatusChamado[]).map(s => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ width: { xs: '100%', md: 170 } }}>
            <InputLabel sx={{ color: T.textSecond, fontSize: '0.875rem', '&.Mui-focused': { color: T.cyan } }}>Categoria</InputLabel>
            <Select value={filtroCategoria} onChange={handleCategoriaChange} label="Categoria" sx={selectSx}>
              <MenuItem value="">Todas</MenuItem>
              {(['Suporte Técnico','Dúvida','Sugestão','Melhoria','Reclamação','Erro/Bug','Outro'] as CategoriaChamado[]).map(c => (
                <MenuItem key={c} value={c}>{c}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ width: { xs: '100%', md: 140 } }}>
            <InputLabel sx={{ color: T.textSecond, fontSize: '0.875rem', '&.Mui-focused': { color: T.cyan } }}>Prioridade</InputLabel>
            <Select value={filtroPrioridade} onChange={handlePrioridadeChange} label="Prioridade" sx={selectSx}>
              <MenuItem value="">Todas</MenuItem>
              {(['Baixa','Normal','Alta','Urgente'] as PrioridadeChamado[]).map(p => (
                <MenuItem key={p} value={p}>{p}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Paper>

      {/* Tabela */}
      <Paper elevation={0} sx={{
        borderRadius: '12px',
        border: `1px solid ${T.border}`,
        boxShadow: T.cardShadow,
        backgroundColor: T.surface,
        overflow: 'hidden',
      }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow sx={{ backgroundColor: '#F8FAFC' }}>
                {['ID', '', 'Título', 'Categoria', 'Prioridade', 'Status', 'Aberto por', 'Criado em', 'Ações'].map((h) => (
                  <TableCell key={h} align={h === 'Ações' ? 'center' : 'left'} sx={{
                    fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                    borderBottom: `1px solid ${T.border}`, py: 1.5,
                  }}>
                    {h}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={28} sx={{ color: T.cyan }} />
                  </TableCell>
                </TableRow>
              ) : chamados.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6, color: T.textSecond, fontSize: '0.875rem' }}>
                    Nenhum chamado encontrado
                  </TableCell>
                </TableRow>
              ) : chamados.map((chamado) => {
                const isNovo = chamado.status === 'Aberto' && !chamado.id_usuario_atribuido;
                return (
                  <TableRow key={chamado.id} hover sx={{
                    '&:hover': { backgroundColor: '#F8FAFC' },
                    '& td': { borderBottom: `1px solid ${T.border}`, py: 1.5 },
                  }}>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, fontWeight: 500 }}>
                      #{chamado.id}
                    </TableCell>
                    <TableCell sx={{ width: 60 }}>
                      {isNovo && (
                        <Chip label="Novo" size="small" sx={{
                          fontSize: '0.6875rem', fontWeight: 600, height: 20,
                          backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid ${T.cyanBorder}`,
                        }} />
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.875rem', color: T.textPrimary, fontWeight: 500, maxWidth: 240 }}>
                      {chamado.titulo}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{chamado.categoria}</TableCell>
                    <TableCell>
                      <Chip label={chamado.prioridade} color={prioridadeColors[chamado.prioridade]} size="small"
                        sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22 }} />
                    </TableCell>
                    <TableCell>
                      <Chip label={chamado.status} color={statusColors[chamado.status]} size="small"
                        sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{chamado.usuario_nome}</TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, whiteSpace: 'nowrap' }}>
                      {formatarDataChamado(chamado.criado_em)}
                    </TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                        <Tooltip title="Ver detalhes">
                          <IconButton size="small" onClick={() => handleAbrirDetalhes(chamado)}
                            sx={{ color: T.textSecond, '&:hover': { color: T.cyan, backgroundColor: T.cyanDim } }}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {isAdmin && (
                          <>
                            <Tooltip title="Editar">
                              <IconButton size="small"
                                onClick={() => {
                                  setChamadoSelecionado(chamado);
                                  setFormEditar({ status: chamado.status, id_usuario_atribuido: chamado.id_usuario_atribuido });
                                  setModalEditar(true);
                                }}
                                sx={{ color: T.textSecond, '&:hover': { color: '#FFA726', backgroundColor: 'rgba(255,167,38,0.08)' } }}>
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Deletar">
                              <IconButton size="small" onClick={() => handleDeletar(chamado.id)}
                                sx={{ color: T.textSecond, '&:hover': { color: '#D32F2F', backgroundColor: 'rgba(211,47,47,0.08)' } }}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </>
                        )}
                      </Box>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={limit}
          onRowsPerPageChange={(e) => { setLimit(parseInt(e.target.value, 10)); setPage(0); }}
          labelRowsPerPage="Linhas por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
          sx={{ borderTop: `1px solid ${T.border}`, '& .MuiTablePagination-toolbar': { fontSize: '0.8125rem' } }}
        />
      </Paper>

      {/* Modal — Criar */}
      <Dialog open={modalCriar} onClose={() => setModalCriar(false)} maxWidth="sm" fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          Novo Chamado
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField label="Título" fullWidth required
              value={formCriar.titulo}
              onChange={(e) => setFormCriar({ ...formCriar, titulo: e.target.value })}
              sx={inputSx} />
            <TextField label="Descrição" fullWidth required multiline rows={4}
              value={formCriar.descricao}
              onChange={(e) => setFormCriar({ ...formCriar, descricao: e.target.value })}
              sx={inputSx} />
            <FormControl fullWidth required>
              <InputLabel sx={{ color: T.textSecond, '&.Mui-focused': { color: T.cyan } }}>Categoria</InputLabel>
              <Select value={formCriar.categoria}
                onChange={(e) => setFormCriar({ ...formCriar, categoria: e.target.value as CategoriaChamado })}
                label="Categoria" sx={selectSx}>
                {(['Suporte Técnico','Dúvida','Sugestão','Melhoria','Reclamação','Erro/Bug','Outro'] as CategoriaChamado[]).map(c => (
                  <MenuItem key={c} value={c}>{c}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel sx={{ color: T.textSecond, '&.Mui-focused': { color: T.cyan } }}>Prioridade</InputLabel>
              <Select value={formCriar.prioridade}
                onChange={(e) => setFormCriar({ ...formCriar, prioridade: e.target.value as PrioridadeChamado })}
                label="Prioridade" sx={selectSx}>
                {(['Baixa','Normal','Alta','Urgente'] as PrioridadeChamado[]).map(p => (
                  <MenuItem key={p} value={p}>{p}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Accordion elevation={0} sx={{
              border: `1px solid ${T.border}`, borderRadius: '10px !important',
              '&:before': { display: 'none' },
              '& .MuiAccordionSummary-root': { borderRadius: '10px' },
            }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary }}>
                  Anexar arquivos {anexosNovoChamado.length > 0 && `(${anexosNovoChamado.length})`}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" color="text.secondary" gutterBottom sx={{ fontSize: '0.8125rem' }}>
                  Você pode anexar até 5 arquivos (máx. 5MB cada)
                </Typography>
                <input type="file" multiple accept="image/*,application/pdf,.doc,.docx"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    if (files.length + anexosNovoChamado.length > 5) { alert('Máximo de 5 arquivos permitido'); return; }
                    setAnexosNovoChamado([...anexosNovoChamado, ...files]);
                    e.target.value = '';
                  }}
                  style={{ marginTop: 8, marginBottom: 8 }}
                />
                {anexosNovoChamado.length > 0 && (
                  <Stack spacing={1} sx={{ mt: 1 }}>
                    {anexosNovoChamado.map((file, index) => (
                      <Box key={index} sx={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        p: 1.25, border: `1px solid ${T.border}`, borderRadius: '8px',
                        backgroundColor: '#F8FAFC',
                      }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <AttachFileIcon fontSize="small" sx={{ color: T.textSecond }} />
                          <Typography variant="body2" sx={{ fontSize: '0.8125rem', color: T.textPrimary }}>
                            {file.name} ({(file.size / 1024).toFixed(1)} KB)
                          </Typography>
                        </Box>
                        <IconButton size="small" onClick={() => setAnexosNovoChamado(anexosNovoChamado.filter((_, i) => i !== index))}
                          sx={{ color: '#D32F2F' }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                  </Stack>
                )}
              </AccordionDetails>
            </Accordion>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => { setModalCriar(false); setAnexosNovoChamado([]); }} sx={btnOutlinedSx} variant="outlined">
            Cancelar
          </Button>
          <Button variant="contained"
            onClick={handleCriarSubmit}
            disabled={!formCriar.titulo || !formCriar.descricao || criandoChamado}
            sx={btnPrimarySx}>
            {criandoChamado ? <CircularProgress size={18} sx={{ color: T.navy }} /> : 'Criar Chamado'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal — Editar (Admin) */}
      <Dialog open={modalEditar} onClose={() => setModalEditar(false)} maxWidth="xs" fullWidth
        slotProps={{ paper: { sx: dialogPaperSx } }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          Editar Chamado #{chamadoSelecionado?.id}
        </DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 1 }}>
            <InputLabel sx={{ color: T.textSecond, '&.Mui-focused': { color: T.cyan } }}>Status</InputLabel>
            <Select
              value={formEditar.status || ''}
              onChange={(e) => setFormEditar({ ...formEditar, status: e.target.value as StatusChamado })}
              label="Status" sx={selectSx}>
              {(['Aberto','Em Andamento','Aguardando Resposta','Resolvido','Fechado','Cancelado'] as StatusChamado[]).map(s => (
                <MenuItem key={s} value={s}>{s}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setModalEditar(false)} sx={btnOutlinedSx} variant="outlined">Cancelar</Button>
          <Button variant="contained" onClick={handleEditarSubmit} sx={btnPrimarySx}>Salvar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal — Detalhes */}
      <Dialog open={modalDetalhes} onClose={() => setModalDetalhes(false)} maxWidth="md" fullWidth
        slotProps={{ paper: { sx: { ...dialogPaperSx, maxHeight: '90vh' } } }}>
        <DialogTitle sx={{
          fontSize: '1rem', fontWeight: 700, color: T.textPrimary,
          borderBottom: `1px solid ${T.border}`, pb: 2,
        }}>
          Chamado #{chamadoSelecionado?.id} — {chamadoSelecionado?.titulo}
        </DialogTitle>
        <DialogContent sx={{ p: 0 }}>
          <Box sx={{ borderBottom: `1px solid ${T.border}`, px: 3 }}>
            <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}
              sx={{
                '& .MuiTab-root': { fontSize: '0.875rem', textTransform: 'none', color: T.textSecond, '&.Mui-selected': { color: T.cyan } },
                '& .MuiTabs-indicator': { backgroundColor: T.cyan },
              }}>
              <Tab label="Detalhes" />
              <Tab label="Comentários" />
            </Tabs>
          </Box>

          {/* Tab Detalhes */}
          <TabPanel value={tabValue} index={0}>
            <Stack spacing={2}>
              <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}` }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 2 }}>
                    Informações do Chamado
                  </Typography>
                  <Stack spacing={1.5}>
                    {[
                      { label: 'Aberto por', value: chamadoSelecionado?.usuario_nome },
                      { label: 'Categoria', value: chamadoSelecionado?.categoria },
                    ].map(({ label, value }) => (
                      <Box key={label} sx={{ display: 'flex', gap: 2, alignItems: 'baseline' }}>
                        <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, minWidth: 110, flexShrink: 0 }}>{label}</Typography>
                        <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary, fontWeight: 500 }}>{value}</Typography>
                      </Box>
                    ))}
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, minWidth: 110 }}>Prioridade</Typography>
                      <Chip label={chamadoSelecionado?.prioridade}
                        color={chamadoSelecionado ? prioridadeColors[chamadoSelecionado.prioridade] : 'default'}
                        size="small" sx={{ fontSize: '0.75rem', fontWeight: 600 }} />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                      <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, minWidth: 110 }}>Status</Typography>
                      <Chip label={chamadoSelecionado?.status}
                        color={chamadoSelecionado ? statusColors[chamadoSelecionado.status] : 'default'}
                        size="small" sx={{ fontSize: '0.75rem', fontWeight: 600 }} />
                    </Box>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'baseline' }}>
                      <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, minWidth: 110 }}>Criado em</Typography>
                      <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary }}>
                        {chamadoSelecionado && formatarDataChamado(chamadoSelecionado.criado_em)}
                      </Typography>
                    </Box>
                  </Stack>
                </CardContent>
              </Card>

              <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}` }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 1.5 }}>
                    Descrição
                  </Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                    {chamadoSelecionado?.descricao}
                  </Typography>
                </CardContent>
              </Card>

              {isAdmin && (
                <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}` }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 1.5 }}>
                      Alterar Status
                    </Typography>
                    <FormControl fullWidth size="small">
                      <InputLabel sx={{ color: T.textSecond, '&.Mui-focused': { color: T.cyan } }}>Status</InputLabel>
                      <Select
                        value={chamadoSelecionado?.status || ''}
                        onChange={async (e) => {
                          if (!chamadoSelecionado) return;
                          try {
                            await chamadosService.atualizar(chamadoSelecionado.id, { status: e.target.value as StatusChamado });
                            const atualizado = await chamadosService.buscarPorId(chamadoSelecionado.id);
                            setChamadoSelecionado(atualizado);
                            carregarChamados();
                          } catch (error: any) {
                            alert(error.response?.data?.erro || 'Erro ao atualizar status');
                          }
                        }}
                        label="Status" sx={selectSx}>
                        {(['Aberto','Em Andamento','Aguardando Resposta','Resolvido','Fechado','Cancelado'] as StatusChamado[]).map(s => (
                          <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </CardContent>
                </Card>
              )}
            </Stack>
          </TabPanel>

          {/* Tab Comentários */}
          <TabPanel value={tabValue} index={1}>
            <Stack spacing={2}>
              {comentarios.map((comentario) => (
                <Card key={comentario.id} elevation={0} sx={{
                  borderRadius: '10px', border: `1px solid ${T.border}`,
                }}>
                  <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                      <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textPrimary }}>
                        {comentario.nome_usuario}
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>
                        {formatarDataChamado(comentario.criado_em)}
                      </Typography>
                    </Box>
                    <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary, whiteSpace: 'pre-wrap', lineHeight: 1.65 }}>
                      {comentario.comentario}
                    </Typography>
                    {comentario.anexos && comentario.anexos.length > 0 && (
                      <Box sx={{ mt: 1.5 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: T.textSecond, mb: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <AttachFileIcon sx={{ fontSize: 14 }} /> Anexos ({comentario.anexos.length})
                        </Typography>
                        <AnexosGaleria anexos={comentario.anexos} />
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Novo comentário */}
              <Card elevation={0} sx={{ borderRadius: '10px', border: `1px solid ${T.border}` }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 1.5 }}>
                    Adicionar Comentário
                  </Typography>
                  <TextField fullWidth multiline rows={3}
                    placeholder="Digite seu comentário..."
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value)}
                    sx={inputSx} />
                  <Button variant="contained"
                    sx={{ ...btnPrimarySx, mt: 1.5 }}
                    onClick={handleEnviarComentario}
                    disabled={!novoComentario.trim()}>
                    Enviar Comentário
                  </Button>

                  {comentarioIdParaAnexo && (
                    <Accordion elevation={0} sx={{
                      mt: 2, border: `1px solid ${T.border}`,
                      borderRadius: '10px !important', '&:before': { display: 'none' },
                    }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary }}>
                          Adicionar Anexos ao Comentário
                        </Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <AnexosUpload idComentario={comentarioIdParaAnexo} onUploadSuccess={handleAnexosUploadSuccess} />
                      </AccordionDetails>
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </TabPanel>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, borderTop: `1px solid ${T.border}` }}>
          <Button onClick={() => setModalDetalhes(false)} sx={btnOutlinedSx} variant="outlined">Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChamadoPage;
