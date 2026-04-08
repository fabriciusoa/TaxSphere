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

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;
  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`tabpanel-${index}`}
      aria-labelledby={`tab-${index}`}
      {...other}
    >
      {value === index && <Box sx={{ p: 3 }}>{children}</Box>}
    </div>
  );
}

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

const ChamadoPage: React.FC = () => {
  const [chamados, setChamados] = useState<Chamado[]>([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<StatusChamado | ''>('');
  const [filtroCategoria, setFiltroCategoria] = useState<CategoriaChamado | ''>('');
  const [filtroPrioridade, setFiltroPrioridade] = useState<PrioridadeChamado | ''>('');
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');

  // Modais
  const [modalCriar, setModalCriar] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);
  const [modalDetalhes, setModalDetalhes] = useState(false);
  const [chamadoSelecionado, setChamadoSelecionado] = useState<Chamado | null>(null);

  // Formulários
  const [formCriar, setFormCriar] = useState<CriarChamadoDTO>({
    titulo: '',
    descricao: '',
    categoria: 'Dúvida',
    prioridade: 'Normal'
  });
  const [formEditar, setFormEditar] = useState<AtualizarChamadoDTO>({});

  // Detalhes - comentários
  const [comentarios, setComentarios] = useState<ChamadoComentario[]>([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [comentarioIdParaAnexo, setComentarioIdParaAnexo] = useState<number | null>(null);
  const [tabValue, setTabValue] = useState(0);

  // Anexos para novo chamado
  const [anexosNovoChamado, setAnexosNovoChamado] = useState<File[]>([]);
  const [criandoChamado, setCriandoChamado] = useState(false);

  // Usuário atual
  const { user } = useAuth();
  const isAdmin = user?.perfil === 'ADMIN';

  // Debounce busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setBuscaDebounced(busca);
    }, 500);
    return () => clearTimeout(timer);
  }, [busca]);

  // Carregar chamados
  const carregarChamados = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const filtros: any = {
        page: page + 1,
        limit
      };
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

  useEffect(() => {
    carregarChamados();
  }, [carregarChamados]);

  // Handlers de filtros
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

  const handleBuscaChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setBusca(event.target.value);
    setPage(0);
  };

  // Criar chamado
  const handleCriarSubmit = async () => {
    setCriandoChamado(true);
    try {
      // 1. Criar o chamado
      const chamadoCriado = await chamadosService.criar(formCriar);
      
      // 2. Se houver anexos, criar comentário automático com anexos
      if (anexosNovoChamado.length > 0) {
        const comentarioInicial = await chamadosService.criarComentario(chamadoCriado.id, {
          comentario: 'Anexos enviados na abertura do chamado'
        });
        
        // 3. Fazer upload dos anexos
        await chamadosService.uploadAnexos(comentarioInicial.id, anexosNovoChamado);
      }
      
      setModalCriar(false);
      setFormCriar({
        titulo: '',
        descricao: '',
        categoria: 'Dúvida',
        prioridade: 'Normal'
      });
      setAnexosNovoChamado([]);
      carregarChamados();
    } catch (error: any) {
      logger.error('Erro ao criar chamado', error);
      alert(error.response?.data?.erro || 'Erro ao criar chamado');
    } finally {
      setCriandoChamado(false);
    }
  };

  // Editar chamado (apenas admin)
  const handleEditarSubmit = async () => {
    if (!chamadoSelecionado) return;
    try {
      await chamadosService.atualizar(chamadoSelecionado.id, formEditar);
      setModalEditar(false);
      setFormEditar({});
      carregarChamados();
      if (modalDetalhes) {
        // Recarregar detalhes
        const atualizado = await chamadosService.buscarPorId(chamadoSelecionado.id);
        setChamadoSelecionado(atualizado);
      }
    } catch (error: any) {
      logger.error('Erro ao atualizar chamado', error);
      alert(error.response?.data?.erro || 'Erro ao atualizar chamado');
    }
  };

  // Deletar chamado
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

  // Abrir detalhes
  const handleAbrirDetalhes = async (chamado: Chamado) => {
    setChamadoSelecionado(chamado);
    setModalDetalhes(true);
    setTabValue(0);
    setNovoComentario('');
    setComentarioIdParaAnexo(null);
    // Carregar comentários
    try {
      const comentariosData = await chamadosService.listarComentarios(chamado.id);
      setComentarios(comentariosData);
    } catch (error: any) {
      alert(error.response?.data?.erro || 'Erro ao carregar comentários');
      logger.error('Erro ao carregar comentários', error);
    }
  };

  // Enviar comentário
  const handleEnviarComentario = async () => {
    if (!chamadoSelecionado || !novoComentario.trim()) return;
    try {
      const comentarioCriado = await chamadosService.criarComentario(chamadoSelecionado.id, {
        comentario: novoComentario
      });
      setNovoComentario('');
      // Recarregar comentários
      const comentariosData = await chamadosService.listarComentarios(chamadoSelecionado.id);
      setComentarios(comentariosData);
      // Se quiser anexar arquivos, abrir accordion
      setComentarioIdParaAnexo(comentarioCriado.id);
    } catch (error: any) {
      logger.error('Erro ao enviar comentário', error);
      alert(error.response?.data?.erro || 'Erro ao enviar comentário');
    }
  };

  // Após upload de anexos, recarregar comentários
  const handleAnexosUploadSuccess = async () => {
    if (!chamadoSelecionado) return;
    const comentariosData = await chamadosService.listarComentarios(chamadoSelecionado.id);
    setComentarios(comentariosData);
    setComentarioIdParaAnexo(null);
  };

  // Formatar data
  const formatarData = (data: string) => {
    return format(new Date(data), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Chamados</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setModalCriar(true)}
        >
          Novo Chamado
        </Button>
      </Box>

      {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 2 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center">
          <Box sx={{ flex: 1, minWidth: 250 }}>
            <TextField
              size="small"
              fullWidth
              placeholder="Buscar..."
              value={busca}
              onChange={handleBuscaChange}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon />
                  </InputAdornment>
                )
              }}
            />
          </Box>
          <Box sx={{ width: { xs: '100%', md: 150 } }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Status</InputLabel>
              <Select value={filtroStatus} onChange={handleStatusChange} label="Status">
                <MenuItem value="">Todos</MenuItem>
                <MenuItem value="Aberto">Aberto</MenuItem>
                <MenuItem value="Em Andamento">Em Andamento</MenuItem>
                <MenuItem value="Aguardando Resposta">Aguardando Resposta</MenuItem>
                <MenuItem value="Resolvido">Resolvido</MenuItem>
                <MenuItem value="Fechado">Fechado</MenuItem>
                <MenuItem value="Cancelado">Cancelado</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ width: { xs: '100%', md: 180 } }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Categoria</InputLabel>
              <Select value={filtroCategoria} onChange={handleCategoriaChange} label="Categoria">
                <MenuItem value="">Todas</MenuItem>
                <MenuItem value="Suporte Técnico">Suporte Técnico</MenuItem>
                <MenuItem value="Dúvida">Dúvida</MenuItem>
                <MenuItem value="Sugestão">Sugestão</MenuItem>
                <MenuItem value="Melhoria">Melhoria</MenuItem>
                <MenuItem value="Reclamação">Reclamação</MenuItem>
                <MenuItem value="Erro/Bug">Erro/Bug</MenuItem>
                <MenuItem value="Outro">Outro</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box sx={{ width: { xs: '100%', md: 150 } }}>
            <FormControl size="small" fullWidth>
              <InputLabel>Prioridade</InputLabel>
              <Select value={filtroPrioridade} onChange={handlePrioridadeChange} label="Prioridade">
                <MenuItem value="">Todas</MenuItem>
                <MenuItem value="Baixa">Baixa</MenuItem>
                <MenuItem value="Normal">Normal</MenuItem>
                <MenuItem value="Alta">Alta</MenuItem>
                <MenuItem value="Urgente">Urgente</MenuItem>
              </Select>
            </FormControl>
          </Box>
        </Stack>
      </Paper>

      {/* Tabela */}
      
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell></TableCell>
              <TableCell>Título</TableCell>
              <TableCell>Categoria</TableCell>
              <TableCell>Prioridade</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Aberto por</TableCell>
              <TableCell>Criado em</TableCell>
              <TableCell align="center" width="200">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : chamados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  Nenhum chamado encontrado
                </TableCell>
              </TableRow>
            ) : (
              chamados.map((chamado) => {
                const isNovo = chamado.status === 'Aberto' && !chamado.id_usuario_atribuido;
                return (
                  <TableRow key={chamado.id} hover>
                    <TableCell>{chamado.id}</TableCell>
                    <TableCell>
                      {isNovo && (
                        <Badge badgeContent="Novo" color="primary" sx={{ mr: 1 }} />
                      )}
                    </TableCell>
                    <TableCell>
                      {chamado.titulo}
                    </TableCell>
                    <TableCell>{chamado.categoria}</TableCell>
                    <TableCell>
                      <Chip
                        label={chamado.prioridade}
                        color={prioridadeColors[chamado.prioridade]}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={chamado.status}
                        color={statusColors[chamado.status]}
                        size="small"
                      />
                    </TableCell>
                    <TableCell>{chamado.usuario_nome}</TableCell>
                    <TableCell>{formatarData(chamado.criado_em)}</TableCell>                    
                    <TableCell align="center">
                      <Tooltip title="Ver detalhes">
                        <IconButton size="small" onClick={() => handleAbrirDetalhes(chamado)}>
                          <VisibilityIcon />
                        </IconButton>
                      </Tooltip>
                      {isAdmin && (
                        <>
                          <Tooltip title="Editar">
                            <IconButton
                              size="small"
                              onClick={() => {
                                setChamadoSelecionado(chamado);
                                setFormEditar({
                                  status: chamado.status,
                                  id_usuario_atribuido: chamado.id_usuario_atribuido
                                });
                                setModalEditar(true);
                              }}
                            >
                              <EditIcon />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title="Deletar">
                            <IconButton size="small" onClick={() => handleDeletar(chamado.id)}>
                              <DeleteIcon />
                            </IconButton>
                          </Tooltip>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={limit}
          onRowsPerPageChange={(e) => {
            setLimit(parseInt(e.target.value, 10));
            setPage(0);
          }}
          labelRowsPerPage="Linhas por página:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
        />
      </TableContainer>


      {/* Modal Criar */}
      <Dialog open={modalCriar} onClose={() => setModalCriar(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Novo Chamado</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Título"
              fullWidth
              required
              value={formCriar.titulo}
              onChange={(e) => setFormCriar({ ...formCriar, titulo: e.target.value })}
            />
            <TextField
              label="Descrição"
              fullWidth
              required
              multiline
              rows={4}
              value={formCriar.descricao}
              onChange={(e) => setFormCriar({ ...formCriar, descricao: e.target.value })}
            />
            <FormControl fullWidth required>
              <InputLabel>Categoria</InputLabel>
              <Select
                value={formCriar.categoria}
                onChange={(e) => setFormCriar({ ...formCriar, categoria: e.target.value as CategoriaChamado })}
                label="Categoria"
              >
                <MenuItem value="Suporte Técnico">Suporte Técnico</MenuItem>
                <MenuItem value="Dúvida">Dúvida</MenuItem>
                <MenuItem value="Sugestão">Sugestão</MenuItem>
                <MenuItem value="Melhoria">Melhoria</MenuItem>
                <MenuItem value="Reclamação">Reclamação</MenuItem>
                <MenuItem value="Erro/Bug">Erro/Bug</MenuItem>
                <MenuItem value="Outro">Outro</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth required>
              <InputLabel>Prioridade</InputLabel>
              <Select
                value={formCriar.prioridade}
                onChange={(e) => setFormCriar({ ...formCriar, prioridade: e.target.value as PrioridadeChamado })}
                label="Prioridade"
              >
                <MenuItem value="Baixa">Baixa</MenuItem>
                <MenuItem value="Normal">Normal</MenuItem>
                <MenuItem value="Alta">Alta</MenuItem>
                <MenuItem value="Urgente">Urgente</MenuItem>
              </Select>
            </FormControl>

            {/* Anexos */}
            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography>
                  Anexar arquivos {anexosNovoChamado.length > 0 && `(${anexosNovoChamado.length})`}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Você pode anexar até 5 arquivos (máx. 5MB cada)
                  </Typography>
                  <input
                    type="file"
                    multiple
                    accept="image/*,application/pdf,.doc,.docx"
                    onChange={(e) => {
                      const files = Array.from(e.target.files || []);
                      if (files.length + anexosNovoChamado.length > 5) {
                        alert('Máximo de 5 arquivos permitido');
                        return;
                      }
                      setAnexosNovoChamado([...anexosNovoChamado, ...files]);
                      e.target.value = '';
                    }}
                    style={{ marginTop: 8, marginBottom: 8 }}
                  />
                  {anexosNovoChamado.length > 0 && (
                    <Stack spacing={1} sx={{ mt: 2 }}>
                      {anexosNovoChamado.map((file, index) => (
                        <Box
                          key={index}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            p: 1,
                            border: '1px solid',
                            borderColor: 'divider',
                            borderRadius: 1
                          }}
                        >
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AttachFileIcon fontSize="small" />
                            <Typography variant="body2">
                              {file.name} ({(file.size / 1024).toFixed(1)} KB)
                            </Typography>
                          </Box>
                          <IconButton
                            size="small"
                            onClick={() => {
                              setAnexosNovoChamado(
                                anexosNovoChamado.filter((_, i) => i !== index)
                              );
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Box>
                      ))}
                    </Stack>
                  )}
                </Box>
              </AccordionDetails>
            </Accordion>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            setModalCriar(false);
            setAnexosNovoChamado([]);
          }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleCriarSubmit}
            disabled={!formCriar.titulo || !formCriar.descricao || criandoChamado}
          >
            {criandoChamado ? 'Criando...' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Editar (Admin) */}
      <Dialog open={modalEditar} onClose={() => setModalEditar(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar Chamado #{chamadoSelecionado?.id}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth>
              <InputLabel>Status</InputLabel>
              <Select
                value={formEditar.status || ''}
                onChange={(e) => setFormEditar({ ...formEditar, status: e.target.value as StatusChamado })}
                label="Status"
              >
                <MenuItem value="Aberto">Aberto</MenuItem>
                <MenuItem value="Em Andamento">Em Andamento</MenuItem>
                <MenuItem value="Aguardando Resposta">Aguardando Resposta</MenuItem>
                <MenuItem value="Resolvido">Resolvido</MenuItem>
                <MenuItem value="Fechado">Fechado</MenuItem>
                <MenuItem value="Cancelado">Cancelado</MenuItem>
              </Select>
            </FormControl>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalEditar(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleEditarSubmit}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Detalhes */}
      <Dialog
        open={modalDetalhes}
        onClose={() => setModalDetalhes(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Chamado #{chamadoSelecionado?.id} - {chamadoSelecionado?.titulo}
        </DialogTitle>
        <DialogContent>
          <Tabs value={tabValue} onChange={(_, v) => setTabValue(v)}>
            <Tab label="Detalhes" />
            <Tab label="Comentários" />
          </Tabs>

          {/* Tab Detalhes */}
          <TabPanel value={tabValue} index={0}>
            <Stack spacing={2}>
              <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>
                      Informações
                    </Typography>
                    <Stack spacing={2}>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Aberto por:
                        </Typography>
                        <Typography variant="body1">{chamadoSelecionado?.usuario_nome}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Categoria:
                        </Typography>
                        <Typography variant="body1">{chamadoSelecionado?.categoria}</Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Prioridade:
                        </Typography>
                        <Chip
                          label={chamadoSelecionado?.prioridade}
                          color={chamadoSelecionado ? prioridadeColors[chamadoSelecionado.prioridade] : 'default'}
                          size="small"
                        />
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Status:
                        </Typography>
                        <Chip
                          label={chamadoSelecionado?.status}
                          color={chamadoSelecionado ? statusColors[chamadoSelecionado.status] : 'default'}
                          size="small"
                        />
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Criado em:
                        </Typography>
                        <Typography variant="body1">
                          {chamadoSelecionado && formatarData(chamadoSelecionado.criado_em)}
                        </Typography>
                      </Box>
                      <Box>
                        <Typography variant="body2" color="text.secondary">
                          Descrição:
                        </Typography>
                        <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>
                          {chamadoSelecionado?.descricao}
                        </Typography>
                      </Box>
                    </Stack>
                  </CardContent>
                </Card>
              {isAdmin && (
                  <Card>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>
                        Alterar Status
                      </Typography>
                      <FormControl fullWidth>
                        <InputLabel>Status</InputLabel>
                        <Select
                          value={chamadoSelecionado?.status || ''}
                          onChange={async (e) => {
                            if (!chamadoSelecionado) return;
                            try {
                              await chamadosService.atualizar(chamadoSelecionado.id, {
                                status: e.target.value as StatusChamado
                              });
                              const atualizado = await chamadosService.buscarPorId(chamadoSelecionado.id);
                              setChamadoSelecionado(atualizado);
                              carregarChamados();
                            } catch (error: any) {
                              alert(error.response?.data?.erro || 'Erro ao atualizar status');
                            }
                          }}
                          label="Status"
                        >
                          <MenuItem value="Aberto">Aberto</MenuItem>
                          <MenuItem value="Em Andamento">Em Andamento</MenuItem>
                          <MenuItem value="Aguardando Resposta">Aguardando Resposta</MenuItem>
                          <MenuItem value="Resolvido">Resolvido</MenuItem>
                          <MenuItem value="Fechado">Fechado</MenuItem>
                          <MenuItem value="Cancelado">Cancelado</MenuItem>
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
              {/* Lista de comentários */}
              {comentarios.map((comentario) => (
                <Card key={comentario.id} variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {comentario.nome_usuario} - {formatarData(comentario.criado_em)}
                    </Typography>
                    <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', mb: 2 }}>
                      {comentario.comentario}
                    </Typography>
                    {comentario.anexos && comentario.anexos.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                          <AttachFileIcon fontSize="small" sx={{ verticalAlign: 'middle', mr: 0.5 }} />
                          Anexos ({comentario.anexos.length})
                        </Typography>
                        <AnexosGaleria anexos={comentario.anexos} />
                      </Box>
                    )}
                  </CardContent>
                </Card>
              ))}

              {/* Formulário novo comentário */}
              <Card variant="outlined">
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Adicionar Comentário
                  </Typography>
                  <TextField
                    fullWidth
                    multiline
                    rows={3}
                    placeholder="Digite seu comentário..."
                    value={novoComentario}
                    onChange={(e) => setNovoComentario(e.target.value)}
                  />
                  <Button
                    variant="contained"
                    sx={{ mt: 2 }}
                    onClick={handleEnviarComentario}
                    disabled={!novoComentario.trim()}
                  >
                    Enviar Comentário
                  </Button>

                  {/* Accordion para anexos */}
                  {comentarioIdParaAnexo && (
                    <Accordion sx={{ mt: 2 }}>
                      <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Typography>Adicionar Anexos ao Comentário</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <AnexosUpload
                          idComentario={comentarioIdParaAnexo}
                          onUploadSuccess={handleAnexosUploadSuccess}
                        />
                      </AccordionDetails>
                    </Accordion>
                  )}
                </CardContent>
              </Card>
            </Stack>
          </TabPanel>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setModalDetalhes(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ChamadoPage;
