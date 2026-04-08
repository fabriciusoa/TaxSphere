import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
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
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Alert,
  CircularProgress,
  Tooltip
} from '@mui/material';
import {
  Email as EmailIcon,
  Pending as PendingIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
  Visibility as VisibilityIcon,
  FilterList as FilterIcon,
  WhatsApp as WhatsAppIcon
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logger } from '../utils/logger';

import notificacoesService from '../services/notificacoesService';
import type {
  Notificacao,
  EstatisticasNotificacao,
  StatusNotificacao,
  TipoNotificacao
} from '../services/notificacoesService';

const NotificacoesAgendamentoPage: React.FC = () => {
  // States
  const [loading, setLoading] = useState(false);
  const [estatisticas, setEstatisticas] = useState<EstatisticasNotificacao | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [alert, setAlert] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filtros
  const [filtroStatus, setFiltroStatus] = useState<StatusNotificacao | ''>('');
  const [filtroTipo, setFiltroTipo] = useState<TipoNotificacao | ''>('');

  // Dialogs
  const [openErroDialog, setOpenErroDialog] = useState(false);
  const [notificacaoSelecionada, setNotificacaoSelecionada] = useState<Notificacao | null>(null);
  const [openConfirmReprocessar, setOpenConfirmReprocessar] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);

  // Carregar dados iniciais
  useEffect(() => {
    carregarDados();
  }, []);

  // Auto-refresh a cada 60 segundos (opcional)
  useEffect(() => {
    const interval = setInterval(() => {
      carregarDados();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Recarregar quando filtros mudam
  useEffect(() => {
    carregarNotificacoes();
  }, [filtroStatus, filtroTipo, page, rowsPerPage]);

  const carregarDados = async () => {
    await Promise.all([
      carregarEstatisticas(),
      carregarNotificacoes()
    ]);
  };

  const carregarEstatisticas = async () => {
    try {
      const stats = await notificacoesService.estatisticas();
      setEstatisticas(stats);
    } catch (error: any) {
      logger.error('Erro ao carregar estatísticas', error);
      mostrarAlert('error', 'Erro ao carregar estatísticas');
    }
  };

  const carregarNotificacoes = async () => {
    try {
      setLoading(true);
      const filtros = {
        status: filtroStatus || undefined,
        tipo: filtroTipo || undefined,
        limite: rowsPerPage,
        offset: page * rowsPerPage
      };

      const data = await notificacoesService.listar(filtros);
      setNotificacoes(data);
    } catch (error: any) {
      logger.error('Erro ao carregar notificações', error.response?.data?.message);
      mostrarAlert('error', 'Erro ao carregar notificações');
    } finally {
      setLoading(false);
    }
  };

  const handleReprocessarFalhas = async () => {
    try {
      setReprocessando(true);
      const resultado = await notificacoesService.reprocessarFalhas();
      mostrarAlert('success', resultado.message || `${resultado.reprocessados} notificações reprocessadas`);
      setOpenConfirmReprocessar(false);

      // Recarregar dados
      setTimeout(() => {
        carregarDados();
      }, 1000);
    } catch (error: any) {
      logger.error('Erro ao reprocessar falhas', error);
      mostrarAlert('error', error.response?.data?.message || 'Erro ao reprocessar falhas');
    } finally {
      setReprocessando(false);
    }
  };

  const handleVerErro = (notificacao: Notificacao) => {
    setNotificacaoSelecionada(notificacao);
    setOpenErroDialog(true);
  };

  const handleChangePage = (_event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const mostrarAlert = (type: 'success' | 'error', message: string) => {
    setAlert({ type, message });
    setTimeout(() => setAlert(null), 5000);
  };

  const getStatusChipColor = (status: StatusNotificacao): 'default' | 'success' | 'error' => {
    switch (status) {
      case 'Enviado':
        return 'success';
      case 'Falha':
        return 'error';
      default:
        return 'default';
    }
  };

  const formatarData = (dataString?: string): string => {
    if (!dataString) return '-';
    try {
      return format(new Date(dataString), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch(error: any) {
      logger.error('Erro ao formatar data', error);
      return '-';
    }
  };

  const truncarTexto = (texto: string): string => {
    if (!texto) return '';
    return texto.substring(0, 50) + '...';
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Notificações de Agendamento</Typography>
      </Box>

      {alert && (
        <Alert severity={alert.type} sx={{ mb: 2 }} onClose={() => setAlert(null)}>
          {alert.message}
        </Alert>
      )}

      {/* Cards de Estatísticas */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr 1fr' }, gap: 3, mb: 3 }}>
        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Total Enviadas
                </Typography>
                <Typography variant="h4">
                  {estatisticas?.total || 0}
                </Typography>
              </Box>
              <EmailIcon sx={{ fontSize: 40, color: 'primary.main', opacity: 0.7 }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Pendentes
                </Typography>
                <Typography variant="h4">
                  {estatisticas?.pendentes || 0}
                </Typography>
              </Box>
              <PendingIcon sx={{ fontSize: 40, color: 'warning.main', opacity: 0.7 }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Falhas
                </Typography>
                <Typography variant="h4">
                  {estatisticas?.falhas || 0}
                </Typography>
              </Box>
              <ErrorIcon sx={{ fontSize: 40, color: 'error.main', opacity: 0.7 }} />
            </Box>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Box>
                <Typography color="text.secondary" gutterBottom variant="body2">
                  Taxa de Sucesso
                </Typography>
                <Typography variant="h4">
                  {estatisticas?.taxa_sucesso ? `${estatisticas.taxa_sucesso}` : '0%'}
                </Typography>
              </Box>
              <TrendingUpIcon sx={{ fontSize: 40, color: 'success.main', opacity: 0.7 }} />
            </Box>
          </CardContent>
        </Card>
      </Box>

      {/* Filtros */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <FilterIcon />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Status</InputLabel>
            <Select
              value={filtroStatus}
              label="Status"
              onChange={(e) => setFiltroStatus(e.target.value as StatusNotificacao | '')}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="Pendente">Pendente</MenuItem>
              <MenuItem value="Enviado">Enviado</MenuItem>
              <MenuItem value="Falha">Falha</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Tipo</InputLabel>
            <Select
              value={filtroTipo}
              label="Tipo"
              onChange={(e) => setFiltroTipo(e.target.value as TipoNotificacao | '')}
            >
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="EMAIL">E-mail</MenuItem>
              <MenuItem value="WHATSAPP">WhatsApp</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            color="warning"
            onClick={() => setOpenConfirmReprocessar(true)}
            disabled={loading || !estatisticas?.falhas}
          >
            Reprocessar Todas as Falhas ({estatisticas?.falhas || 0})
          </Button>
        </Stack>
      </Paper>

      {/* Tabela de Notificações */}
      <TableContainer component={Paper}>
        {loading && (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
            <CircularProgress />
          </Box>
        )}

        {!loading && (
          <>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Tipo Notificação</TableCell>
                  <TableCell>Destinatário</TableCell>
                  <TableCell>Assunto</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Enviado Em</TableCell>
                  <TableCell align="center">Tentativas</TableCell>
                  <TableCell align="center">Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {notificacoes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      <Typography variant="body2" color="text.secondary">
                        Nenhuma notificação encontrada
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  notificacoes.map((notificacao) => (
                    <TableRow key={notificacao.id} hover>
                      <TableCell>
                        {notificacao.tipo === 'EMAIL' ? (
                          <Tooltip title="E-mail">
                            <EmailIcon color="primary" />
                          </Tooltip>
                        ) : (
                          <Tooltip title="WhatsApp">
                            <WhatsAppIcon color="success" />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>{notificacao.tipo_notificacao}</TableCell>
                      <TableCell>{notificacao.destinatario}</TableCell>
                      <TableCell>
                        <Tooltip title={notificacao.assunto}>
                          <span>{truncarTexto(notificacao.assunto)}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={notificacao.status}
                          color={getStatusChipColor(notificacao.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>{formatarData(notificacao.enviado_em)}</TableCell>
                      <TableCell align="center">
                        <Chip
                          label={notificacao.contador_tentativas}
                          color={notificacao.contador_tentativas >= 3 ? 'error' : 'primary'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="center">
                        {notificacao.status === 'Falha' && notificacao.erro_falha ? (
                          <Tooltip title="Ver erro">
                            <IconButton
                              size="small"
                              onClick={() => handleVerErro(notificacao)}
                              color="error"
                            >
                              <VisibilityIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>

            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]}
              component="div"
              count={estatisticas?.total || 0}
              rowsPerPage={rowsPerPage}
              page={page}
              onPageChange={handleChangePage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              labelRowsPerPage="Linhas por página:"
              labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`}
            />
          </>
        )}
      </TableContainer>

      {/* Dialog de Erro */}
      <Dialog open={openErroDialog} onClose={() => setOpenErroDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Detalhes do Erro</DialogTitle>
        <DialogContent>
          {notificacaoSelecionada && (
            <Stack spacing={2}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Destinatário:</Typography>
                <Typography>{notificacaoSelecionada.destinatario}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Assunto:</Typography>
                <Typography>{notificacaoSelecionada.assunto}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Tentativas:</Typography>
                <Typography>{notificacaoSelecionada.contador_tentativas}/3</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">Erro:</Typography>
                <Alert severity="error" sx={{ mt: 1 }}>
                  {notificacaoSelecionada.erro_falha || 'Erro desconhecido'}
                </Alert>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenErroDialog(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog de Confirmação - Reprocessar */}
      <Dialog open={openConfirmReprocessar} onClose={() => setOpenConfirmReprocessar(false)}>
        <DialogTitle>Reprocessar Notificações</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja reprocessar todas as notificações que falharam?
            Elas serão colocadas novamente na fila para envio.
          </Typography>
          <Alert severity="info" sx={{ mt: 2 }}>
            Total de notificações a reprocessar: {estatisticas?.falhas || 0}
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenConfirmReprocessar(false)} disabled={reprocessando}>
            Cancelar
          </Button>
          <Button
            onClick={handleReprocessarFalhas}
            color="warning"
            variant="contained"
            disabled={reprocessando}
          >
            {reprocessando ? 'Reprocessando...' : 'Reprocessar'}
          </Button>
        </DialogActions>
      </Dialog>

    </Box>
  );
};

export default NotificacoesAgendamentoPage;
