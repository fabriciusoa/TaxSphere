import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Card, CardContent, Typography, Button, TextField, Chip, IconButton,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  TablePagination, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Alert, CircularProgress,
  Tooltip, Grid, Divider, alpha,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  Add as AddIcon, Edit as EditIcon, Delete as DeleteIcon,
  Refresh as RefreshIcon, Search as SearchIcon, Receipt as ReceiptIcon,
  CheckCircle as CheckIcon, Info as InfoIcon, CloudSync as CloudSyncIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import dctfwebService, { DctfWebDeclaracao } from '../../services/dctfwebService';
import { perdcompService } from '../../services/perdcompService';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '-';

const situacaoColor: Record<string, 'success' | 'warning' | 'info' | 'error' | 'default'> = {
  'Ativa': 'success', 'Em Andamento': 'warning', 'Retificada': 'info',
  'Excluída': 'error', 'Inativa': 'default', 'Sem Movimento': 'default',
};

const categorias = [
  'Mensal', 'Anual (13º salário)', 'Diária (Espetáculo Desportivo)',
  'Sem Movimento', 'Retificadora',
];

export default function DeclaracoesPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [declaracoes, setDeclaracoes] = useState<DctfWebDeclaracao[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [empresas, setEmpresas] = useState<any[]>([]);
  const [filtroEmpresa, setFiltroEmpresa] = useState('');
  const [filtroSituacao, setFiltroSituacao] = useState('');
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [openModal, setOpenModal] = useState(false);
  const [openDetail, setOpenDetail] = useState(false);
  const [editando, setEditando] = useState<DctfWebDeclaracao | null>(null);
  const [detalhes, setDetalhes] = useState<DctfWebDeclaracao | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalErro, setModalErro] = useState('');
  const [form, setForm] = useState({
    id_empresa: '', categoria: 'Mensal', periodo_apuracao: '',
    situacao: 'Em Andamento', debito_apurado: 0, credito_vinculado: 0,
    saldo_pagar: 0, data_transmissao: '', numero_recibo: '', observacoes: '',
  });

  const [openDarf, setOpenDarf] = useState(false);
  const [darfDecl, setDarfDecl] = useState<DctfWebDeclaracao | null>(null);
  const [darfForm, setDarfForm] = useState({ codigo: '', vencimento: '', valor: 0 });

  const empresasLoadedRef = useRef(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const promises: [ReturnType<typeof dctfwebService.listar>, Promise<any[]>?] = [
        dctfwebService.listar({
          id_empresa: filtroEmpresa ? Number(filtroEmpresa) : undefined,
          situacao: filtroSituacao || undefined,
          busca: busca || undefined,
          page: page + 1,
          limit: rowsPerPage,
        }),
      ];
      if (!empresasLoadedRef.current) {
        promises.push(perdcompService.empresas.listar());
      }
      const [res, emps] = await Promise.all(promises);
      setDeclaracoes(res.data);
      setTotal(res.pagination.total);
      if (emps) {
        setEmpresas(emps);
        empresasLoadedRef.current = true;
      }
    } catch {
      setErro('Erro ao carregar declarações');
    } finally {
      setLoading(false);
    }
  }, [filtroEmpresa, filtroSituacao, busca, page, rowsPerPage]);

  useEffect(() => { carregar(); }, [carregar]);

  const resetForm = () => {
    setForm({
      id_empresa: '', categoria: 'Mensal', periodo_apuracao: '',
      situacao: 'Em Andamento', debito_apurado: 0, credito_vinculado: 0,
      saldo_pagar: 0, data_transmissao: '', numero_recibo: '', observacoes: '',
    });
    setEditando(null);
    setModalErro('');
  };

  const handleOpen = (decl?: DctfWebDeclaracao) => {
    if (decl) {
      setEditando(decl);
      setForm({
        id_empresa: decl.id_empresa.toString(),
        categoria: decl.categoria,
        periodo_apuracao: decl.periodo_apuracao,
        situacao: decl.situacao,
        debito_apurado: decl.debito_apurado,
        credito_vinculado: decl.credito_vinculado,
        saldo_pagar: decl.saldo_pagar,
        data_transmissao: decl.data_transmissao || '',
        numero_recibo: decl.numero_recibo || '',
        observacoes: decl.observacoes || '',
      });
    } else {
      resetForm();
    }
    setOpenModal(true);
  };

  const handleSalvar = async () => {
    if (!form.id_empresa || !form.periodo_apuracao) {
      setModalErro('Empresa e período de apuração são obrigatórios');
      return;
    }
    setSaving(true);
    setModalErro('');
    try {
      const payload = {
        ...form,
        id_empresa: Number(form.id_empresa),
        debito_apurado: Number(form.debito_apurado),
        credito_vinculado: Number(form.credito_vinculado),
        saldo_pagar: Number(form.saldo_pagar),
        data_transmissao: form.data_transmissao || null,
        numero_recibo: form.numero_recibo || null,
        observacoes: form.observacoes || null,
      };
      if (editando) {
        await dctfwebService.atualizar(editando.id, payload);
        setSucesso('Declaração atualizada');
      } else {
        await dctfwebService.criar(payload);
        setSucesso('Declaração criada');
      }
      setOpenModal(false);
      resetForm();
      carregar();
    } catch (error: any) {
      const resData = error.response?.data;
      setModalErro(resData?.error || resData?.message || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleExcluir = async (id: number) => {
    if (!window.confirm('Excluir esta declaração?')) return;
    try {
      await dctfwebService.excluir(id);
      setSucesso('Declaração excluída');
      carregar();
    } catch {
      setErro('Erro ao excluir');
    }
  };

  const handleVerDetalhes = async (id: number) => {
    try {
      const d = await dctfwebService.buscarPorId(id);
      setDetalhes(d);
      setOpenDetail(true);
    } catch {
      setErro('Erro ao carregar detalhes');
    }
  };

  const handleGerarDarf = async () => {
    if (!darfDecl) return;
    try {
      await dctfwebService.gerarDarf(darfDecl.id, {
        codigo: darfForm.codigo,
        vencimento: darfForm.vencimento,
        valor: darfForm.valor || darfDecl.saldo_pagar,
      });
      setSucesso('DARF gerado');
      setOpenDarf(false);
      carregar();
    } catch {
      setErro('Erro ao gerar DARF');
    }
  };

  const handleMarcarPago = async (id: number) => {
    try {
      await dctfwebService.marcarPago(id);
      setSucesso('DARF marcado como pago');
      carregar();
    } catch {
      setErro('Erro ao marcar pago');
    }
  };

  return (
    <Box>
      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>{sucesso}</Alert>}

      {/* Filtros */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)', mb: 3 }}>
        <CardContent sx={{ p: 2.5 }}>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel>Empresa</InputLabel>
              <Select value={filtroEmpresa} label="Empresa"
                onChange={(e: SelectChangeEvent) => { setFiltroEmpresa(e.target.value); setPage(0); }}>
                <MenuItem value="">Todas</MenuItem>
                {empresas.map(e => (
                  <MenuItem key={e.id} value={e.id.toString()}>{e.razao_social}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl size="small" sx={{ minWidth: 160 }}>
              <InputLabel>Situação</InputLabel>
              <Select value={filtroSituacao} label="Situação"
                onChange={(e: SelectChangeEvent) => { setFiltroSituacao(e.target.value); setPage(0); }}>
                <MenuItem value="">Todas</MenuItem>
                {['Ativa', 'Em Andamento', 'Retificada', 'Excluída', 'Inativa', 'Sem Movimento'].map(s => (
                  <MenuItem key={s} value={s}>{s}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField size="small" placeholder="Buscar..." value={busca}
              onChange={(e) => { setBusca(e.target.value); setPage(0); }}
              InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1, color: 'text.secondary' }} /> }}
              sx={{ minWidth: 200 }} />
            <Box sx={{ flex: 1 }} />
            <Tooltip title="Importar via eCAC">
              <Button variant="outlined" startIcon={<CloudSyncIcon />} size="small"
                onClick={() => navigate('/configuracoes/ecac')}>
                Importar eCAC
              </Button>
            </Tooltip>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpen()}
              sx={{ borderRadius: 2 }}>
              Nova Declaração
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
        {loading && <Box sx={{ px: 3, pt: 2 }}><CircularProgress size={24} /></Box>}
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f5f5' } }}>
                <TableCell>Empresa</TableCell>
                <TableCell>Categoria</TableCell>
                <TableCell>Período</TableCell>
                <TableCell align="center">Situação</TableCell>
                <TableCell align="right">Débito</TableCell>
                <TableCell align="right">Saldo a Pagar</TableCell>
                <TableCell align="center">DARF</TableCell>
                <TableCell align="center">Origem</TableCell>
                <TableCell align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {declaracoes.map(d => (
                <TableRow key={d.id} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 200 }}>
                      {d.razao_social}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{d.cnpj}</Typography>
                  </TableCell>
                  <TableCell><Typography variant="body2">{d.categoria}</Typography></TableCell>
                  <TableCell><Typography variant="body2" fontWeight={500}>{d.periodo_apuracao}</Typography></TableCell>
                  <TableCell align="center">
                    <Chip label={d.situacao} size="small"
                      color={situacaoColor[d.situacao] || 'default'} variant="outlined" />
                  </TableCell>
                  <TableCell align="right">{formatCurrency(d.debito_apurado)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: d.saldo_pagar > 0 ? 'error.main' : 'success.main' }}>
                    {formatCurrency(d.saldo_pagar)}
                  </TableCell>
                  <TableCell align="center">
                    {d.darf_pago ? (
                      <Chip icon={<CheckIcon />} label="Pago" size="small" color="success" variant="filled" sx={{ fontSize: 11 }} />
                    ) : d.darf_gerado ? (
                      <Chip label={formatDate(d.darf_vencimento)} size="small" color="warning" variant="outlined" sx={{ fontSize: 11 }} />
                    ) : (
                      <Typography variant="caption" color="text.secondary">-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Chip label={d.origem} size="small" variant="outlined"
                      color={d.origem === 'eCAC' ? 'info' : 'default'} sx={{ fontSize: 11 }} />
                  </TableCell>
                  <TableCell align="center">
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                      <Tooltip title="Detalhes">
                        <IconButton size="small" onClick={() => handleVerDetalhes(d.id)}>
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton size="small" color="primary" onClick={() => handleOpen(d)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      {!d.darf_gerado && d.saldo_pagar > 0 && (
                        <Tooltip title="Gerar DARF">
                          <IconButton size="small" color="warning"
                            onClick={() => { setDarfDecl(d); setDarfForm({ codigo: '', vencimento: '', valor: d.saldo_pagar }); setOpenDarf(true); }}>
                            <ReceiptIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      {d.darf_gerado && !d.darf_pago && (
                        <Tooltip title="Marcar como pago">
                          <IconButton size="small" color="success" onClick={() => handleMarcarPago(d.id)}>
                            <CheckIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="Excluir">
                        <IconButton size="small" color="error" onClick={() => handleExcluir(d.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  </TableCell>
                </TableRow>
              ))}
              {declaracoes.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={9} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                    Nenhuma declaração encontrada
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination component="div" count={total} page={page} rowsPerPage={rowsPerPage}
          onPageChange={(_e, p) => setPage(p)}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          labelRowsPerPage="Linhas:" rowsPerPageOptions={[10, 15, 25, 50]}
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} de ${count}`} />
      </Card>

      {/* Modal Nova/Editar */}
      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 600 }}>
          {editando ? 'Editar Declaração' : 'Nova Declaração'}
        </DialogTitle>
        <DialogContent>
          {modalErro && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setModalErro('')}>{modalErro}</Alert>}
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Empresa *</InputLabel>
                <Select value={form.id_empresa} label="Empresa *"
                  onChange={(e: SelectChangeEvent) => setForm(prev => ({ ...prev, id_empresa: e.target.value }))}>
                  {empresas.map(e => (
                    <MenuItem key={e.id} value={e.id.toString()}>{e.razao_social}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth size="small">
                <InputLabel>Categoria *</InputLabel>
                <Select value={form.categoria} label="Categoria *"
                  onChange={(e: SelectChangeEvent) => setForm(prev => ({ ...prev, categoria: e.target.value }))}>
                  {categorias.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Período Apuração *" placeholder="YYYY-MM"
                value={form.periodo_apuracao}
                onChange={(e) => setForm(prev => ({ ...prev, periodo_apuracao: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel>Situação</InputLabel>
                <Select value={form.situacao} label="Situação"
                  onChange={(e: SelectChangeEvent) => setForm(prev => ({ ...prev, situacao: e.target.value }))}>
                  {['Em Andamento', 'Ativa', 'Retificada', 'Excluída', 'Inativa', 'Sem Movimento'].map(s =>
                    <MenuItem key={s} value={s}>{s}</MenuItem>
                  )}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Nº Recibo" value={form.numero_recibo}
                onChange={(e) => setForm(prev => ({ ...prev, numero_recibo: e.target.value }))} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Débito Apurado" type="number"
                value={form.debito_apurado}
                onChange={(e) => {
                  const deb = Number(e.target.value);
                  setForm(prev => ({ ...prev, debito_apurado: deb, saldo_pagar: deb - prev.credito_vinculado }));
                }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Crédito Vinculado" type="number"
                value={form.credito_vinculado}
                onChange={(e) => {
                  const cred = Number(e.target.value);
                  setForm(prev => ({ ...prev, credito_vinculado: cred, saldo_pagar: prev.debito_apurado - cred }));
                }} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField fullWidth size="small" label="Saldo a Pagar" type="number"
                value={form.saldo_pagar} InputProps={{ readOnly: true }}
                sx={{ '& .MuiInputBase-input': { bgcolor: '#f5f5f5' } }} />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField fullWidth size="small" label="Data Transmissão" type="date"
                value={form.data_transmissao} InputLabelProps={{ shrink: true }}
                onChange={(e) => setForm(prev => ({ ...prev, data_transmissao: e.target.value }))} />
            </Grid>
            <Grid item xs={12}>
              <TextField fullWidth size="small" label="Observações" multiline rows={2}
                value={form.observacoes}
                onChange={(e) => setForm(prev => ({ ...prev, observacoes: e.target.value }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenModal(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSalvar} disabled={saving}
            startIcon={saving ? <CircularProgress size={16} /> : undefined}>
            {saving ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal Detalhes */}
      <Dialog open={openDetail} onClose={() => setOpenDetail(false)} maxWidth="md" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 600 }}>Detalhes da Declaração</DialogTitle>
        <DialogContent>
          {detalhes && (
            <Box>
              <Grid container spacing={2} sx={{ mt: 0.5 }}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="caption" color="text.secondary">Empresa</Typography>
                  <Typography variant="body1" fontWeight={600}>{detalhes.razao_social}</Typography>
                  <Typography variant="caption" color="text.secondary">{detalhes.cnpj}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Categoria</Typography>
                  <Typography variant="body1">{detalhes.categoria}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Período</Typography>
                  <Typography variant="body1" fontWeight={600}>{detalhes.periodo_apuracao}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Situação</Typography>
                  <Box><Chip label={detalhes.situacao} size="small" color={situacaoColor[detalhes.situacao] || 'default'} /></Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Origem</Typography>
                  <Box><Chip label={detalhes.origem} size="small" variant="outlined" /></Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Transmissão</Typography>
                  <Typography variant="body1">{formatDate(detalhes.data_transmissao)}</Typography>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Typography variant="caption" color="text.secondary">Nº Recibo</Typography>
                  <Typography variant="body1">{detalhes.numero_recibo || '-'}</Typography>
                </Grid>
              </Grid>

              <Divider sx={{ my: 2 }} />
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Card sx={{ p: 2, bgcolor: alpha('#e65100', 0.06), borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Débito Apurado</Typography>
                    <Typography variant="h6" fontWeight={700} color="#e65100">{formatCurrency(detalhes.debito_apurado)}</Typography>
                  </Card>
                </Grid>
                <Grid item xs={4}>
                  <Card sx={{ p: 2, bgcolor: alpha('#2e7d32', 0.06), borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Crédito Vinculado</Typography>
                    <Typography variant="h6" fontWeight={700} color="#2e7d32">{formatCurrency(detalhes.credito_vinculado)}</Typography>
                  </Card>
                </Grid>
                <Grid item xs={4}>
                  <Card sx={{ p: 2, bgcolor: alpha('#d32f2f', 0.06), borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">Saldo a Pagar</Typography>
                    <Typography variant="h6" fontWeight={700} color="#d32f2f">{formatCurrency(detalhes.saldo_pagar)}</Typography>
                  </Card>
                </Grid>
              </Grid>

              {/* DARF */}
              {detalhes.darf_gerado ? (
                <Box sx={{ mt: 2, p: 2, borderRadius: 2, border: '1px solid #e0e0e0', bgcolor: detalhes.darf_pago ? '#e8f5e9' : '#fff8e1' }}>
                  <Typography variant="subtitle2" fontWeight={600}>
                    <ReceiptIcon sx={{ fontSize: 16, mr: 0.5, verticalAlign: 'text-bottom' }} />
                    DARF {detalhes.darf_pago ? '(Pago)' : '(Pendente)'}
                  </Typography>
                  <Box sx={{ display: 'flex', gap: 3, mt: 1 }}>
                    <Box><Typography variant="caption" color="text.secondary">Código</Typography><Typography>{detalhes.darf_codigo || '-'}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Vencimento</Typography><Typography>{formatDate(detalhes.darf_vencimento)}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">Valor</Typography><Typography fontWeight={700}>{formatCurrency(detalhes.darf_valor || 0)}</Typography></Box>
                  </Box>
                </Box>
              ) : null}

              {/* Tributos */}
              {detalhes.tributos && detalhes.tributos.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="subtitle2" fontWeight={600} gutterBottom>Tributos</Typography>
                  <TableContainer component={Paper} variant="outlined">
                    <Table size="small">
                      <TableHead>
                        <TableRow sx={{ '& th': { fontWeight: 600, bgcolor: '#f5f5f5' } }}>
                          <TableCell>Cód. Receita</TableCell>
                          <TableCell>Descrição</TableCell>
                          <TableCell align="right">Principal</TableCell>
                          <TableCell align="right">Multa</TableCell>
                          <TableCell align="right">Juros</TableCell>
                          <TableCell align="right">Total</TableCell>
                          <TableCell align="right">Saldo</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {detalhes.tributos.map(t => (
                          <TableRow key={t.id}>
                            <TableCell>{t.codigo_receita}</TableCell>
                            <TableCell>{t.descricao || '-'}</TableCell>
                            <TableCell align="right">{formatCurrency(t.valor_principal)}</TableCell>
                            <TableCell align="right">{formatCurrency(t.valor_multa)}</TableCell>
                            <TableCell align="right">{formatCurrency(t.valor_juros)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600 }}>{formatCurrency(t.valor_total)}</TableCell>
                            <TableCell align="right" sx={{ fontWeight: 600, color: t.saldo > 0 ? 'error.main' : 'success.main' }}>
                              {formatCurrency(t.saldo)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {detalhes.observacoes && (
                <Box sx={{ mt: 2, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                  <Typography variant="caption" color="text.secondary">Observações</Typography>
                  <Typography variant="body2">{detalhes.observacoes}</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenDetail(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal Gerar DARF */}
      <Dialog open={openDarf} onClose={() => setOpenDarf(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 600 }}>
          <ReceiptIcon sx={{ mr: 1, verticalAlign: 'text-bottom' }} />
          Gerar DARF
        </DialogTitle>
        <DialogContent>
          {darfDecl && (
            <Box sx={{ mt: 1 }}>
              <Alert severity="info" sx={{ mb: 2 }}>
                {darfDecl.razao_social} · {darfDecl.categoria} · {darfDecl.periodo_apuracao}
              </Alert>
              <Grid container spacing={2}>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Código Receita" value={darfForm.codigo}
                    onChange={(e) => setDarfForm(prev => ({ ...prev, codigo: e.target.value }))} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Vencimento" type="date"
                    value={darfForm.vencimento} InputLabelProps={{ shrink: true }}
                    onChange={(e) => setDarfForm(prev => ({ ...prev, vencimento: e.target.value }))} />
                </Grid>
                <Grid item xs={12} sm={4}>
                  <TextField fullWidth size="small" label="Valor" type="number"
                    value={darfForm.valor}
                    onChange={(e) => setDarfForm(prev => ({ ...prev, valor: Number(e.target.value) }))} />
                </Grid>
              </Grid>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setOpenDarf(false)}>Cancelar</Button>
          <Button variant="contained" color="warning" onClick={handleGerarDarf}>Gerar DARF</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
