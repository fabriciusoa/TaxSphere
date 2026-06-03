import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, Stack, Chip, Alert, CircularProgress, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
  ToggleButton, ToggleButtonGroup, Pagination, Tooltip, IconButton, Checkbox,
  Dialog, DialogTitle, DialogContent, DialogActions, TextField,
} from '@mui/material';
import {
  Refresh as RefreshIcon, CheckCircle as PaidIcon, PictureAsPdf as PdfIcon,
  ReceiptLong as DarfIcon, AccountBalance as MaedIcon, Inventory2 as BatchIcon,
} from '@mui/icons-material';
import { dctfwebService, type DctfwebDarf } from '../../services/dctfwebService';
import { useEmpresa } from '../../contexts/EmpresaContext';

const T = { navy: '#0a1628', cyan: '#00c8f0', textSecond: '#64748b', emerald: '#22c55e', amber: '#d29922', red: '#ef4444' };

function brl(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function DarfsPage() {
  const { empresaId } = useEmpresa();
  const [items, setItems] = useState<DctfwebDarf[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [filtro, setFiltro] = useState<'pendente' | 'vencido' | 'pago' | ''>('pendente');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [pagarDialogId, setPagarDialogId] = useState<number | null>(null);
  const [valorPago, setValorPago] = useState('');
  const [pagoEm, setPagoEm] = useState(new Date().toISOString().substring(0, 10));

  // Seleção múltipla para DARF em lote (manual cap. 16.1.1)
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());

  // Relatório MAED (manual cap. 5)
  const [maedTotal, setMaedTotal] = useState(0);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const [r, maed] = await Promise.all([
        dctfwebService.listarDarfs({
          id_empresa: empresaId ? Number(empresaId) : undefined,
          status: filtro || undefined,
          page,
          limit: 20,
        }),
        dctfwebService.relatorioMaed(empresaId ? Number(empresaId) : undefined).catch(() => ({ data: [], total_pendente: 0 })),
      ]);
      setItems(r.data);
      setTotalPages(r.pagination.totalPages);
      setTotal(r.pagination.total);
      setMaedTotal(maed.total_pendente || 0);
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao carregar DARFs');
    } finally { setLoading(false); }
  }, [empresaId, filtro, page]);
  useEffect(() => { carregar(); }, [carregar]);

  // Toggle seleção para emissão em lote
  const toggleSelecao = (id: number) => {
    setSelecionados(prev => {
      const novo = new Set(prev);
      if (novo.has(id)) novo.delete(id); else novo.add(id);
      return novo;
    });
  };
  const toggleSelecionarTodos = () => {
    const pendentes = items.filter(d => d.status !== 'PAGO').map(d => d.id);
    setSelecionados(prev => prev.size === pendentes.length ? new Set() : new Set(pendentes));
  };
  const handleEmitirEmLote = async () => {
    if (selecionados.size === 0) return;
    try {
      // Gera cada DARF marcando como "gerado". Numa integração com Sicalcweb seria
      // uma chamada batch única; por enquanto iteramos com Promise.allSettled.
      const results = await Promise.allSettled(
        Array.from(selecionados).map(id => dctfwebService.gerarDarf(id))
      );
      const okCount = results.filter(r => r.status === 'fulfilled').length;
      alert(`DARFs gerados em lote: ${okCount}/${selecionados.size}`);
      setSelecionados(new Set());
      carregar();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao emitir em lote');
    }
  };

  const handleGerar = async (id: number) => {
    try {
      await dctfwebService.gerarDarf(id);
      carregar();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao gerar');
    }
  };

  const handlePagar = async () => {
    if (!pagarDialogId) return;
    try {
      await dctfwebService.marcarDarfPago(pagarDialogId, {
        valor_pago: valorPago ? Number(valorPago) : undefined,
        pago_em: pagoEm,
      });
      setPagarDialogId(null); setValorPago('');
      carregar();
    } catch (e: any) {
      alert(e.response?.data?.error || 'Erro ao marcar pago');
    }
  };

  const totalSelecionado = items.reduce((acc, d) => acc + Number(d.total || 0), 0);

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>DCTF Web · DARFs</Typography>
        <Typography variant="body2" sx={{ color: T.textSecond }}>
          {total} DARF(s) {empresaId ? 'desta empresa' : 'no sistema'} · total na visão atual: <strong>{brl(totalSelecionado)}</strong>
        </Typography>
      </Box>

      {/* Painel MAED — manual cap. 5 (Multa por Atraso na Entrega da Declaração) */}
      {maedTotal > 0 && (
        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2, borderLeft: `4px solid ${T.amber}`, bgcolor: `${T.amber}08` }}>
          <Stack direction="row" alignItems="center" gap={1.5}>
            <MaedIcon sx={{ color: T.amber, fontSize: 32 }} />
            <Box sx={{ flex: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>
                MAED pendente: <Typography component="span" sx={{ color: T.amber, fontWeight: 700 }}>{brl(maedTotal)}</Typography>
              </Typography>
              <Typography variant="caption" sx={{ color: T.textSecond }}>
                Multas por Atraso na Entrega da Declaração — código de receita 5440-01 (manual cap. 5.1)
              </Typography>
            </Box>
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 2 }}>
        <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap">
          <ToggleButtonGroup
            size="small" exclusive value={filtro}
            onChange={(_, v) => { if (v !== null) { setFiltro(v); setPage(1); setSelecionados(new Set()); } }}
            sx={{ '& .Mui-selected': { bgcolor: `${T.cyan}22 !important`, color: `${T.cyan} !important`, fontWeight: 700 } }}
          >
            <ToggleButton value="">Todos</ToggleButton>
            <ToggleButton value="pendente">Pendentes</ToggleButton>
            <ToggleButton value="vencido">Vencidos</ToggleButton>
            <ToggleButton value="pago">Pagos</ToggleButton>
          </ToggleButtonGroup>
          {selecionados.size > 0 && (
            <Button
              variant="contained" size="small"
              startIcon={<BatchIcon />}
              onClick={handleEmitirEmLote}
              sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: '#00b0d8' }, textTransform: 'none', fontWeight: 700, borderRadius: '8px' }}
            >
              Emitir DARF em lote ({selecionados.size})
            </Button>
          )}
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Recarregar"><IconButton onClick={carregar} sx={{ color: T.cyan }}><RefreshIcon /></IconButton></Tooltip>
        </Stack>
        <Typography variant="caption" sx={{ color: T.textSecond, mt: 1, display: 'block' }}>
          ℹ️ Manual cap. 16.1.1: selecione múltiplos DARFs para emitir um único documento em lote (não permite ajuste no SISTAD).
        </Typography>
      </Paper>

      <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
        {loading ? (
          <Box display="flex" justifyContent="center" py={6}><CircularProgress sx={{ color: T.cyan }} /></Box>
        ) : erro ? (
          <Alert severity="error" sx={{ m: 2 }}>{erro}</Alert>
        ) : items.length === 0 ? (
          <Box textAlign="center" py={6}>
            <DarfIcon sx={{ fontSize: 48, color: T.cyan, opacity: 0.4, mb: 1 }} />
            <Typography variant="body1" sx={{ color: T.textSecond }}>Nenhum DARF encontrado.</Typography>
          </Box>
        ) : (
          <>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, width: 40 }}>
                      <Checkbox
                        size="small"
                        checked={selecionados.size > 0 && selecionados.size === items.filter(d => d.status !== 'PAGO').length}
                        indeterminate={selecionados.size > 0 && selecionados.size < items.filter(d => d.status !== 'PAGO').length}
                        onChange={toggleSelecionarTodos}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Empresa</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Receita</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Período</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Vencimento</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }} align="right">Total</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Status</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }} align="right">Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {items.map((d) => {
                    const cor = d.status === 'VENCIDO' ? T.red : d.status === 'PAGO' ? T.emerald : T.cyan;
                    const isMaed = d.codigo_receita === '5440-01';
                    return (
                      <TableRow key={d.id} hover sx={isMaed ? { bgcolor: `${T.amber}08` } : undefined}>
                        <TableCell>
                          <Checkbox
                            size="small"
                            checked={selecionados.has(d.id)}
                            onChange={() => toggleSelecao(d.id)}
                            disabled={d.status === 'PAGO'}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>{d.razao_social}</Typography>
                          <Typography variant="caption" sx={{ color: T.textSecond }}>{d.cnpj}</Typography>
                        </TableCell>
                        <TableCell>
                          <Stack direction="row" gap={0.5} alignItems="center">
                            <Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{d.codigo_receita}</Typography>
                            {isMaed && (
                              <Tooltip title="MAED — Multa por Atraso na Entrega da Declaração (manual cap. 5)">
                                <Chip size="small" label="MAED" sx={{ bgcolor: `${T.amber}22`, color: T.amber, fontWeight: 700, fontSize: 9, height: 18 }} />
                              </Tooltip>
                            )}
                          </Stack>
                          {d.denominacao && <Typography variant="caption" sx={{ color: T.textSecond, display: 'block', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.denominacao}</Typography>}
                        </TableCell>
                        <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{d.periodo_apuracao}</Typography></TableCell>
                        <TableCell>
                          <Typography variant="body2">{new Date(d.vencimento).toLocaleDateString('pt-BR')}</Typography>
                          {d.status === 'VENCIDO' && <Typography variant="caption" sx={{ color: T.red, fontWeight: 700 }}>vencido há {Math.abs(d.dias_para_vencer)} dias</Typography>}
                          {d.status === 'PENDENTE' && d.dias_para_vencer < 7 && <Typography variant="caption" sx={{ color: T.amber }}>vence em {d.dias_para_vencer} dias</Typography>}
                        </TableCell>
                        <TableCell align="right">
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>{brl(d.total)}</Typography>
                          {(d.multa > 0 || d.juros > 0) && (
                            <Typography variant="caption" sx={{ color: T.textSecond, display: 'block' }}>
                              + multa {brl(d.multa)} · juros {brl(d.juros)}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip size="small" label={d.status} sx={{ bgcolor: `${cor}22`, color: cor, fontWeight: 700, fontSize: 10 }} />
                          {d.gerado && d.status !== 'PAGO' && (
                            <Typography variant="caption" sx={{ display: 'block', color: T.textSecond }}>DARF gerado</Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {d.status !== 'PAGO' && !d.gerado && (
                            <Tooltip title="Marcar como gerado">
                              <IconButton size="small" onClick={() => handleGerar(d.id)} sx={{ color: T.cyan }}>
                                <PdfIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {d.status !== 'PAGO' && (
                            <Tooltip title="Marcar como pago">
                              <IconButton size="small" onClick={() => { setPagarDialogId(d.id); setValorPago(String(d.total)); }} sx={{ color: T.emerald }}>
                                <PaidIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            {totalPages > 1 && (
              <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
                <Pagination page={page} count={totalPages} onChange={(_, p) => setPage(p)} color="primary" />
              </Box>
            )}
          </>
        )}
      </Paper>

      <Dialog open={pagarDialogId !== null} onClose={() => setPagarDialogId(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Marcar DARF como pago</DialogTitle>
        <DialogContent>
          <Stack gap={2} mt={1}>
            <TextField label="Valor pago (R$)" value={valorPago} onChange={(e) => setValorPago(e.target.value)} size="small" type="number" />
            <TextField label="Data do pagamento" value={pagoEm} onChange={(e) => setPagoEm(e.target.value)} size="small" type="date" InputLabelProps={{ shrink: true }} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPagarDialogId(null)}>Cancelar</Button>
          <Button variant="contained" onClick={handlePagar} sx={{ bgcolor: T.emerald, '&:hover': { bgcolor: '#16a34a' } }}>Confirmar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
