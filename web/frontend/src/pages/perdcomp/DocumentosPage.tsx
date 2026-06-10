import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Box, Typography, Paper, Button, TextField, Chip, IconButton, Tooltip,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Stack, FormControl, InputLabel, Select, MenuItem, CircularProgress, Alert,
  InputAdornment, Tabs, Tab, Collapse,
} from '@mui/material';
import {
  Add, Search, Refresh, Edit, Delete, Send, CloudDownload, PictureAsPdf,
  ExpandMore, ExpandLess, FileDownload, ReceiptLong, AccountBalance, Link as LinkIcon,
  Pause, PlayArrow, Stop, DoNotDisturbAlt,
} from '@mui/icons-material';
import {
  perdcompDocumentosService, TIPOS_DOCUMENTO, TIPOS_CREDITO, STATUS_LABELS,
  type PerdcompDocumento,
} from '../../services/perdcompDocumentosService';
import {
  ecacService, type EcacPerdcompDocumento, type EcacDebitoCompensado,
} from '../../services/ecacService';
import { useEmpresa } from '../../contexts/EmpresaContext';
import { PerdcompProgressBanner } from '../../components/PerdcompProgressBanner';

const T = { navy: '#0a1628', cyan: '#00c8f0', cyanHover: '#00b0d8', textSecond: '#64748b' };

const fmt = (v?: number | null) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

const statusEcacColor = (s: string | null): 'default' | 'info' | 'success' | 'error' | 'warning' => {
  if (!s) return 'default';
  const v = s.toLowerCase();
  if (v.includes('ativo') || v.includes('análise') || v.includes('analise')) return 'info';
  if (v.includes('deferido') || v.includes('homologado')) return 'success';
  if (v.includes('indeferido') || v.includes('cancelado')) return 'error';
  if (v.includes('retificado')) return 'warning';
  return 'default';
};

const STATUS_NORM_LABELS: Record<string, string> = {
  EM_ANALISE: 'Em Análise',
  DEFERIDO: 'Deferido',
  PARCIALMENTE_DEFERIDO: 'Parc. Deferido',
  INDEFERIDO: 'Indeferido',
  HOMOLOGADO: 'Homologado',
  NAO_HOMOLOGADO: 'Não Homologado',
  PARCIALMENTE_HOMOLOGADO: 'Parc. Homologado',
  CANCELADO: 'Cancelado',
  RETIFICADO: 'Retificado',
  PENDENTE_DECISAO: 'Pendente',
  DESCONHECIDO: 'Desconhecido',
};

const STATUS_NORM_COLORS: Record<string, 'default' | 'info' | 'success' | 'error' | 'warning'> = {
  EM_ANALISE: 'info',
  DEFERIDO: 'success',
  PARCIALMENTE_DEFERIDO: 'success',
  INDEFERIDO: 'error',
  HOMOLOGADO: 'success',
  NAO_HOMOLOGADO: 'error',
  PARCIALMENTE_HOMOLOGADO: 'warning',
  CANCELADO: 'error',
  RETIFICADO: 'warning',
  PENDENTE_DECISAO: 'info',
  DESCONHECIDO: 'default',
};

export default function DocumentosPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { empresaId } = useEmpresa();
  const [tab, setTab] = useState(0);

  // ── Tab 0: documentos do sistema ───────────────────────────────────────────
  const [docs, setDocs] = useState<PerdcompDocumento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [filtros, setFiltros] = useState({
    id_empresa: empresaId as any, status: '', tipo_documento: '', numero: '',
    page: 1, limit: 20,
  });
  const [pagination, setPagination] = useState({ total: 0, totalPages: 0 });

  // ── Tab 1: importados do e-CAC ─────────────────────────────────────────────
  const [ecacDocs, setEcacDocs] = useState<EcacPerdcompDocumento[]>([]);
  const [loadingEcac, setLoadingEcac] = useState(false);
  const [filtroNumeroEcac, setFiltroNumeroEcac] = useState('');
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [debitosByDoc, setDebitosByDoc] = useState<Record<number, EcacDebitoCompensado[]>>({});
  const [reciboSyncId, setReciboSyncId] = useState<number | null>(null);
  const [reciboSyncStatus, setReciboSyncStatus] = useState<{ progresso: number; mensagem: string; total?: number; status?: string; pausado?: boolean } | null>(null);
  const reciboPollRef = useRef<number | null>(null);
  // Estado análogo para download dos PDFs do documento completo (clicado via ícone Imprimir).
  const [docSyncId, setDocSyncId] = useState<number | null>(null);
  const [docSyncStatus, setDocSyncStatus] = useState<{ progresso: number; mensagem: string; total?: number; status?: string; pausado?: boolean } | null>(null);
  const docPollRef = useRef<number | null>(null);

  // Estado para sincronização de saldos (background job + polling)
  const [saldoSyncId, setSaldoSyncId] = useState<number | null>(null);
  const [saldoSyncStatus, setSaldoSyncStatus] = useState<{ progresso: number; mensagem: string; status?: string } | null>(null);
  const saldoPollRef = useRef<number | null>(null);

  // Sync empresa filter with context
  useEffect(() => {
    setFiltros(p => ({ ...p, id_empresa: empresaId, page: 1 }));
    // Clear empresa-required validation errors when a company is selected
    if (empresaId) {
      setErro(prev => (prev.includes('empresa') ? '' : prev));
    }
  }, [empresaId]);

  // Aceita ?numero=<numero> vindo do Dashboard "Últimos Movimentos":
  // abre na aba e-CAC e pré-filtra pelo número do documento.
  useEffect(() => {
    const numero = searchParams.get('numero');
    if (numero) {
      setTab(1);
      setFiltroNumeroEcac(numero);
    }
  }, [searchParams]);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = { ...filtros };
      Object.keys(params).forEach(k => !params[k] && delete params[k]);
      const res = await perdcompDocumentosService.listar(params);
      setDocs(res.data);
      setPagination(res.pagination);
    } catch {
      setErro('Erro ao carregar documentos');
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  const carregarEcac = useCallback(async () => {
    // Sem empresa selecionada, NÃO buscar (evita receber docs de todas as empresas).
    // Zera a lista para o usuário ver claramente que precisa selecionar empresa.
    if (!empresaId) {
      setEcacDocs([]);
      return;
    }
    setLoadingEcac(true);
    // Limpa a lista anterior imediatamente para evitar mostrar dados da empresa antiga
    // durante o fetch da nova empresa.
    setEcacDocs([]);
    try {
      const data = await ecacService.perdcompDocumentos.listar(empresaId);
      setEcacDocs(data);
    } catch (err: any) {
      const detalhe = err?.response?.data?.error || err?.response?.statusText || err?.message || 'desconhecido';
      const status = err?.response?.status ? ` (HTTP ${err.response.status})` : '';
      setErro(`Erro ao carregar documentos e-CAC: ${detalhe}${status}`);
    } finally {
      setLoadingEcac(false);
    }
  }, [empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (tab === 1) carregarEcac();
  }, [tab, carregarEcac]);

  const handleExcluir = async (id: number) => {
    if (!window.confirm('Excluir este rascunho?')) return;
    try {
      await perdcompDocumentosService.excluir(id);
      setSucesso('Documento excluído');
      carregar();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao excluir');
    }
  };

  const handleEnviar = async (id: number) => {
    if (!window.confirm('Colocar este documento na fila de envio ao e-CAC?')) return;
    try {
      await perdcompDocumentosService.atualizarStatus(id, 'AGUARDANDO_ENVIO', { observacao: 'Envio solicitado pelo usuário' });
      setSucesso('Documento enviado para a fila');
      carregar();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao enviar');
    }
  };

  const ecacFiltrados = filtroNumeroEcac
    ? ecacDocs.filter(d => d.numero?.toLowerCase().includes(filtroNumeroEcac.toLowerCase()))
    : ecacDocs;

  // Conta só docs realmente baixáveis (exclui os pré-2018 indisponíveis no SERPRO).
  const pendentesRecibo = ecacDocs.filter(d => !d.tem_recibo && !d.recibo_indisponivel).length;
  const pendentesDocumento = ecacDocs.filter(d => !d.tem_documento && !d.documento_indisponivel).length;
  const indisponiveisRecibo = ecacDocs.filter(d => d.recibo_indisponivel).length;

  const handleExpand = useCallback(async (docId: number) => {
    if (expandedRow === docId) {
      setExpandedRow(null);
      return;
    }
    setExpandedRow(docId);
    if (!debitosByDoc[docId]) {
      try {
        const debs = await ecacService.perdcompDocumentos.debitosCompensados(docId);
        setDebitosByDoc(prev => ({ ...prev, [docId]: debs }));
      } catch {
        setDebitosByDoc(prev => ({ ...prev, [docId]: [] }));
      }
    }
  }, [expandedRow, debitosByDoc]);

  // Quando vem do Dashboard com ?numero=X e há exatamente um match, expande a linha.
  useEffect(() => {
    const numero = searchParams.get('numero');
    if (numero && ecacFiltrados.length === 1 && expandedRow !== ecacFiltrados[0].id) {
      handleExpand(ecacFiltrados[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, ecacFiltrados.length]);

  const stopPolling = useCallback(() => {
    if (reciboPollRef.current) {
      window.clearInterval(reciboPollRef.current);
      reciboPollRef.current = null;
    }
  }, []);

  const stopDocPolling = useCallback(() => {
    if (docPollRef.current) {
      window.clearInterval(docPollRef.current);
      docPollRef.current = null;
    }
  }, []);

  const iniciarPollingDocumentos = useCallback((syncId: number, totalInicial: number) => {
    stopDocPolling();
    docPollRef.current = window.setInterval(async () => {
      try {
        const s = await ecacService.sincronizacao.status(syncId);
        setDocSyncStatus({
          progresso: s.detalhes?.progresso ?? 0,
          mensagem: s.detalhes?.mensagem ?? s.status,
          total: (s.detalhes as any)?.total ?? totalInicial,
          status: s.status,
          pausado: (s.detalhes as any)?.pausado ?? false,
        });
        if (s.status === 'concluido' || s.status === 'erro' || s.status === 'cancelado') {
          stopDocPolling();
          await carregarEcac();
          const det: any = s.detalhes || {};
          if (s.status === 'concluido') {
            setErro('');
            setSucesso(`Documentos baixados: ${det.total_pdfs_baixados ?? 0}/${det.total_solicitados ?? '?'}`);
          } else if (s.status === 'cancelado') {
            setErro('');
            setSucesso(`Operação cancelada — ${det.total_pdfs_baixados ?? 0} documento(s) baixado(s).`);
            setDocSyncId(null);
            setDocSyncStatus(null);
          } else {
            const msg = s.erro_mensagem || 'erro desconhecido';
            if (/programa antigo|pré-PERDCOMP/i.test(msg)) {
              setErro(''); setSucesso(`Sincronização concluída. ${msg}`);
            } else {
              setSucesso(''); setErro(`Falha: ${msg}`);
            }
          }
        }
      } catch {
        stopDocPolling();
      }
    }, 3000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopDocPolling, carregarEcac]);

  const handleBaixarDocumentos = async () => {
    if (!empresaId) {
      setErro('Selecione uma empresa antes de baixar documentos.');
      return;
    }
    if (!window.confirm(`Iniciar download de ${pendentesDocumento} documento(s) PDF do e-CAC? Isso pode levar vários minutos.`)) return;
    try {
      const res = await ecacService.perdcompDocumentos.baixarDocumentos(empresaId, true);
      setDocSyncId(res.sync_id);
      setDocSyncStatus({ progresso: 0, mensagem: 'Iniciando...', total: res.total });
      setSucesso(`Download de documentos iniciado para ${res.total} item(ns)`);
      iniciarPollingDocumentos(res.sync_id, res.total);
    } catch (err: any) {
      const codigo = err.response?.data?.codigo;
      if (codigo === 'SESSAO_NAO_ENCONTRADA') {
        setErro('Sessão e-CAC não encontrada. Acesse a aba Certificados e clique em "Autenticar no e-CAC".');
      } else {
        setErro(err.response?.data?.error || 'Erro ao iniciar download de documentos');
      }
    }
  };

  // Inicia polling de status de uma sincronização de recibos.
  // Usado tanto após disparar uma nova sync quanto para retomar uma sync em andamento
  // quando o usuário volta para a página.
  const iniciarPollingRecibos = useCallback((syncId: number, totalInicial: number) => {
    stopPolling();
    reciboPollRef.current = window.setInterval(async () => {
      try {
        const s = await ecacService.sincronizacao.status(syncId);
        setReciboSyncStatus({
          progresso: s.detalhes?.progresso ?? 0,
          mensagem: s.detalhes?.mensagem ?? s.status,
          total: (s.detalhes as any)?.total ?? totalInicial,
          status: s.status,
          pausado: (s.detalhes as any)?.pausado ?? false,
        });
        if (s.status === 'concluido' || s.status === 'erro' || s.status === 'cancelado') {
          stopPolling();
          await carregarEcac();
          const det: any = s.detalhes || {};
          if (s.status === 'concluido') {
            setErro('');
            setSucesso(`Recibos baixados: ${det.total_pdfs_baixados ?? 0}/${det.total_solicitados ?? '?'} | Parse OK: ${det.parse_ok ?? 0} | Débitos: ${det.debitos_importados ?? 0}`);
          } else if (s.status === 'cancelado') {
            // Cancelamento: limpa estado para reabilitar botão e zerar barra
            setErro('');
            setSucesso(`Operação cancelada — ${det.total_pdfs_baixados ?? 0} recibo(s) baixado(s) até o momento.`);
            setReciboSyncId(null);
            setReciboSyncStatus(null);
          } else {
            const msg = s.erro_mensagem || 'erro desconhecido';
            // Mensagem informativa sobre docs antigos do programa desktop não é erro real
            if (/programa antigo|pré-PERDCOMP|recibos não disponíveis/i.test(msg)) {
              setErro('');
              setSucesso(`Sincronização concluída. ${msg}`);
            } else {
              setSucesso('');
              setErro(`Falha: ${msg}`);
            }
          }
        }
      } catch {
        stopPolling();
      }
    }, 3000);
  }, [stopPolling, carregarEcac]);

  // Ao montar a aba e-CAC ou trocar empresa: verifica se já há uma sync de recibos
  // em andamento e, em caso positivo, retoma o polling — mantendo o status bar visível.
  useEffect(() => {
    if (tab !== 1 || !empresaId) return;
    let cancel = false;
    (async () => {
      try {
        const ativa = await ecacService.sincronizacao.ativa(empresaId, 'recibos');
        if (cancel || !ativa) return;
        const det: any = ativa.detalhes || {};
        setReciboSyncId(ativa.id);
        setReciboSyncStatus({
          progresso: det.progresso ?? 0,
          mensagem: det.mensagem ?? ativa.status,
          total: det.total,
          status: ativa.status,
        });
        iniciarPollingRecibos(ativa.id, det.total ?? 0);
      } catch { /* silencioso — endpoint pode falhar */ }
    })();
    return () => { cancel = true; };
  }, [tab, empresaId, iniciarPollingRecibos]);

  // Idem para download de documentos (tipo='documentos')
  useEffect(() => {
    if (tab !== 1 || !empresaId) return;
    let cancel = false;
    (async () => {
      try {
        const ativa = await ecacService.sincronizacao.ativa(empresaId, 'documentos');
        if (cancel || !ativa) return;
        const det: any = ativa.detalhes || {};
        setDocSyncId(ativa.id);
        setDocSyncStatus({
          progresso: det.progresso ?? 0,
          mensagem: det.mensagem ?? ativa.status,
          total: det.total,
          status: ativa.status,
        });
        iniciarPollingDocumentos(ativa.id, det.total ?? 0);
      } catch { /* silencioso */ }
    })();
    return () => { cancel = true; };
  }, [tab, empresaId, iniciarPollingDocumentos]);

  const stopSaldoPolling = useCallback(() => {
    if (saldoPollRef.current) {
      window.clearInterval(saldoPollRef.current);
      saldoPollRef.current = null;
    }
  }, []);

  const iniciarPollingSaldos = useCallback((syncId: number) => {
    stopSaldoPolling();
    saldoPollRef.current = window.setInterval(async () => {
      try {
        const s = await ecacService.sincronizacao.status(syncId);
        const det: any = s.detalhes || {};
        setSaldoSyncStatus({
          progresso: det.progresso ?? 0,
          mensagem: det.mensagem ?? s.status,
          status: s.status,
        });
        if (s.status === 'concluido' || s.status === 'erro' || s.status === 'cancelado') {
          stopSaldoPolling();
          await carregarEcac();
          if (s.status === 'concluido') {
            const msg = `Sincronização concluída: ${det.documentos_processados ?? 0} doc. processados, ${det.saldos_criados ?? 0} saldo(s) novo(s), ${det.saldos_atualizados ?? 0} atualizado(s), ${det.movimentacoes_geradas ?? 0} movimentação(ões), ${det.retificadores_aplicados ?? 0} retificador(es).${det.documentos_sem_recibo ? ` ${det.documentos_sem_recibo} doc. ainda sem recibo PDF.` : ''}`;
            setErro('');
            setSucesso(msg);
            if (Array.isArray(det.alertas) && det.alertas.length > 0) {
              setErro(`Avisos: ${det.alertas.slice(0, 3).join(' | ')}${det.alertas.length > 3 ? ` (+${det.alertas.length - 3})` : ''}`);
            }
          } else if (s.status === 'erro') {
            setSucesso('');
            setErro(`Falha ao sincronizar saldos: ${s.erro_mensagem || 'erro desconhecido'}`);
          }
          // Limpa o status após 3s para esconder a barra
          setTimeout(() => { setSaldoSyncId(null); setSaldoSyncStatus(null); }, 3000);
        }
      } catch {
        stopSaldoPolling();
      }
    }, 1500);
  }, [stopSaldoPolling, carregarEcac]);

  const handleSincronizarSaldos = async () => {
    if (!empresaId) {
      setErro('Selecione uma empresa antes de sincronizar saldos.');
      return;
    }
    if (saldoSyncId) return; // já em andamento
    if (!window.confirm('Sincronizar saldos de crédito e movimentações com base nos PER/DCOMPs do e-CAC?\n\nIsto irá:\n- Aplicar regras de retificação\n- Normalizar status\n- Criar/atualizar saldos por crédito\n- Recriar movimentações de uso')) return;
    try {
      const res = await ecacService.sincronizacao.sincronizarSaldos(empresaId);
      setSaldoSyncId(res.sync_id);
      setSaldoSyncStatus({ progresso: 0, mensagem: 'Iniciando sincronização de saldos...' });
      setErro('');
      setSucesso('');
      iniciarPollingSaldos(res.sync_id);
    } catch (err: any) {
      if (err.response?.status === 401) {
        setErro('Sessão expirada. Por favor, faça login novamente.');
      } else {
        setErro(err.response?.data?.error || `Erro ao sincronizar saldos${err.message ? ': ' + err.message : ''}`);
      }
    }
  };

  const handleBaixarRecibos = async () => {
    if (!empresaId) {
      setErro('Selecione uma empresa antes de baixar recibos.');
      return;
    }
    if (!window.confirm(`Iniciar download de ${pendentesRecibo} recibo(s) PDF do e-CAC? Isso pode levar vários minutos.`)) return;
    try {
      const res = await ecacService.perdcompDocumentos.baixarRecibos(empresaId, true);
      setReciboSyncId(res.sync_id);
      setReciboSyncStatus({ progresso: 0, mensagem: 'Iniciando...', total: res.total });
      setSucesso(`Download iniciado para ${res.total} documento(s)`);
      iniciarPollingRecibos(res.sync_id, res.total);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Erro ao iniciar download de recibos';
      const codigo = err.response?.data?.codigo;
      if (codigo === 'SESSAO_NAO_ENCONTRADA') {
        setErro('Sessão e-CAC não encontrada. Acesse a aba Certificados e clique em "Autenticar no e-CAC".');
      } else {
        setErro(msg);
      }
    }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);
  useEffect(() => () => stopDocPolling(), [stopDocPolling]);
  useEffect(() => () => stopSaldoPolling(), [stopSaldoPolling]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} color={T.navy}>Documentos</Typography>
          <Typography variant="body2" color="text.secondary">
            Pedidos de Restituição e Declarações de Compensação
          </Typography>
        </Box>
        {tab === 0 && (
          <Button variant="contained" startIcon={<Add />}
            onClick={() => navigate('/fiscal/perdcomp/documentos/novo')}
            sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
            Novo Documento
          </Button>
        )}
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>{sucesso}</Alert>}

      {/* Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}
          sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
                '& .Mui-selected': { color: T.cyan },
                '& .MuiTabs-indicator': { backgroundColor: T.cyan } }}>
          <Tab label="Documentos do Sistema" />
          <Tab label={`Importados do e-CAC${ecacDocs.length > 0 ? ` (${ecacDocs.length})` : ''}`}
            icon={<CloudDownload sx={{ fontSize: 18 }} />} iconPosition="start" />
        </Tabs>
      </Box>

      {/* Filtros comuns: empresa */}
      <Paper sx={{ borderRadius: 3, p: 2, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
          {tab === 0 && (
            <TextField
              size="small" placeholder="Número PER/DCOMP..."
              value={filtros.numero}
              onChange={e => setFiltros(p => ({ ...p, numero: e.target.value, page: 1 }))}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
                sx: { borderRadius: '10px' },
              }}
              sx={{ minWidth: 200 }}
            />
          )}
          {tab === 1 && (
            <TextField
              size="small" placeholder="Filtrar por número..."
              value={filtroNumeroEcac}
              onChange={e => setFiltroNumeroEcac(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment>,
                sx: { borderRadius: '10px' },
              }}
              sx={{ minWidth: 200 }}
            />
          )}
          {tab === 0 && (
            <>
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Status</InputLabel>
                <Select value={filtros.status} label="Status"
                  onChange={e => setFiltros(p => ({ ...p, status: e.target.value, page: 1 }))}>
                  <MenuItem value="">Todos</MenuItem>
                  {Object.entries(STATUS_LABELS).map(([v, l]) => (
                    <MenuItem key={v} value={v}>{l.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 200 }}>
                <InputLabel>Tipo</InputLabel>
                <Select value={filtros.tipo_documento} label="Tipo"
                  onChange={e => setFiltros(p => ({ ...p, tipo_documento: e.target.value, page: 1 }))}>
                  <MenuItem value="">Todos</MenuItem>
                  {TIPOS_DOCUMENTO.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </>
          )}
          <IconButton onClick={tab === 0 ? carregar : carregarEcac} sx={{ color: T.cyan }}>
            <Refresh />
          </IconButton>
        </Stack>
      </Paper>

      {/* ── Tab 0: Documentos do sistema ── */}
      {tab === 0 && (
        <>
          <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Nº / ID</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Empresa</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Crédito</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: T.textSecond }}>Valor Crédito</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Transmissão</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Status</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Ações</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress sx={{ color: T.cyan }} />
                  </TableCell></TableRow>
                ) : docs.length === 0 ? (
                  <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: T.textSecond }}>
                    Nenhum documento encontrado. Clique em "Novo Documento" para criar.
                  </TableCell></TableRow>
                ) : docs.map(doc => {
                  const statusInfo = STATUS_LABELS[doc.status] || { label: doc.status, color: 'default' as const };
                  return (
                    <TableRow key={doc.id} hover>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace" fontWeight={600}>
                          {doc.numero || `#${doc.id}`}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{doc.empresa_razao_social}</Typography>
                        <Typography variant="caption" color="text.secondary">{doc.empresa_cnpj}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {TIPOS_DOCUMENTO.find(t => t.value === doc.tipo_documento)?.label || doc.tipo_documento}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.75rem' }}>
                          {TIPOS_CREDITO.find(t => t.value === doc.tipo_credito)?.label || doc.tipo_credito}
                        </Typography>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600, color: '#22c55e' }}>
                        {fmt((doc as any).credito_atualizado)}
                      </TableCell>
                      <TableCell>{fmtDate(doc.data_transmissao)}</TableCell>
                      <TableCell align="center">
                        <Chip label={statusInfo.label} color={statusInfo.color} size="small" />
                      </TableCell>
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Visualizar/Editar">
                            <IconButton size="small" sx={{ color: T.cyan }}
                              onClick={() => navigate(`/fiscal/perdcomp/documentos/${doc.id}/editar`)}>
                              <Edit fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          {['RASCUNHO', 'VALIDADO'].includes(doc.status) && (
                            <Tooltip title="Enviar ao e-CAC">
                              <IconButton size="small" sx={{ color: '#8b5cf6' }}
                                onClick={() => handleEnviar(doc.id)}>
                                <Send fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {doc.status === 'RASCUNHO' && (
                            <Tooltip title="Excluir">
                              <IconButton size="small" sx={{ color: '#ef4444' }}
                                onClick={() => handleExcluir(doc.id)}>
                                <Delete fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>

          {pagination.totalPages > 1 && (
            <Box display="flex" justifyContent="center" gap={1} mt={2}>
              <Button size="small" disabled={filtros.page <= 1}
                onClick={() => setFiltros(p => ({ ...p, page: p.page - 1 }))}>Anterior</Button>
              <Typography variant="body2" sx={{ lineHeight: '30px' }}>
                {filtros.page} / {pagination.totalPages}
              </Typography>
              <Button size="small" disabled={filtros.page >= pagination.totalPages}
                onClick={() => setFiltros(p => ({ ...p, page: p.page + 1 }))}>Próxima</Button>
            </Box>
          )}
        </>
      )}

      {/* ── Tab 1: Importados do e-CAC ── */}
      {tab === 1 && (
        <>
          {/* Toolbar de recibos */}
          {ecacDocs.length > 0 && (
            <Paper sx={{ p: 2, borderRadius: 3, mb: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Stack direction="row" spacing={3} alignItems="center" flexWrap="wrap">
                <Box>
                  <Typography variant="caption" color="text.secondary">Total importado</Typography>
                  <Typography variant="h6" fontWeight={700}>{ecacDocs.length}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Com recibo PDF</Typography>
                  <Typography variant="h6" fontWeight={700} color="#22c55e">{ecacDocs.length - pendentesRecibo - indisponiveisRecibo}</Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">Pendentes de recibo</Typography>
                  <Typography variant="h6" fontWeight={700} color={pendentesRecibo > 0 ? '#f59e0b' : 'text.primary'}>{pendentesRecibo}</Typography>
                </Box>
                {indisponiveisRecibo > 0 && (
                  <Tooltip title="PER/DCOMPs entregues pelo programa desktop antigo da Receita (pré-2018). O PDF não existe no SERPRO para download automático.">
                    <Box sx={{ cursor: 'help' }}>
                      <Typography variant="caption" color="text.secondary">⊘ Indisponíveis</Typography>
                      <Typography variant="h6" fontWeight={700} color="#94a3b8">{indisponiveisRecibo}</Typography>
                    </Box>
                  </Tooltip>
                )}
              </Stack>
              <Stack direction="row" spacing={1}>
                <Button
                  variant="contained"
                  startIcon={<ReceiptLong />}
                  disabled={pendentesRecibo === 0 || (!!reciboSyncId && reciboSyncStatus?.status !== 'concluido' && reciboSyncStatus?.status !== 'erro' && reciboSyncStatus?.status !== 'cancelado')}
                  onClick={handleBaixarRecibos}
                  sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}
                >
                  Baixar Recibos ({pendentesRecibo})
                </Button>
                <Tooltip title="Baixa o PDF completo do PER/DCOMP (5+ páginas) clicando no ícone Imprimir da lista do e-CAC">
                  <span>
                    <Button
                      variant="contained"
                      startIcon={<PictureAsPdf />}
                      disabled={pendentesDocumento === 0 || (!!docSyncId && docSyncStatus?.status !== 'concluido' && docSyncStatus?.status !== 'erro' && docSyncStatus?.status !== 'cancelado')}
                      onClick={handleBaixarDocumentos}
                      sx={{ bgcolor: '#7c3aed', '&:hover': { bgcolor: '#6d28d9' }, borderRadius: '10px' }}
                    >
                      Baixar Documentos ({pendentesDocumento})
                    </Button>
                  </span>
                </Tooltip>
                <Tooltip title="Aplica retificações, normaliza status e gera saldos/movimentações com base nos recibos parseados">
                  <span>
                    <Button
                      variant="outlined"
                      startIcon={saldoSyncId ? <CircularProgress size={16} sx={{ color: T.cyan }} /> : <AccountBalance />}
                      onClick={handleSincronizarSaldos}
                      disabled={ecacDocs.length - pendentesRecibo === 0 || !!saldoSyncId}
                      sx={{ borderColor: T.cyan, color: T.cyan, borderRadius: '10px' }}
                    >
                      {saldoSyncId ? 'Sincronizando...' : 'Sincronizar Saldos'}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Paper>
          )}

          {/* Progresso do download de recibos */}
          {reciboSyncStatus && reciboSyncStatus.status !== 'concluido' && reciboSyncStatus.status !== 'erro' && reciboSyncStatus.status !== 'cancelado' && (
            <PerdcompProgressBanner
              titulo="Baixando recibos PDF"
              mensagem={reciboSyncStatus.mensagem}
              progresso={reciboSyncStatus.progresso}
              statusLabel={(reciboSyncStatus as any)?.pausado ? 'PAUSADO' : 'EM EXECUÇÃO'}
              corDestaque={T.cyan}
              sticky={false}
              acoes={reciboSyncId ? (
                <Stack direction="row" spacing={0.5}>
                  {(reciboSyncStatus as any)?.pausado ? (
                    <Tooltip title="Continuar">
                      <IconButton size="small" sx={{ color: '#22c55e' }} onClick={async () => {
                        try { await ecacService.sincronizacao.retomar(reciboSyncId); setReciboSyncStatus(s => s ? ({ ...s, mensagem: 'Retomando...', ...({ pausado: false } as any) }) : s); }
                        catch (err: any) { setErro(err.response?.data?.error || 'Erro ao retomar'); }
                      }}>
                        <PlayArrow fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Pausar">
                      <IconButton size="small" sx={{ color: '#fbbf24' }} onClick={async () => {
                        try { await ecacService.sincronizacao.pausar(reciboSyncId); setReciboSyncStatus(s => s ? ({ ...s, mensagem: 'Pausando...', ...({ pausado: true } as any) }) : s); }
                        catch (err: any) { setErro(err.response?.data?.error || 'Erro ao pausar'); }
                      }}>
                        <Pause fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Cancelar">
                    <IconButton size="small" sx={{ color: '#f87171' }} onClick={async () => {
                      if (!window.confirm('Cancelar o download de recibos? O progresso até aqui é mantido, mas a operação será encerrada.')) return;
                      try { await ecacService.sincronizacao.cancelar(reciboSyncId); setReciboSyncStatus(s => s ? ({ ...s, mensagem: 'Cancelando...' }) : s); }
                      catch (err: any) { setErro(err.response?.data?.error || 'Erro ao cancelar'); }
                    }}>
                      <Stop fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ) : null}
            />
          )}

          {/* Progresso do download de documentos (mesmo banner, cor roxa) */}
          {docSyncStatus && docSyncStatus.status !== 'concluido' && docSyncStatus.status !== 'erro' && docSyncStatus.status !== 'cancelado' && (
            <PerdcompProgressBanner
              titulo="Baixando documentos completos"
              mensagem={docSyncStatus.mensagem}
              progresso={docSyncStatus.progresso}
              statusLabel={(docSyncStatus as any)?.pausado ? 'PAUSADO' : 'EM EXECUÇÃO'}
              corDestaque="#a78bfa"
              sticky={false}
              acoes={docSyncId ? (
                <Stack direction="row" spacing={0.5}>
                  {(docSyncStatus as any)?.pausado ? (
                    <Tooltip title="Continuar">
                      <IconButton size="small" sx={{ color: '#22c55e' }} onClick={async () => {
                        try { await ecacService.sincronizacao.retomar(docSyncId); setDocSyncStatus(s => s ? ({ ...s, mensagem: 'Retomando...', ...({ pausado: false } as any) }) : s); }
                        catch (err: any) { setErro(err.response?.data?.error || 'Erro ao retomar'); }
                      }}>
                        <PlayArrow fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  ) : (
                    <Tooltip title="Pausar">
                      <IconButton size="small" sx={{ color: '#fbbf24' }} onClick={async () => {
                        try { await ecacService.sincronizacao.pausar(docSyncId); setDocSyncStatus(s => s ? ({ ...s, mensagem: 'Pausando...', ...({ pausado: true } as any) }) : s); }
                        catch (err: any) { setErro(err.response?.data?.error || 'Erro ao pausar'); }
                      }}>
                        <Pause fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                  <Tooltip title="Cancelar">
                    <IconButton size="small" sx={{ color: '#f87171' }} onClick={async () => {
                      if (!window.confirm('Cancelar o download de documentos? O progresso até aqui é mantido, mas a operação será encerrada.')) return;
                      try { await ecacService.sincronizacao.cancelar(docSyncId); setDocSyncStatus(s => s ? ({ ...s, mensagem: 'Cancelando...' }) : s); }
                      catch (err: any) { setErro(err.response?.data?.error || 'Erro ao cancelar'); }
                    }}>
                      <Stop fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              ) : null}
            />
          )}

          {/* Progresso da sincronização de saldos (mesmo banner, cor verde) */}
          {saldoSyncStatus && saldoSyncStatus.status !== 'concluido' && saldoSyncStatus.status !== 'erro' && saldoSyncStatus.status !== 'cancelado' && (
            <PerdcompProgressBanner
              titulo="Sincronizando saldos"
              mensagem={saldoSyncStatus.mensagem}
              progresso={saldoSyncStatus.progresso}
              corDestaque="#22c55e"
              sticky={false}
            />
          )}

          {loadingEcac ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress sx={{ color: T.cyan }} />
            </Box>
          ) : (
            <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ width: 40 }}></TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Número</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo Documento</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo Crédito</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Período</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Data Entrega</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: T.textSecond }}>Valor / Crédito</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Status</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Recibo</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Documento</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {ecacFiltrados.length === 0 ? (
                    <TableRow><TableCell colSpan={10} align="center" sx={{ py: 6, color: T.textSecond }}>
                      {ecacDocs.length === 0
                        ? 'Nenhum documento importado do e-CAC. Use "Buscar no e-CAC" no Dashboard para importar.'
                        : 'Nenhum resultado para o filtro informado.'}
                    </TableCell></TableRow>
                  ) : ecacFiltrados.map(doc => {
                    const valorPrincipal = doc.credito_atualizado ?? doc.valor_pedido ?? doc.valor_saldo_negativo;
                    const isExpanded = expandedRow === doc.id;
                    const debitos = debitosByDoc[doc.id] || [];
                    return (
                      <>
                        <TableRow key={doc.id} hover sx={{ '& td': { borderBottom: isExpanded ? 'none' : undefined } }}>
                          <TableCell>
                            <IconButton size="small" onClick={() => handleExpand(doc.id)}>
                              {isExpanded ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                            </IconButton>
                          </TableCell>
                          <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', fontWeight: 600, color: T.navy }}>
                            <Stack direction="row" spacing={0.5} alignItems="center" flexWrap="wrap">
                              <span>{doc.numero}</span>
                              {doc.vinculado_sistema && (
                                <Tooltip title="Vinculado a um PER/DCOMP cadastrado no sistema">
                                  <LinkIcon sx={{ fontSize: 14, color: T.cyan }} />
                                </Tooltip>
                              )}
                            </Stack>
                            {doc.numero_perdcomp_inicial && doc.numero_perdcomp_inicial !== doc.numero && (
                              <Tooltip title={`PER/DCOMP origem do crédito: ${doc.numero_perdcomp_inicial}`}>
                                <Typography variant="caption" display="block" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                                  ← {doc.numero_perdcomp_inicial}
                                </Typography>
                              </Tooltip>
                            )}
                            {doc.numero_retificador && (
                              <Tooltip title={`Substituído pelo retificador ${doc.numero_retificador}`}>
                                <Typography variant="caption" display="block" color="warning.main" sx={{ fontFamily: 'monospace' }}>
                                  ↪ {doc.numero_retificador}
                                </Typography>
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>{doc.tipo_documento || '—'}</TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>{doc.tipo_credito || '—'}</TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {doc.exercicio || doc.periodo_apuracao || '—'}
                          </TableCell>
                          <TableCell sx={{ fontSize: '0.8rem' }}>
                            {doc.data_entrega ? new Date(doc.data_entrega).toLocaleDateString('pt-BR') : '—'}
                          </TableCell>
                          <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#22c55e' }}>
                            {fmt(valorPrincipal)}
                          </TableCell>
                          <TableCell align="center">
                            <Tooltip title={doc.status_ecac || ''}>
                              <Chip
                                label={doc.status_normalizado ? STATUS_NORM_LABELS[doc.status_normalizado] || doc.status_normalizado : (doc.status_ecac || '—')}
                                size="small"
                                color={doc.status_normalizado ? STATUS_NORM_COLORS[doc.status_normalizado] || 'default' : statusEcacColor(doc.status_ecac)}
                              />
                            </Tooltip>
                            {doc.orig_retif && (
                              <Typography variant="caption" display="block" color="text.secondary">{doc.orig_retif}</Typography>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {doc.tem_recibo ? (
                              <Tooltip title={`Recibo PDF (${doc.recibo_parse_status === 'OK' ? 'parse OK' : doc.recibo_parse_status === 'ERRO' ? 'parse com erro' : 'não processado'})`}>
                                <IconButton size="small" component="a"
                                  href={ecacService.perdcompDocumentos.reciboPdfUrl(doc.id)}
                                  target="_blank" rel="noopener noreferrer"
                                  sx={{ color: doc.recibo_parse_status === 'ERRO' ? '#f59e0b' : '#ef4444' }}>
                                  <PictureAsPdf fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : doc.recibo_indisponivel ? (
                              <Tooltip title="Recibo indisponível — documento entregue pelo programa desktop antigo da Receita (pré-2018). O PDF não existe no SERPRO para download automático.">
                                <DoNotDisturbAlt fontSize="small" sx={{ color: '#94a3b8', opacity: 0.6 }} />
                              </Tooltip>
                            ) : (
                              <Tooltip title="Recibo ainda não baixado">
                                <FileDownload fontSize="small" sx={{ color: T.textSecond, opacity: 0.4 }} />
                              </Tooltip>
                            )}
                          </TableCell>
                          <TableCell align="center">
                            {doc.tem_documento ? (
                              <Tooltip title="Documento PER/DCOMP completo (5+ páginas)">
                                <IconButton size="small" component="a"
                                  href={ecacService.perdcompDocumentos.documentoPdfUrl(doc.id)}
                                  target="_blank" rel="noopener noreferrer"
                                  sx={{ color: '#7c3aed' }}>
                                  <PictureAsPdf fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            ) : doc.documento_indisponivel ? (
                              <Tooltip title="Documento indisponível — entregue pelo programa desktop antigo da Receita (pré-2018).">
                                <DoNotDisturbAlt fontSize="small" sx={{ color: '#94a3b8', opacity: 0.6 }} />
                              </Tooltip>
                            ) : (
                              <Tooltip title="Documento ainda não baixado">
                                <FileDownload fontSize="small" sx={{ color: T.textSecond, opacity: 0.4 }} />
                              </Tooltip>
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Linha expandida com detalhes do recibo + débitos */}
                        <TableRow>
                          <TableCell colSpan={10} sx={{ p: 0, borderBottom: isExpanded ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
                            <Collapse in={isExpanded} unmountOnExit>
                              <Box sx={{ p: 3, bgcolor: '#fafbfc' }}>
                                {/* Bloco de informações do recibo */}
                                <Stack direction="row" spacing={4} flexWrap="wrap" mb={2}>
                                  {doc.numero_recibo && (
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">Nº Recibo</Typography>
                                      <Typography variant="body2" fontWeight={600}>{doc.numero_recibo}</Typography>
                                    </Box>
                                  )}
                                  {doc.data_transmissao && (
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">Transmissão</Typography>
                                      <Typography variant="body2" fontWeight={600}>{fmtDate(doc.data_transmissao)}</Typography>
                                    </Box>
                                  )}
                                  {doc.forma_apuracao && (
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">Forma Apuração</Typography>
                                      <Typography variant="body2" fontWeight={600}>{doc.forma_apuracao} ({doc.forma_tributacao || '—'})</Typography>
                                    </Box>
                                  )}
                                  {(doc.periodo_inicial || doc.periodo_final) && (
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">Período</Typography>
                                      <Typography variant="body2" fontWeight={600}>{fmtDate(doc.periodo_inicial)} a {fmtDate(doc.periodo_final)}</Typography>
                                    </Box>
                                  )}
                                  {doc.responsavel_nome && (
                                    <Box>
                                      <Typography variant="caption" color="text.secondary">Responsável</Typography>
                                      <Typography variant="body2" fontWeight={600}>{doc.responsavel_nome}</Typography>
                                      {doc.responsavel_cpf && <Typography variant="caption" color="text.secondary">CPF: {doc.responsavel_cpf}</Typography>}
                                    </Box>
                                  )}
                                </Stack>

                                {/* Bloco financeiro */}
                                {(doc.valor_saldo_negativo || doc.credito_atualizado || doc.valor_pedido) && (
                                  <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 2, mb: 2 }}>
                                    {doc.valor_pedido != null && (
                                      <Paper sx={{ p: 1.5, bgcolor: '#f0fdf4' }}>
                                        <Typography variant="caption" color="text.secondary">Valor do Pedido</Typography>
                                        <Typography variant="body1" fontWeight={700} color="#16a34a">{fmt(doc.valor_pedido)}</Typography>
                                      </Paper>
                                    )}
                                    {doc.valor_saldo_negativo != null && (
                                      <Paper sx={{ p: 1.5, bgcolor: '#f0fdf4' }}>
                                        <Typography variant="caption" color="text.secondary">Saldo Negativo Original</Typography>
                                        <Typography variant="body1" fontWeight={700} color="#16a34a">{fmt(doc.valor_saldo_negativo)}</Typography>
                                      </Paper>
                                    )}
                                    {doc.selic_acumulada != null && (
                                      <Paper sx={{ p: 1.5, bgcolor: '#fffbeb' }}>
                                        <Typography variant="caption" color="text.secondary">SELIC Acumulada</Typography>
                                        <Typography variant="body1" fontWeight={700} color="#d97706">{doc.selic_acumulada.toFixed(2)}%</Typography>
                                      </Paper>
                                    )}
                                    {doc.credito_atualizado != null && (
                                      <Paper sx={{ p: 1.5, bgcolor: '#eff6ff' }}>
                                        <Typography variant="caption" color="text.secondary">Crédito Atualizado</Typography>
                                        <Typography variant="body1" fontWeight={700} color="#2563eb">{fmt(doc.credito_atualizado)}</Typography>
                                      </Paper>
                                    )}
                                    {doc.credito_original_utilizado != null && (
                                      <Paper sx={{ p: 1.5, bgcolor: '#fef2f2' }}>
                                        <Typography variant="caption" color="text.secondary">Crédito Utilizado</Typography>
                                        <Typography variant="body1" fontWeight={700} color="#dc2626">{fmt(doc.credito_original_utilizado)}</Typography>
                                      </Paper>
                                    )}
                                    {doc.saldo_credito_original != null && (
                                      <Paper sx={{ p: 1.5, bgcolor: '#f5f3ff' }}>
                                        <Typography variant="caption" color="text.secondary">Saldo do Crédito</Typography>
                                        <Typography variant="body1" fontWeight={700} color="#7c3aed">{fmt(doc.saldo_credito_original)}</Typography>
                                      </Paper>
                                    )}
                                    {doc.total_debitos_dcomp != null && (
                                      <Paper sx={{ p: 1.5, bgcolor: '#fff7ed' }}>
                                        <Typography variant="caption" color="text.secondary">Total Débitos DCOMP</Typography>
                                        <Typography variant="body1" fontWeight={700} color="#ea580c">{fmt(doc.total_debitos_dcomp)}</Typography>
                                      </Paper>
                                    )}
                                  </Box>
                                )}

                                {/* Tabela de débitos compensados */}
                                {debitos.length > 0 && (
                                  <Box mt={2}>
                                    <Typography variant="subtitle2" fontWeight={700} mb={1}>
                                      Débitos Compensados ({debitos.length})
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined">
                                      <Table size="small">
                                        <TableHead>
                                          <TableRow sx={{ bgcolor: 'rgba(0,200,240,0.06)' }}>
                                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>#</TableCell>
                                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Receita</TableCell>
                                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Tributo</TableCell>
                                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>P. Apur.</TableCell>
                                            <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Vencto</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Principal</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Multa</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Juros</TableCell>
                                            <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>Total</TableCell>
                                          </TableRow>
                                        </TableHead>
                                        <TableBody>
                                          {debitos.map(d => (
                                            <TableRow key={d.id}>
                                              <TableCell sx={{ fontSize: '0.75rem' }}>{d.ordem}</TableCell>
                                              <TableCell sx={{ fontSize: '0.75rem' }}>
                                                {d.codigo_receita}
                                                <Typography variant="caption" display="block" color="text.secondary">{d.denominacao_receita}</Typography>
                                              </TableCell>
                                              <TableCell sx={{ fontSize: '0.75rem' }}>{d.grupo_tributo?.split(' - ')[0] || '—'}</TableCell>
                                              <TableCell sx={{ fontSize: '0.75rem' }}>{d.periodo_apuracao || '—'}</TableCell>
                                              <TableCell sx={{ fontSize: '0.75rem' }}>{fmtDate(d.data_vencimento)}</TableCell>
                                              <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{fmt(d.principal)}</TableCell>
                                              <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{fmt(d.multa)}</TableCell>
                                              <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{fmt(d.juros)}</TableCell>
                                              <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{fmt(d.total)}</TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </TableContainer>
                                  </Box>
                                )}

                                {!doc.tem_recibo && (
                                  <Alert severity="info" sx={{ mt: 1 }}>
                                    Recibo PDF ainda não baixado. Use o botão "Baixar Recibos" no topo para extrair os detalhes financeiros e a lista de débitos compensados.
                                  </Alert>
                                )}
                                {doc.tem_recibo && doc.recibo_parse_status === 'ERRO' && (
                                  <Alert severity="warning" sx={{ mt: 1 }}>
                                    PDF baixado, mas o parser teve dificuldade em extrair alguns campos: {doc.recibo_parse_erro}
                                  </Alert>
                                )}
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </>
                    );
                  })}
                </TableBody>
              </Table>
              {ecacFiltrados.length > 0 && (
                <Box px={2} py={1} sx={{ borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                  <Typography variant="caption" color="text.secondary">
                    {ecacFiltrados.length} documento(s) importado(s) do e-CAC
                  </Typography>
                </Box>
              )}
            </TableContainer>
          )}
        </>
      )}
    </Box>
  );
}
