import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEmpresa } from '../../contexts/EmpresaContext';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Button,
  Stack,
  Tooltip,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingDown as DebitIcon,
  HourglassTop as AnalysisIcon,
  EmojiEvents as TrophyIcon,
  Warning as WarningIcon,
  CloudSync as SyncIcon,
  CheckCircle as OkIcon,
  Error as ErrIcon,
  AccessTime as ClockIcon,
  Refresh as RefreshIcon,
  VpnKey as AuthIcon,
  Article as EcacDocsIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import { ecacService, type SincronizacaoStatus } from '../../services/ecacService';
import type { PerdcompDashboardData } from '../../types/perdcomp';
import { logger } from '../../utils/logger';
// ── helpers ──────────────────────────────────────────────────────────────────
const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (iso: string | null) => {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
  } catch { return iso; }
};

const fromNow = (iso: string | null): string => {
  if (!iso) return '';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'agora mesmo';
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
};

// ── KPI Card ─────────────────────────────────────────────────────────────────
interface KpiCardProps {
  title: string;
  count: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
  onClick?: () => void;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, count, subtitle, icon, color, onClick }) => (
  <Paper onClick={onClick} sx={{ p: 3, flex: 1, minWidth: 200, borderRadius: 3, border: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'flex-start', gap: 2, cursor: onClick ? 'pointer' : 'default', '&:hover': onClick ? { boxShadow: 3 } : {} }}>
    <Box sx={{ width: 48, height: 48, borderRadius: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: `${color}18`, color, flexShrink: 0 }}>
      {icon}
    </Box>
    <Box>
      <Typography variant="body2" sx={{ color: '#64748b', mb: 0.5 }}>{title}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, color: '#0a1628' }}>{count}</Typography>
      {subtitle && <Typography variant="body2" sx={{ color, fontWeight: 600, mt: 0.5 }}>{subtitle}</Typography>}
    </Box>
  </Paper>
);

// ── Sync Status Card ─────────────────────────────────────────────────────────
const syncStatusMap: Record<string, { color: 'success' | 'warning' | 'error' | 'default'; label: string; icon: React.ReactNode }> = {
  concluido:    { color: 'success', label: 'Concluído',    icon: <OkIcon sx={{ fontSize: 16 }} /> },
  em_andamento: { color: 'warning', label: 'Em andamento', icon: <ClockIcon sx={{ fontSize: 16 }} /> },
  erro:         { color: 'error',   label: 'Erro',         icon: <ErrIcon sx={{ fontSize: 16 }} /> },
  pendente:     { color: 'default', label: 'Pendente',     icon: <ClockIcon sx={{ fontSize: 16 }} /> },
};

interface EcacSyncCardProps {
  sync: SincronizacaoStatus | null;
  syncing: boolean;
  empresaSelecionada: boolean;
  onImportar: () => void;
}

const EcacSyncCard: React.FC<EcacSyncCardProps> = ({ sync, syncing, empresaSelecionada, onImportar }) => {
  const cfg = sync ? (syncStatusMap[sync.status] ?? syncStatusMap.pendente) : null;

  return (
    <Paper sx={{ p: 3, borderRadius: 3, border: '1px solid', borderColor: '#00c8f020', bgcolor: '#f0fdff', mb: 3 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={2}>
        <Stack direction="row" alignItems="center" gap={1.5}>
          <Box sx={{ width: 40, height: 40, borderRadius: 2, bgcolor: '#00c8f018', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00c8f0' }}>
            <SyncIcon />
          </Box>
          <Box>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#0a1628' }}>
              Integração e-CAC
            </Typography>
            {sync ? (
              <Stack direction="row" alignItems="center" gap={1} mt={0.5} flexWrap="wrap">
                <Chip icon={cfg!.icon as any} label={cfg!.label} color={cfg!.color} size="small" />
                <Typography variant="caption" color="text.secondary">
                  {sync.detalhes?.documentos_extraidos != null
                    ? `${sync.detalhes.documentos_extraidos} doc(s) extraído(s) · ${sync.detalhes.importados ?? sync.creditos_importados} importado(s)`
                    : `${sync.creditos_importados} créditos · ${sync.debitos_importados} débitos importados`}
                </Typography>
                <Tooltip title={formatDate(sync.concluido_em ?? sync.iniciado_em)}>
                  <Typography variant="caption" color="text.secondary">
                    · {fromNow(sync.concluido_em ?? sync.iniciado_em)}
                  </Typography>
                </Tooltip>
              </Stack>
            ) : (
              <Typography variant="caption" color="text.secondary">
                {empresaSelecionada ? 'Nenhuma sincronização registrada para esta empresa' : 'Selecione uma empresa para ver o status'}
              </Typography>
            )}
          </Box>
        </Stack>

        <Stack direction="row" alignItems="center" gap={1}>
          {syncing && (
            <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
              Aguardando resposta do e-CAC (~30s)…
            </Typography>
          )}
          <Tooltip title={!empresaSelecionada ? 'Selecione uma empresa primeiro' : 'Busca créditos e débitos do e-CAC usando o certificado digital configurado'}>
            <span>
              <Button
                variant="contained"
                size="small"
                startIcon={syncing ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <RefreshIcon />}
                onClick={onImportar}
                disabled={!empresaSelecionada || syncing}
                sx={{ bgcolor: '#00c8f0', '&:hover': { bgcolor: '#00b0d8' }, borderRadius: '8px', textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {syncing ? 'Importando...' : 'Buscar no e-CAC'}
              </Button>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      {sync?.erro_mensagem && (
        <Alert
          severity={/programa antigo|pré-PERDCOMP|recibos não disponíveis/i.test(sync.erro_mensagem) ? 'info' : 'error'}
          sx={{ mt: 1.5, borderRadius: 2, py: 0.5 }}
        >
          {sync.erro_mensagem}
        </Alert>
      )}
    </Paper>
  );
};

// ── Page ─────────────────────────────────────────────────────────────────────
const PerdcompDashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { empresaId: selectedEmpresaId } = useEmpresa();
  const [data, setData] = useState<PerdcompDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [semSessao, setSemSessao] = useState(false);

  // e-CAC sync
  const [ultimoSync, setUltimoSync] = useState<SincronizacaoStatus | null>(null);
  const [syncing, setSyncing] = useState(false);

  // ── Carrega dashboard ──────────────────────────────────────────────────────
  const carregarDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setErro('');
      const id = selectedEmpresaId === '' ? undefined : selectedEmpresaId;
      const dashData = await perdcompService.dashboard(id);
      setData(dashData);
    } catch (error: any) {
      logger.error('Erro ao carregar dashboard:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  }, [selectedEmpresaId]);

  // ── Carrega último sync e-CAC para a empresa selecionada ──────────────────
  const carregarUltimoSync = useCallback(async () => {
    if (!selectedEmpresaId) { setUltimoSync(null); return; }
    try {
      const syncs = await ecacService.sincronizacao.historico(selectedEmpresaId as number);
      setUltimoSync(syncs[0] ?? null);
    } catch {
      setUltimoSync(null);
    }
  }, [selectedEmpresaId]);

  // ── Importação automática do e-CAC (com polling de status) ───────────────
  const handleImportarEcac = async () => {
    if (!selectedEmpresaId) return;
    setSyncing(true);
    setErro('');
    setSucesso('');
    setSemSessao(false);

    let syncId: number | null = null;

    try {
      const result = await ecacService.sincronizacao.importarAutomatico(selectedEmpresaId as number);
      syncId = result.sync_id;
    } catch (error: any) {
      const codigo = error.response?.data?.codigo;
      if (codigo === 'SESSAO_NAO_ENCONTRADA') {
        setSemSessao(true);
      } else {
        const msg = error.response?.data?.error || 'Erro ao iniciar importação do e-CAC';
        setErro(msg);
      }
      setSyncing(false);
      return;
    }

    // Polling: aguarda conclusão (max 3 min, intervalo de 4s)
    const maxTentativas = 45;
    for (let i = 0; i < maxTentativas; i++) {
      await new Promise(r => setTimeout(r, 4000));
      try {
        const status = await ecacService.sincronizacao.status(syncId!);
        setUltimoSync(status as any);

        if (status.status === 'concluido') {
          const docs = status.detalhes?.documentos_extraidos ?? status.creditos_importados;
          setSucesso(`e-CAC sincronizado: ${docs} documento(s) PER/DCOMP importado(s).`);
          carregarDashboard();
          break;
        }
        if (status.status === 'erro') {
          const erroMsg = status.erro_mensagem || 'erro desconhecido';
          if (erroMsg.includes('Sessão') || erroMsg.includes('sessão') || erroMsg.includes('expirada')) {
            setSemSessao(true);
          } else {
            setErro(`Falha na sincronização e-CAC: ${erroMsg}`);
          }
          break;
        }
      } catch {
        // ignora erros de polling temporários
      }
    }

    setSyncing(false);
  };

  useEffect(() => { carregarDashboard(); }, [carregarDashboard]);
  useEffect(() => { carregarUltimoSync(); }, [carregarUltimoSync]);

  return (
    <Box>
      {/* Cabeçalho */}
      <Box mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0a1628' }}>
          Dashboard PER/DComp
        </Typography>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>{sucesso}</Alert>}

      {/* Alerta: sessão e-CAC ausente ou expirada */}
      {semSessao && (
        <Alert
          severity="warning"
          onClose={() => setSemSessao(false)}
          sx={{ mb: 2, borderRadius: 2, alignItems: 'center' }}
          action={
            <Button
              color="warning"
              variant="contained"
              size="small"
              startIcon={<AuthIcon />}
              onClick={() => navigate('/configuracoes/certificados')}
              sx={{ whiteSpace: 'nowrap', borderRadius: '8px', fontWeight: 600, textTransform: 'none' }}
            >
              Ir para Certificados
            </Button>
          }
        >
          <strong>Sessão e-CAC não encontrada.</strong> Para sincronizar os documentos PER/DCOMP, você precisa autenticar o certificado digital no e-CAC.
          Acesse a aba <strong>Certificados Digitais</strong> e clique em <strong>"Autenticar no e-CAC"</strong> (ícone verde).
        </Alert>
      )}

      {/* Card de integração e-CAC */}
      <EcacSyncCard
        sync={ultimoSync}
        syncing={syncing}
        empresaSelecionada={!!selectedEmpresaId}
        onImportar={handleImportarEcac}
      />

      {loading ? (
        <Box display="flex" justifyContent="center" p={8}>
          <CircularProgress sx={{ color: '#00c8f0' }} />
        </Box>
      ) : data ? (
        <>
          {/* KPIs */}
          <Box display="flex" gap={2} mb={3} flexWrap="wrap">
            <KpiCard title="Créditos Disponíveis" count={data.total_creditos_disponiveis}
              subtitle={formatBRL(data.valor_creditos_disponiveis)} icon={<WalletIcon />} color="#22c55e" />
            <KpiCard title="Débitos Pendentes" count={data.total_debitos_pendentes}
              subtitle={formatBRL(data.valor_debitos_pendentes)} icon={<DebitIcon />} color="#ef4444" />
            <KpiCard title="Pedidos em Análise" count={data.pedidos_em_analise}
              icon={<AnalysisIcon />} color="#3b82f6" />
            <KpiCard title="Docs. PER/DCOMP (e-CAC)" count={data.documentos_ecac ?? 0}
              subtitle={data.documentos_ecac > 0
                ? `${data.documentos_ecac_com_recibo}/${data.documentos_ecac} com recibo PDF`
                : undefined}
              icon={<EcacDocsIcon />} color="#8b5cf6"
              onClick={() => navigate('/fiscal/perdcomp/documentos')} />
            <KpiCard title="Taxa Deferimento" count={`${data.taxa_deferimento.toFixed(1)}%`}
              icon={<TrophyIcon />} color="#eab308" />
          </Box>

          {data.creditos_proximos_prescricao > 0 && (
            <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 3, borderRadius: 2 }}>
              <strong>{data.creditos_proximos_prescricao}</strong> crédito(s) próximo(s) da prescrição
              totalizando <strong>{formatBRL(data.valor_creditos_prescricao)}</strong>. Tome providências.
            </Alert>
          )}

          {/* Tabelas */}
          <Box display="flex" gap={3} mb={3} flexWrap="wrap">
            <Box flex={1} minWidth={340}>
              <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0a1628' }}>Créditos por Tipo</Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Tipo</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: '#64748b' }}>Qtd</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b' }}>Valor</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.creditos_por_tipo.length === 0 ? (
                        <TableRow><TableCell colSpan={3} align="center" sx={{ color: '#64748b' }}>Nenhum crédito encontrado</TableCell></TableRow>
                      ) : data.creditos_por_tipo.map((item) => (
                        <TableRow key={item.tipo} hover>
                          <TableCell><Chip label={item.tipo} size="small" sx={{ fontWeight: 600 }} /></TableCell>
                          <TableCell align="center">{item.total}</TableCell>
                          <TableCell align="right" sx={{ color: '#22c55e', fontWeight: 600 }}>{formatBRL(item.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>

            <Box flex={1} minWidth={300}>
              <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0a1628' }}>Pedidos por Status</Typography>
                </Box>
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Status</TableCell>
                        <TableCell align="center" sx={{ fontWeight: 600, color: '#64748b' }}>Qtd</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.pedidos_por_status.length === 0 ? (
                        <TableRow><TableCell colSpan={2} align="center" sx={{ color: '#64748b' }}>Nenhum pedido encontrado</TableCell></TableRow>
                      ) : data.pedidos_por_status.map((item) => (
                        <TableRow key={item.status} hover>
                          <TableCell>
                            <Chip label={item.status} size="small" sx={{
                              fontWeight: 600,
                              bgcolor: item.status === 'Deferido' || item.status === 'Homologado' ? '#dcfce7'
                                : item.status === 'Indeferido' || item.status === 'Não Homologado' ? '#fee2e2'
                                  : item.status === 'Em Análise' || item.status === 'Transmitido' ? '#dbeafe' : '#f1f5f9',
                              color: item.status === 'Deferido' || item.status === 'Homologado' ? '#16a34a'
                                : item.status === 'Indeferido' || item.status === 'Não Homologado' ? '#dc2626'
                                  : item.status === 'Em Análise' || item.status === 'Transmitido' ? '#2563eb' : '#475569',
                            }} />
                          </TableCell>
                          <TableCell align="center" sx={{ fontWeight: 600 }}>{item.total}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          </Box>

          {/* Últimos Movimentos */}
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0a1628' }}>Últimos Movimentos</Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Ação</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Detalhes</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Responsável</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Transmissão</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.ultimos_movimentos.length === 0 ? (
                    <TableRow><TableCell colSpan={4} align="center" sx={{ color: '#64748b' }}>Nenhum movimento registrado</TableCell></TableRow>
                  ) : data.ultimos_movimentos.map((mov) => (
                    <TableRow
                      key={mov.id}
                      hover
                      onClick={() => navigate(`/fiscal/perdcomp/documentos?numero=${encodeURIComponent(mov.numero || '')}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell><Chip label={mov.acao} size="small" variant="outlined" /></TableCell>
                      <TableCell sx={{ color: '#64748b', maxWidth: 400 }}>{mov.detalhes || '—'}</TableCell>
                      <TableCell>
                        {mov.responsavel_nome ? (
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#0a1628', lineHeight: 1.2 }}>
                              {mov.responsavel_nome}
                            </Typography>
                            {mov.responsavel_cpf && (
                              <Typography variant="caption" sx={{ color: '#64748b' }}>
                                CPF: {mov.responsavel_cpf}
                              </Typography>
                            )}
                          </Box>
                        ) : '—'}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>
                        {mov.criado_em ? new Intl.DateTimeFormat('pt-BR').format(new Date(mov.criado_em)) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      ) : null}
    </Box>
  );
};

export default PerdcompDashboardPage;
