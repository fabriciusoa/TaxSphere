import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  TablePagination, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, Tabs, Tab, Stepper, Step, StepLabel,
  CircularProgress, Alert, Tooltip, Divider,
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Delete as DeleteIcon,
  Send as SendIcon,
  CheckCircle as CheckIcon,
  Cancel as CancelIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import type {
  PerdcompPedido, PerdcompPedidoItem,
  PerdcompHistorico, PerdcompDocumento, TipoPedido, StatusPedido,
} from '../../types/perdcomp';
import { empresasService } from '../../services/empresasService';
import { type Empresas } from '../../types/index';
import { logger } from '../../utils/logger';

const T = {
  navy: '#0a1628',
  cyan: '#00c8f0',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const TIPOS_PEDIDO: TipoPedido[] = ['Restituição', 'Ressarcimento', 'Reembolso', 'Compensação'];

const STATUS_OPTIONS: StatusPedido[] = [
  'Rascunho', 'Transmitido', 'Em Análise', 'Deferido',
  'Deferido Parcialmente', 'Indeferido', 'Não Homologado', 'Cancelado', 'Homologado',
];

const statusColor: Record<string, 'default' | 'success' | 'error' | 'info' | 'warning'> = {
  Rascunho: 'default',
  Transmitido: 'warning',
  'Em Análise': 'info',
  Deferido: 'success',
  'Deferido Parcialmente': 'success',
  Homologado: 'success',
  Indeferido: 'error',
  'Não Homologado': 'error',
  Cancelado: 'error',
};

const stepLabels = ['Rascunho', 'Transmitido', 'Em Análise', 'Decisão'];

function statusToStep(s: StatusPedido): number {
  if (s === 'Rascunho') return 0;
  if (s === 'Transmitido') return 1;
  if (s === 'Em Análise') return 2;
  return 3;
}

interface TabPanelProps {
  children: React.ReactNode;
  value: number;
  index: number;
}
function TabPanel({ children, value, index }: TabPanelProps) {
  return value === index ? <Box sx={{ pt: 2 }}>{children}</Box> : null;
}

export default function PedidosPage() {
  const navigate = useNavigate();

  const [pedidos, setPedidos] = useState<PerdcompPedido[]>([]);
  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedPedido, setSelectedPedido] = useState<PerdcompPedido | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState(0);

  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<StatusPedido | ''>('');
  const [motivo, setMotivo] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pedidoToDelete, setPedidoToDelete] = useState<PerdcompPedido | null>(null);

  const carregarPedidos = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await perdcompService.pedidos.listar({
        id_empresa: filtroEmpresa ? Number(filtroEmpresa) : undefined,
        tipo_pedido: filtroTipo || undefined,
        status: filtroStatus || undefined,
        page: page + 1,
        limit: rowsPerPage,
      });
      setPedidos(res.data);
      setTotal(res.pagination.total);
    } catch (err: any) {
      logger.error('Erro ao carregar pedidos', err);
      setError('Erro ao carregar pedidos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [filtroEmpresa, filtroTipo, filtroStatus, page, rowsPerPage]);

  useEffect(() => {
    empresasService.listar({ limit: 200 })
      .then(r => setEmpresas(r.data))
      .catch(err => logger.error('Erro ao carregar empresas', err));
  }, []);

  useEffect(() => { carregarPedidos(); }, [carregarPedidos]);

  const abrirDetalhes = async (pedido: PerdcompPedido) => {
    try {
      setDetailLoading(true);
      setDetailOpen(true);
      setDetailTab(0);
      const full = await perdcompService.pedidos.buscarPorId(pedido.id);
      setSelectedPedido(full);
    } catch (err: any) {
      logger.error('Erro ao carregar detalhes do pedido', err);
      setError('Erro ao carregar detalhes do pedido.');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTransmitir = async () => {
    if (!selectedPedido) return;
    try {
      setActionLoading(true);
      await perdcompService.pedidos.atualizarStatus(selectedPedido.id, { status: 'Transmitido' });
      setSuccess('Pedido transmitido com sucesso!');
      setDetailOpen(false);
      carregarPedidos();
    } catch (err: any) {
      logger.error('Erro ao transmitir pedido', err);
      setError('Erro ao transmitir pedido.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeStatus = async () => {
    if (!selectedPedido || !newStatus) return;
    try {
      setActionLoading(true);
      const payload: any = { status: newStatus };
      if (newStatus === 'Indeferido' || newStatus === 'Não Homologado') {
        payload.motivo_indeferimento = motivo;
      }
      await perdcompService.pedidos.atualizarStatus(selectedPedido.id, payload);
      setSuccess(`Status alterado para "${newStatus}" com sucesso!`);
      setStatusDialogOpen(false);
      setDetailOpen(false);
      setMotivo('');
      setNewStatus('');
      carregarPedidos();
    } catch (err: any) {
      logger.error('Erro ao alterar status', err);
      setError('Erro ao alterar status do pedido.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!pedidoToDelete) return;
    try {
      setActionLoading(true);
      await perdcompService.pedidos.excluir(pedidoToDelete.id);
      setSuccess('Pedido excluído com sucesso!');
      setDeleteConfirmOpen(false);
      setDetailOpen(false);
      setPedidoToDelete(null);
      carregarPedidos();
    } catch (err: any) {
      logger.error('Erro ao excluir pedido', err);
      setError('Erro ao excluir pedido.');
    } finally {
      setActionLoading(false);
    }
  };

  const openDeleteConfirm = (p: PerdcompPedido) => {
    setPedidoToDelete(p);
    setDeleteConfirmOpen(true);
  };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>
          {success}
        </Alert>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Pedidos PER/DComp
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.5 }}>
            Gerencie pedidos de restituição, ressarcimento, reembolso e compensação.
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => navigate('/fiscal/perdcomp/pedidos/novo')}
          sx={{
            bgcolor: T.cyan, color: T.navy, fontWeight: 600, textTransform: 'none',
            borderRadius: '10px', px: 3, '&:hover': { bgcolor: '#00b5d8' },
          }}
        >
          Novo Pedido
        </Button>
      </Box>

      <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, mb: 3 }}>
        <CardContent sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', p: 2, '&:last-child': { pb: 2 } }}>
          <TextField
            select size="small" label="Empresa" value={filtroEmpresa}
            onChange={e => { setFiltroEmpresa(e.target.value); setPage(0); }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Todas</MenuItem>
            {empresas.map(emp => (
              <MenuItem key={emp.id} value={emp.id}>{emp.razao_social}</MenuItem>
            ))}
          </TextField>
          <TextField
            select size="small" label="Tipo de Pedido" value={filtroTipo}
            onChange={e => { setFiltroTipo(e.target.value); setPage(0); }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {TIPOS_PEDIDO.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
          </TextField>
          <TextField
            select size="small" label="Status" value={filtroStatus}
            onChange={e => { setFiltroStatus(e.target.value); setPage(0); }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="">Todos</MenuItem>
            {STATUS_OPTIONS.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </TextField>
        </CardContent>
      </Card>

      <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress sx={{ color: T.cyan }} />
          </Box>
        ) : pedidos.length === 0 ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <Typography sx={{ color: T.textSecond }}>Nenhum pedido encontrado.</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }}>#ID</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }}>Empresa</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }}>Tipo</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }} align="right">Valor Crédito</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }} align="right">Valor Débito</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }}>Criado em</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem' }} align="center">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pedidos.map(p => (
                    <TableRow
                      key={p.id}
                      hover
                      sx={{ cursor: 'pointer', '&:hover': { bgcolor: 'rgba(0,200,240,0.04)' } }}
                      onClick={() => abrirDetalhes(p)}
                    >
                      <TableCell sx={{ fontWeight: 600, color: T.textPrimary }}>#{p.id}</TableCell>
                      <TableCell>
                        <Typography sx={{ fontSize: '0.8125rem', color: T.textPrimary }}>{p.empresa_razao_social}</Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>{p.empresa_cnpj}</Typography>
                      </TableCell>
                      <TableCell sx={{ color: T.textPrimary }}>{p.tipo_pedido}</TableCell>
                      <TableCell>
                        <Chip
                          label={p.status}
                          size="small"
                          color={statusColor[p.status] || 'default'}
                          sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                        />
                      </TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{brl(p.valor_total_credito)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{brl(p.valor_total_debito)}</TableCell>
                      <TableCell sx={{ color: T.textSecond }}>{fmtDate(p.criado_em)}</TableCell>
                      <TableCell align="center" onClick={e => e.stopPropagation()}>
                        <Tooltip title="Visualizar">
                          <IconButton size="small" onClick={() => abrirDetalhes(p)}>
                            <ViewIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        {p.status === 'Rascunho' && (
                          <Tooltip title="Excluir">
                            <IconButton size="small" color="error" onClick={() => openDeleteConfirm(p)}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={total}
              page={page}
              rowsPerPage={rowsPerPage}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
              rowsPerPageOptions={[5, 10, 25, 50]}
              labelRowsPerPage="Linhas por página:"
              labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`}
            />
          </>
        )}
      </Card>

      {/* Detail Dialog */}
      <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} maxWidth="md" fullWidth>
        {detailLoading || !selectedPedido ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
            <CircularProgress sx={{ color: T.cyan }} />
          </Box>
        ) : (
          <>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box>
                <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: T.textPrimary }}>
                  Pedido #{selectedPedido.id}
                </Typography>
                <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                  {selectedPedido.tipo_pedido} &bull; {selectedPedido.empresa_razao_social}
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={selectedPedido.status}
                  color={statusColor[selectedPedido.status] || 'default'}
                  sx={{ fontWeight: 600 }}
                />
                <IconButton size="small" onClick={() => setDetailOpen(false)}>
                  <CloseIcon />
                </IconButton>
              </Box>
            </DialogTitle>
            <DialogContent dividers>
              <Box sx={{ mb: 3 }}>
                <Stepper activeStep={statusToStep(selectedPedido.status)} alternativeLabel>
                  {stepLabels.map(label => (
                    <Step key={label}>
                      <StepLabel>{label}</StepLabel>
                    </Step>
                  ))}
                </Stepper>
              </Box>

              <Box sx={{ display: 'flex', gap: 3, mb: 2, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Nº Processo</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{selectedPedido.numero_processo || '—'}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Valor Crédito</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{brl(selectedPedido.valor_total_credito)}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Valor Débito</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{brl(selectedPedido.valor_total_debito)}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Transmissão</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{fmtDate(selectedPedido.dt_transmissao)}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Decisão</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{fmtDate(selectedPedido.dt_decisao)}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Criado em</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{fmtDate(selectedPedido.criado_em)}</Typography>
                </Box>
              </Box>

              {selectedPedido.motivo_indeferimento && (
                <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>
                  <strong>Motivo:</strong> {selectedPedido.motivo_indeferimento}
                </Alert>
              )}

              <Divider sx={{ mb: 1 }} />

              <Tabs value={detailTab} onChange={(_, v) => setDetailTab(v)} sx={{ mb: 1 }}>
                <Tab label="Itens" sx={{ textTransform: 'none', fontWeight: 600 }} />
                <Tab label="Histórico" sx={{ textTransform: 'none', fontWeight: 600 }} />
                <Tab label="Documentos" sx={{ textTransform: 'none', fontWeight: 600 }} />
              </Tabs>

              <TabPanel value={detailTab} index={0}>
                {(!selectedPedido.itens || selectedPedido.itens.length === 0) ? (
                  <Typography sx={{ color: T.textSecond, py: 2 }}>Nenhum item vinculado.</Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Referência</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Período</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }} align="right">Valor Utilizado</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedPedido.itens.map((item: PerdcompPedidoItem) => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Chip
                                label={item.tipo_item === 'credito' ? 'Crédito' : 'Débito'}
                                size="small"
                                color={item.tipo_item === 'credito' ? 'success' : 'error'}
                                variant="outlined"
                                sx={{ fontWeight: 600, fontSize: '0.75rem' }}
                              />
                            </TableCell>
                            <TableCell>{item.credito_tipo || item.debito_tipo || '—'}</TableCell>
                            <TableCell>{item.credito_periodo || item.debito_periodo || '—'}</TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>
                              {brl(item.valor_utilizado)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </TabPanel>

              <TabPanel value={detailTab} index={1}>
                {(!selectedPedido.historico || selectedPedido.historico.length === 0) ? (
                  <Typography sx={{ color: T.textSecond, py: 2 }}>Nenhum evento registrado.</Typography>
                ) : (
                  <Box sx={{ pl: 2, borderLeft: `2px solid ${T.border}` }}>
                    {selectedPedido.historico.map((h: PerdcompHistorico) => (
                      <Box key={h.id} sx={{ mb: 2, position: 'relative' }}>
                        <Box
                          sx={{
                            position: 'absolute', left: -11, top: 4,
                            width: 8, height: 8, borderRadius: '50%',
                            bgcolor: T.cyan, border: `2px solid ${T.surface}`,
                          }}
                        />
                        <Typography sx={{ fontWeight: 600, fontSize: '0.875rem', color: T.textPrimary, ml: 1 }}>
                          {h.acao}
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', color: T.textSecond, ml: 1 }}>
                          {h.usuario_nome} &bull; {fmtDate(h.criado_em)}
                        </Typography>
                        {h.detalhes && (
                          <Typography sx={{ fontSize: '0.8125rem', color: T.textPrimary, ml: 1, mt: 0.5 }}>
                            {h.detalhes}
                          </Typography>
                        )}
                      </Box>
                    ))}
                  </Box>
                )}
              </TabPanel>

              <TabPanel value={detailTab} index={2}>
                {(!selectedPedido.documentos || selectedPedido.documentos.length === 0) ? (
                  <Typography sx={{ color: T.textSecond, py: 2 }}>Nenhum documento anexado.</Typography>
                ) : (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Arquivo</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tamanho</TableCell>
                          <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Data</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {selectedPedido.documentos.map((doc: PerdcompDocumento) => (
                          <TableRow key={doc.id}>
                            <TableCell>{doc.tipo_documento}</TableCell>
                            <TableCell sx={{ fontWeight: 600 }}>{doc.nome_arquivo}</TableCell>
                            <TableCell>{(doc.tamanho_bytes / 1024).toFixed(1)} KB</TableCell>
                            <TableCell>{fmtDate(doc.criado_em)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                )}
              </TabPanel>
            </DialogContent>
            <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
              {selectedPedido.status === 'Rascunho' && (
                <>
                  <Button
                    variant="outlined" color="error" startIcon={<DeleteIcon />}
                    onClick={() => openDeleteConfirm(selectedPedido)}
                    sx={{ textTransform: 'none', borderRadius: '8px' }}
                  >
                    Excluir
                  </Button>
                  <Button
                    variant="contained" startIcon={<SendIcon />}
                    onClick={handleTransmitir}
                    disabled={actionLoading}
                    sx={{
                      bgcolor: T.cyan, color: T.navy, fontWeight: 600,
                      textTransform: 'none', borderRadius: '8px',
                      '&:hover': { bgcolor: '#00b5d8' },
                    }}
                  >
                    {actionLoading ? <CircularProgress size={20} /> : 'Transmitir'}
                  </Button>
                </>
              )}
              {selectedPedido.status !== 'Rascunho' && selectedPedido.status !== 'Cancelado' && (
                <>
                  <Button
                    variant="outlined" startIcon={<CheckIcon />}
                    onClick={() => { setNewStatus('Deferido'); setStatusDialogOpen(true); }}
                    sx={{ textTransform: 'none', borderRadius: '8px', color: '#2e7d32', borderColor: '#2e7d32' }}
                  >
                    Deferir
                  </Button>
                  <Button
                    variant="outlined" startIcon={<CancelIcon />}
                    onClick={() => { setNewStatus('Indeferido'); setStatusDialogOpen(true); }}
                    sx={{ textTransform: 'none', borderRadius: '8px', color: '#d32f2f', borderColor: '#d32f2f' }}
                  >
                    Indeferir
                  </Button>
                  <Button
                    variant="outlined"
                    onClick={() => { setNewStatus('Em Análise'); setStatusDialogOpen(true); }}
                    sx={{ textTransform: 'none', borderRadius: '8px' }}
                  >
                    Em Análise
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onClose={() => setStatusDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Alterar Status</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2, color: T.textSecond }}>
            Confirma a alteração do status para <strong>{newStatus}</strong>?
          </Typography>
          {(newStatus === 'Indeferido' || newStatus === 'Não Homologado') && (
            <TextField
              fullWidth multiline rows={3}
              label="Motivo do indeferimento"
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              sx={{ mt: 1 }}
            />
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setStatusDialogOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleChangeStatus}
            disabled={actionLoading || ((newStatus === 'Indeferido' || newStatus === 'Não Homologado') && !motivo.trim())}
            sx={{
              bgcolor: T.cyan, color: T.navy, fontWeight: 600,
              textTransform: 'none', borderRadius: '8px',
              '&:hover': { bgcolor: '#00b5d8' },
            }}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Confirmar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirmOpen} onClose={() => setDeleteConfirmOpen(false)} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ fontWeight: 700 }}>Excluir Pedido</DialogTitle>
        <DialogContent>
          <Typography sx={{ color: T.textSecond }}>
            Tem certeza que deseja excluir o pedido <strong>#{pedidoToDelete?.id}</strong>? Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setDeleteConfirmOpen(false)} sx={{ textTransform: 'none' }}>Cancelar</Button>
          <Button
            variant="contained" color="error"
            onClick={handleDelete}
            disabled={actionLoading}
            sx={{ textTransform: 'none', borderRadius: '8px', fontWeight: 600 }}
          >
            {actionLoading ? <CircularProgress size={20} /> : 'Excluir'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
