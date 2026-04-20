/* eslint-disable react-hooks/exhaustive-deps */
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
  Tooltip,
} from '@mui/material';
import {
  Email as EmailIcon,
  Pending as PendingIcon,
  Error as ErrorIcon,
  TrendingUp as TrendingUpIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logger } from '../utils/logger';
import notificacoesService from '../services/notificacoesService';
import type { Notificacao, EstatisticasNotificacao, StatusNotificacao } from '../services/notificacoesService';

// Tokens Synchro
const T = {
  cyan: '#00c8f0',
  cyanDim: 'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
  cyanGlow: '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover: '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  inputBg: '#F7F9FC',
  navy: '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const selectSx = {
  borderRadius: '10px', backgroundColor: T.inputBg,
  '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
  '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
  '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
};

const btnOutlined = {
  height: 40, borderRadius: '10px',
  borderColor: 'rgba(15,30,60,0.18)', color: T.textSecond,
  textTransform: 'none' as const, fontWeight: 600,
  '&:hover': { borderColor: 'rgba(15,30,60,0.35)', backgroundColor: 'rgba(15,30,60,0.03)' },
};

const thCellSx = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
};

interface StatCardProps { icon: React.ReactNode; label: string; value: number | string; accent: string; }

function StatCard({ icon, label, value, accent }: StatCardProps) {
  return (
    <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Box>
            <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, mb: 1 }}>{label}</Typography>
            <Typography sx={{ fontSize: '1.75rem', fontWeight: 700, color: T.textPrimary, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {value}
            </Typography>
          </Box>
          <Box sx={{ width: 40, height: 40, borderRadius: '10px', backgroundColor: accent + '14', border: `1px solid ${accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, flexShrink: 0 }}>
            {icon}
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}

const NotificacoesAgendamentoPage: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [estatisticas, setEstatisticas] = useState<EstatisticasNotificacao | null>(null);
  const [notificacoes, setNotificacoes] = useState<Notificacao[]>([]);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(5);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [filtroStatus, setFiltroStatus] = useState<StatusNotificacao | ''>('');
  const [openErroDialog, setOpenErroDialog] = useState(false);
  const [notificacaoSelecionada, setNotificacaoSelecionada] = useState<Notificacao | null>(null);
  const [openConfirmReprocessar, setOpenConfirmReprocessar] = useState(false);
  const [reprocessando, setReprocessando] = useState(false);

  useEffect(() => { carregarDados(); }, []);
  useEffect(() => { const i = setInterval(carregarDados, 60000); return () => clearInterval(i); }, []);
  useEffect(() => { carregarNotificacoes(); }, [filtroStatus, page, rowsPerPage]);

  const carregarDados = async () => {
    await Promise.all([carregarEstatisticas(), carregarNotificacoes()]);
  };

  const carregarEstatisticas = async () => {
    try { setEstatisticas(await notificacoesService.estatisticas()); }
    catch (e: any) { logger.error('Erro ao carregar estatísticas', e); mostrarAlert('error', 'Erro ao carregar estatísticas'); }
  };

  const carregarNotificacoes = async () => {
    try {
      setLoading(true);
      setNotificacoes(await notificacoesService.listar({ status: filtroStatus || undefined, limite: rowsPerPage, offset: page * rowsPerPage }));
    } catch (e: any) {
      logger.error('Erro ao carregar notificações', e.response?.data?.message);
      mostrarAlert('error', 'Erro ao carregar notificações');
    } finally { setLoading(false); }
  };

  const handleReprocessarFalhas = async () => {
    try {
      setReprocessando(true);
      const r = await notificacoesService.reprocessarFalhas();
      mostrarAlert('success', r.message || `${r.reprocessados} notificações reprocessadas`);
      setOpenConfirmReprocessar(false);
      setTimeout(carregarDados, 1000);
    } catch (e: any) {
      logger.error('Erro ao reprocessar falhas', e);
      mostrarAlert('error', e.response?.data?.message || 'Erro ao reprocessar falhas');
    } finally { setReprocessando(false); }
  };

  const mostrarAlert = (type: 'success' | 'error', message: string) => {
    setAlertMsg({ type, message });
    setTimeout(() => setAlertMsg(null), 5000);
  };

  const getStatusColor = (s: StatusNotificacao): 'default' | 'success' | 'error' =>
    s === 'Enviado' ? 'success' : s === 'Falha' ? 'error' : 'default';

  const formatarData = (d?: string) => {
    if (!d) return '—';
    try { return format(new Date(d), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
    catch { return '—'; }
  };

  const dialogPaper = { borderRadius: '16px', border: `1px solid ${T.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
          Notificações
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
          Monitoramento de envios de email e WhatsApp
        </Typography>
      </Box>

      {alertMsg && <Alert severity={alertMsg.type} sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setAlertMsg(null)}>{alertMsg.message}</Alert>}

      {/* Métricas */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' }, gap: 2, mb: 3 }}>
        <StatCard icon={<EmailIcon sx={{ fontSize: 20 }} />} label="Total Enviadas" value={estatisticas?.total || 0} accent={T.cyan} />
        <StatCard icon={<PendingIcon sx={{ fontSize: 20 }} />} label="Pendentes" value={estatisticas?.pendentes || 0} accent="#FFA726" />
        <StatCard icon={<ErrorIcon sx={{ fontSize: 20 }} />} label="Falhas" value={estatisticas?.falhas || 0} accent="#D32F2F" />
        <StatCard icon={<TrendingUpIcon sx={{ fontSize: 20 }} />} label="Taxa de Sucesso" value={estatisticas?.taxa_sucesso || '0%'} accent="#66BB6A" />
      </Box>

      {/* Filtros */}
      <Paper elevation={0} sx={{ p: 2, mb: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems="center">
          <FormControl size="small" sx={{ width: { xs: '100%', sm: 150 } }}>
            <InputLabel sx={{ color: T.textSecond, fontSize: '0.875rem', '&.Mui-focused': { color: T.cyan } }}>Status</InputLabel>
            <Select value={filtroStatus} label="Status" onChange={(e) => setFiltroStatus(e.target.value as StatusNotificacao | '')} sx={selectSx}>
              <MenuItem value="">Todos</MenuItem>
              <MenuItem value="Pendente">Pendente</MenuItem>
              <MenuItem value="Enviado">Enviado</MenuItem>
              <MenuItem value="Falha">Falha</MenuItem>
            </Select>
          </FormControl>
          <Box sx={{ flex: 1 }} />
          <Button variant="outlined"
            onClick={() => setOpenConfirmReprocessar(true)}
            disabled={loading || !estatisticas?.falhas}
            sx={{ ...btnOutlined, borderColor: 'rgba(255,167,38,0.4)', color: '#FFA726', '&:hover': { borderColor: '#FFA726', backgroundColor: 'rgba(255,167,38,0.06)' } }}>
            Reprocessar Falhas ({estatisticas?.falhas || 0})
          </Button>
        </Stack>
      </Paper>

      {/* Tabela */}
      <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress size={28} sx={{ color: T.cyan }} />
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    {['Canal', 'Tipo Notificação', 'Destinatário', 'Assunto', 'Status', 'Enviado em', 'Tentativas', 'Ações'].map((h, i) => (
                      <TableCell key={h} align={i >= 5 ? 'center' : 'left'} sx={thCellSx}>{h}</TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {notificacoes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} align="center" sx={{ py: 6, color: T.textSecond, fontSize: '0.875rem' }}>
                        Nenhuma notificação encontrada
                      </TableCell>
                    </TableRow>
                  ) : notificacoes.map((n) => (
                    <TableRow key={n.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                      <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{n.tipo_notificacao}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', color: T.textPrimary }}>{n.destinatario}</TableCell>
                      <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, maxWidth: 200 }}>
                        <Tooltip title={n.assunto}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                            {n.assunto.length > 50 ? n.assunto.substring(0, 50) + '…' : n.assunto}
                          </span>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <Chip label={n.status} color={getStatusColor(n.status)} size="small" sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22 }} />
                      </TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8125rem', color: T.textSecond, whiteSpace: 'nowrap' }}>
                        {formatarData(n.enviado_em)}
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={n.contador_tentativas} size="small"
                          color={n.contador_tentativas >= 3 ? 'error' : 'default'}
                          sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22 }} />
                      </TableCell>
                      <TableCell align="center">
                        {n.status === 'Falha' && n.erro_falha ? (
                          <Tooltip title="Ver erro">
                            <IconButton size="small" onClick={() => { setNotificacaoSelecionada(n); setOpenErroDialog(true); }}
                              sx={{ color: '#D32F2F', '&:hover': { backgroundColor: 'rgba(211,47,47,0.08)' } }}>
                              <VisibilityIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        ) : <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond }}>—</Typography>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              rowsPerPageOptions={[5, 10, 25, 50]} component="div"
              count={estatisticas?.total || 0} rowsPerPage={rowsPerPage} page={page}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              labelRowsPerPage="Linhas por página:" labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
              sx={{ borderTop: `1px solid ${T.border}` }}
            />
          </>
        )}
      </Paper>

      {/* Dialog — detalhe do erro */}
      <Dialog open={openErroDialog} onClose={() => setOpenErroDialog(false)} maxWidth="sm" fullWidth slotProps={{ paper: { sx: dialogPaper } }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          Detalhes do Erro
        </DialogTitle>
        <DialogContent>
          {notificacaoSelecionada && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              {[
                { label: 'Destinatário', value: notificacaoSelecionada.destinatario },
                { label: 'Assunto', value: notificacaoSelecionada.assunto },
                { label: 'Tentativas', value: `${notificacaoSelecionada.contador_tentativas}/3` },
              ].map(({ label, value }) => (
                <Box key={label}>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: T.textSecond, mb: 0.5 }}>{label}</Typography>
                  <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary }}>{value}</Typography>
                </Box>
              ))}
              <Box>
                <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: T.textSecond, mb: 0.5 }}>Erro</Typography>
                <Alert severity="error" sx={{ borderRadius: '10px' }}>{notificacaoSelecionada.erro_falha || 'Erro desconhecido'}</Alert>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => setOpenErroDialog(false)} variant="outlined" sx={btnOutlined}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Dialog — confirmar reprocessar */}
      <Dialog open={openConfirmReprocessar} onClose={() => setOpenConfirmReprocessar(false)} maxWidth="xs" fullWidth slotProps={{ paper: { sx: dialogPaper } }}>
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          Reprocessar Notificações
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary, lineHeight: 1.7 }}>
            Tem certeza que deseja reprocessar todas as notificações que falharam? Elas serão colocadas novamente na fila para envio.
          </Typography>
          <Alert severity="info" sx={{ mt: 2, borderRadius: '10px' }}>
            Total a reprocessar: <strong>{estatisticas?.falhas || 0}</strong>
          </Alert>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setOpenConfirmReprocessar(false)} disabled={reprocessando} variant="outlined" sx={btnOutlined}>Cancelar</Button>
          <Button onClick={handleReprocessarFalhas} disabled={reprocessando} variant="outlined"
            sx={{ ...btnOutlined, borderColor: 'rgba(255,167,38,0.4)', color: '#FFA726', height: 40, '&:hover': { borderColor: '#FFA726', backgroundColor: 'rgba(255,167,38,0.06)' } }}>
            {reprocessando ? <CircularProgress size={18} sx={{ color: '#FFA726' }} /> : 'Reprocessar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default NotificacoesAgendamentoPage;
