import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Paper, Tabs, Tab, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip,
  CircularProgress, Alert, IconButton, Tooltip, LinearProgress,
  FormControl, InputLabel, Select, MenuItem, Autocomplete, TextField,
  Button, Menu,
} from '@mui/material';
import {
  Refresh, AccessTime, Warning, Cached, Gavel, AccountBalanceWallet,
  Download as DownloadIcon, PictureAsPdf, Description as DocIcon, TableView,
} from '@mui/icons-material';
import { exportarRelatorio, type ReportData } from '../../utils/reportExport';
import {
  perdcompRelatoriosService,
  STATUS_LABELS, STATUS_COLORS,
  type DashboardRelatorio, type SaldoDisponivel, type PrescricaoRelatorio,
  type RetrabalhoRelatorio, type CompensacoesRiscoRelatorio,
  type StatusNormalizado,
  type ControleConsolidadoLinha, type ControleConsolidadoTotais,
} from '../../services/perdcompRelatoriosService';
import TableChartIcon from '@mui/icons-material/TableChart';
import { useEmpresa } from '../../contexts/EmpresaContext';

const T = { navy: '#0a1628', cyan: '#00c8f0', textSecond: '#64748b' };

const fmt = (v?: number | null) =>
  v != null ? Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

const fmtDate = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';

interface KpiCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  color?: string;
  icon?: React.ReactNode;
}

const KpiCard = ({ label, value, sublabel, color = T.cyan, icon }: KpiCardProps) => (
  <Paper sx={{ p: 2.5, borderRadius: 3, minWidth: 180, flex: 1 }}>
    <Stack direction="row" spacing={2} alignItems="center">
      {icon && <Box sx={{ color, fontSize: 32 }}>{icon}</Box>}
      <Box flex={1}>
        <Typography variant="caption" color="text.secondary">{label}</Typography>
        <Typography variant="h5" fontWeight={700} color={color}>{value}</Typography>
        {sublabel && <Typography variant="caption" color="text.secondary">{sublabel}</Typography>}
      </Box>
    </Stack>
  </Paper>
);

// ─── Tabela de export por tab ────────────────────────────────────────────────
const TAB_LABELS = [
  'Visao_Geral', 'Controle_Consolidado', 'Saldos_Disponiveis',
  'Prescricao', 'Retrabalho', 'Compensacoes_em_Risco',
];

export default function RelatoriosPage() {
  const { empresaId, empresas } = useEmpresa();
  const [tab, setTab] = useState(0);
  const [erro, setErro] = useState('');
  const [exportAnchor, setExportAnchor] = useState<null | HTMLElement>(null);
  const [exportando, setExportando] = useState(false);

  const [dashboard, setDashboard] = useState<DashboardRelatorio | null>(null);
  const [saldos, setSaldos] = useState<SaldoDisponivel[]>([]);
  const [prescricao, setPrescricao] = useState<PrescricaoRelatorio | null>(null);
  const [retrabalho, setRetrabalho] = useState<RetrabalhoRelatorio | null>(null);
  const [risco, setRisco] = useState<CompensacoesRiscoRelatorio | null>(null);
  const [consolidado, setConsolidado] = useState<{ creditos: ControleConsolidadoLinha[]; totais: ControleConsolidadoTotais } | null>(null);
  const [loading, setLoading] = useState(false);

  // Filtros locais aplicados sobre o resultado do "Controle Consolidado"
  const [filtroPerdcomp, setFiltroPerdcomp] = useState<string | null>(null);
  const [filtroTipoCredito, setFiltroTipoCredito] = useState('');
  const [filtroAnoBase, setFiltroAnoBase] = useState('');
  const [filtroStatusAtencao, setFiltroStatusAtencao] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const empId = empresaId || undefined;
      if (tab === 0) setDashboard(await perdcompRelatoriosService.dashboard(empId));
      else if (tab === 1) {
        const r = await perdcompRelatoriosService.controleConsolidado(empId);
        setConsolidado({ creditos: r.creditos, totais: r.totais });
      }
      else if (tab === 2) setSaldos((await perdcompRelatoriosService.saldosDisponiveis(empId)).saldos);
      else if (tab === 3) setPrescricao(await perdcompRelatoriosService.prescricao(empId));
      else if (tab === 4) setRetrabalho(await perdcompRelatoriosService.retrabalho(empId));
      else if (tab === 5) setRisco(await perdcompRelatoriosService.compensacoesEmRisco(empId));
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao carregar relatório');
    } finally {
      setLoading(false);
    }
  }, [tab, empresaId]);

  useEffect(() => { carregar(); }, [carregar]);

  // ─── Monta payload de export para o tab atual ──────────────────────────────
  const construirReportData = (): ReportData => {
    const empresaNome = empresaId
      ? (empresas.find(e => e.id === empresaId)?.razao_social || `Empresa #${empresaId}`)
      : 'Todas as empresas';
    const geradoEm = new Date().toLocaleString('pt-BR');
    const tituloBase = 'Relatório PER/DCOMP';

    if (tab === 0 && dashboard) {
      return {
        titulo: `${tituloBase} — Visão Geral`,
        subtitulo: 'Indicadores consolidados de créditos, prescrição, retrabalho e compensações em risco',
        empresa: empresaNome, geradoEm,
        secoes: [{
          title: 'Indicadores',
          kpis: [
            { label: 'Saldos Ativos', value: dashboard.saldos.ativos },
            { label: 'Saldo Total Disponível', value: fmt(dashboard.saldos.total_disponivel) },
            { label: 'Próximos da Prescrição', value: dashboard.prescricao.criticos_30d + dashboard.prescricao.urgentes_90d },
            { label: 'Índice de Retrabalho', value: `${dashboard.retrabalho.indice_pct}%` },
            { label: 'Compensações em Risco', value: dashboard.em_risco.quantidade },
          ],
          note: 'Critério de prescrição: prazo de 5 anos a partir da data do pagamento original.',
        }],
      };
    }
    if (tab === 1 && consolidado) {
      return {
        titulo: `${tituloBase} — Controle Consolidado`,
        subtitulo: 'Detalhamento por PER/DCOMP origem (modelo da planilha Controle de Créditos)',
        empresa: empresaNome, geradoEm,
        secoes: [{
          title: 'Créditos consolidados',
          headers: ['PER/DCOMP inicial', 'Empresa', 'Tipo', 'Competência', 'Valor Original', 'SELIC %', 'Atualizado', 'Utilizado', 'Saldo', 'Prescrição', 'Status'],
          rows: consolidado.creditos.map(c => [
            c.perdcomp_inicial || '—',
            c.empresa || '—',
            c.tipo_credito,
            c.competencia || '—',
            fmt(c.valor_credito_inicial),
            `${(c.selic_acumulada_pct || 0).toFixed(2)}%`,
            fmt(c.saldo_credito_atualizado),
            fmt(c.valor_credito_utilizado),
            fmt(c.saldo_credito),
            fmtDate(c.data_prescricao),
            c.status_atencao || '—',
          ]),
          note: `Totalizadores: Valor Original ${fmt(consolidado.totais.valor_credito_inicial)} · Atualizado ${fmt(consolidado.totais.saldo_credito_atualizado)} · Saldo ${fmt(consolidado.totais.saldo_credito)}`,
        }],
      };
    }
    if (tab === 2) {
      return {
        titulo: `${tituloBase} — Saldos Disponíveis`,
        subtitulo: `${saldos.length} crédito(s) com saldo > 0`,
        empresa: empresaNome, geradoEm,
        secoes: [{
          title: 'Saldos por crédito',
          headers: ['PER/DCOMP', 'Tipo', 'Período', 'Saldo Disponível', 'Prescrição', 'Dias Restantes'],
          rows: saldos.map(s => [
            s.numero_perdcomp_origem || '—',
            s.tipo_credito,
            s.periodo_apuracao || '—',
            fmt(s.saldo_disponivel),
            fmtDate(s.data_prescricao),
            String(s.dias_para_prescricao ?? '—'),
          ]),
        }],
      };
    }
    if (tab === 3 && prescricao) {
      return {
        titulo: `${tituloBase} — Prescrição`,
        subtitulo: 'Créditos próximos ou já prescritos',
        empresa: empresaNome, geradoEm,
        secoes: [{
          title: 'Distribuição por urgência',
          kpis: [
            { label: 'Prescritos', value: prescricao.buckets.prescritos.quantidade },
            { label: 'Críticos (≤ 30d)', value: prescricao.buckets.critico_30.quantidade },
            { label: 'Urgentes (≤ 90d)', value: prescricao.buckets.urgente_90.quantidade },
            { label: 'Atenção (≤ 180d)', value: prescricao.buckets.atencao_180.quantidade },
            { label: 'Próximos (≤ 365d)', value: prescricao.buckets.proximo_365.quantidade },
          ],
          note: `Valor total em risco: ${fmt(prescricao.totais.valor)} em ${prescricao.totais.quantidade} crédito(s).`,
        }, {
          title: 'Detalhamento',
          headers: ['PER/DCOMP', 'Tipo', 'Saldo', 'Prescrição', 'Dias restantes'],
          rows: (prescricao.itens || []).map((i: any) => [
            i.numero_perdcomp_origem || i.perdcomp_inicial || '—',
            i.tipo_credito || '—',
            fmt(i.saldo_disponivel ?? i.saldo_credito),
            fmtDate(i.data_prescricao),
            String(i.dias_para_prescricao ?? '—'),
          ]),
        }],
      };
    }
    if (tab === 4 && retrabalho) {
      return {
        titulo: `${tituloBase} — Retrabalho`,
        subtitulo: 'Índice de retificações e PER/DCOMPs problemáticos',
        empresa: empresaNome, geradoEm,
        secoes: [{
          title: 'Indicadores',
          kpis: [
            { label: 'Índice de Retrabalho', value: `${retrabalho.resumo.indice_retrabalho_pct}%` },
            { label: 'Total de Documentos', value: retrabalho.resumo.total_documentos },
            { label: 'Retificadores', value: retrabalho.resumo.total_retificadores },
            { label: 'Originais Retificados', value: retrabalho.resumo.documentos_originais_retificados },
          ],
        }, {
          title: 'Retrabalho por empresa',
          headers: ['Empresa', 'CNPJ', 'Total docs', 'Retificadores', 'Índice (%)'],
          rows: (retrabalho.por_empresa || []).map(e => [
            e.razao_social, e.cnpj, e.total, e.retificadores, `${e.indice_retrabalho_pct}%`,
          ]),
        }, {
          title: 'Detalhamento',
          headers: ['PER/DCOMP', 'Tipo', 'Status', 'Data entrega'],
          rows: (retrabalho.detalhamento || []).map((i: any) => [
            i.numero || '—', i.tipo_documento || '—', i.status_normalizado || '—',
            fmtDate(i.data_entrega),
          ]),
        }],
      };
    }
    if (tab === 5 && risco) {
      return {
        titulo: `${tituloBase} — Compensações em Risco`,
        subtitulo: 'Compensações cujo crédito já foi consumido e podem ser perdidas',
        empresa: empresaNome, geradoEm,
        secoes: [{
          title: 'Resumo',
          kpis: [
            { label: 'Quantidade', value: risco.totais.quantidade },
            { label: 'Valor Total em Risco', value: fmt(risco.totais.valor_em_risco) },
          ],
        }, {
          title: 'Detalhamento',
          headers: ['PER/DCOMP', 'Tipo', 'Status', 'Valor', 'Data entrega'],
          rows: (risco.itens || []).map((i: any) => [
            i.numero || '—', i.tipo_documento || '—', i.status_normalizado || '—',
            fmt(i.valor || i.valor_pedido), fmtDate(i.data_entrega),
          ]),
          note: 'Compensações já transmitidas cujo status no e-CAC indica que o crédito pode ter sido perdido (indeferido / não homologado / cancelado).',
        }],
      };
    }
    return { titulo: tituloBase, empresa: empresaNome, geradoEm, secoes: [] };
  };

  const handleExport = async (formato: 'pdf' | 'docx' | 'xlsx') => {
    setExportAnchor(null);
    setExportando(true);
    try {
      const data = construirReportData();
      if (data.secoes.length === 0) {
        setErro('Nada para exportar — carregue o relatório primeiro');
        return;
      }
      await exportarRelatorio(formato, data, `Relatorio_${TAB_LABELS[tab]}`);
    } catch (e: any) {
      setErro(`Erro ao exportar: ${e.message || 'desconhecido'}`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight={700} color={T.navy}>Relatórios PER/DCOMP</Typography>
          <Typography variant="body2" color="text.secondary">
            Visão consolidada dos créditos, prescrição, retrabalho e compensações em risco
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center" justifyContent="flex-end">
          <Tooltip title="Exportar relatório atual">
            <Button
              variant="outlined"
              startIcon={exportando ? <CircularProgress size={16} /> : <DownloadIcon />}
              onClick={(e) => setExportAnchor(e.currentTarget)}
              disabled={exportando || loading}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
              Exportar
            </Button>
          </Tooltip>
          <Menu anchorEl={exportAnchor} open={!!exportAnchor} onClose={() => setExportAnchor(null)}>
            <MenuItem onClick={() => handleExport('pdf')}>
              <PictureAsPdf sx={{ mr: 1, color: '#e53935' }} fontSize="small" /> Exportar como PDF
            </MenuItem>
            <MenuItem onClick={() => handleExport('docx')}>
              <DocIcon sx={{ mr: 1, color: '#1976d2' }} fontSize="small" /> Exportar como Word (.docx)
            </MenuItem>
            <MenuItem onClick={() => handleExport('xlsx')}>
              <TableView sx={{ mr: 1, color: '#2e7d32' }} fontSize="small" /> Exportar como Excel (.xlsx)
            </MenuItem>
          </Menu>
          <IconButton onClick={carregar} sx={{ color: T.cyan }}>
            <Refresh />
          </IconButton>
        </Stack>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}

      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}
          sx={{ '& .MuiTab-root': { textTransform: 'none', fontWeight: 600 },
                '& .Mui-selected': { color: T.cyan },
                '& .MuiTabs-indicator': { backgroundColor: T.cyan } }}>
          <Tab label="Visão Geral" />
          <Tab label="Controle Consolidado" icon={<TableChartIcon sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label="Saldos Disponíveis" icon={<AccountBalanceWallet sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label="Prescrição" icon={<AccessTime sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label="Retrabalho" icon={<Cached sx={{ fontSize: 18 }} />} iconPosition="start" />
          <Tab label="Compensações em Risco" icon={<Warning sx={{ fontSize: 18 }} />} iconPosition="start" />
        </Tabs>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {/* TAB 0: Dashboard */}
      {tab === 0 && dashboard && (
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <KpiCard label="Saldos Ativos" value={dashboard.saldos.ativos}
              sublabel={`${dashboard.saldos.quantidade} créditos cadastrados`}
              color="#22c55e" icon={<AccountBalanceWallet />} />
            <KpiCard label="Saldo Disponível" value={fmt(dashboard.saldos.total_disponivel)}
              sublabel={`Atualizado: ${fmt(dashboard.saldos.total_atualizado)}`}
              color="#22c55e" icon={<AccountBalanceWallet />} />
            <KpiCard label="Próximos da Prescrição" value={dashboard.prescricao.criticos_30d + dashboard.prescricao.urgentes_90d}
              sublabel={`Valor crítico (90 dias): ${fmt(dashboard.prescricao.valor_critico_90d)}`}
              color="#f59e0b" icon={<AccessTime />} />
            <KpiCard label="Índice de Retrabalho" value={`${dashboard.retrabalho.indice_pct}%`}
              sublabel={`${dashboard.retrabalho.retificadores} retificadores em ${dashboard.retrabalho.total} docs`}
              color="#8b5cf6" icon={<Cached />} />
            <KpiCard label="Compensações em Risco" value={dashboard.em_risco.quantidade}
              sublabel={fmt(dashboard.em_risco.valor)}
              color="#ef4444" icon={<Warning />} />
          </Stack>

          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={700} mb={2}>Documentos por Status (e-CAC normalizado)</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Status</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: T.textSecond }}>Quantidade</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600, color: T.textSecond }}>Valor (Crédito Atualizado)</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dashboard.documentos_por_status.map(s => (
                    <TableRow key={s.status}>
                      <TableCell>
                        <Chip size="small" label={s.label} color={STATUS_COLORS[s.status as StatusNormalizado] || 'default'} />
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>{s.quantidade}</TableCell>
                      <TableCell align="right">{fmt(s.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}

      {/* TAB 1: Controle Consolidado (reproduz a Tabela1 da planilha) */}
      {tab === 1 && consolidado && (() => {
        // Opções de LOVs derivadas dos dados carregados
        const numerosLov = Array.from(new Set(consolidado.creditos.map(c => c.perdcomp_inicial))).sort();
        const tiposLov = Array.from(new Set(consolidado.creditos.map(c => c.tipo_credito).filter(Boolean))).sort();
        const anosLov = Array.from(new Set(consolidado.creditos.map(c => c.ano_base).filter((a): a is string => !!a))).sort();
        // Filtragem local
        const filtered = consolidado.creditos.filter(c => {
          if (filtroPerdcomp && c.perdcomp_inicial !== filtroPerdcomp) return false;
          if (filtroTipoCredito && c.tipo_credito !== filtroTipoCredito) return false;
          if (filtroAnoBase && c.ano_base !== filtroAnoBase) return false;
          if (filtroStatusAtencao && c.status_atencao !== filtroStatusAtencao) return false;
          return true;
        });
        // Totais recalculados sobre o filtrado
        const t = {
          qtd_creditos: filtered.length,
          saldo_credito_atualizado: filtered.reduce((a, r) => a + Number(r.saldo_credito_atualizado || 0), 0),
          valor_credito_utilizado: filtered.reduce((a, r) => a + Number(r.valor_credito_utilizado || 0), 0),
          total_debitos: filtered.reduce((a, r) => a + Number(r.total_debitos || 0), 0),
          qtd_perdcomps: filtered.reduce((a, r) => a + Number(r.qtd_perdcomps || 0), 0),
        };
        return (
        <Stack spacing={2}>
          {/* Cards de totalização */}
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <KpiCard label="Créditos" value={t.qtd_creditos} color={T.cyan} />
            <KpiCard label="Saldo Atualizado" value={fmt(t.saldo_credito_atualizado)} color="#22c55e" />
            <KpiCard label="Total Utilizado" value={fmt(t.valor_credito_utilizado)} color="#ef4444" />
            <KpiCard label="Total Débitos Comp." value={fmt(t.total_debitos)} color="#d97706" />
            <KpiCard label="Nº PER/DCOMPs" value={t.qtd_perdcomps} color="#8b5cf6" />
          </Stack>

          {/* Barra de filtros */}
          <Paper sx={{ p: 2, borderRadius: 3 }}>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems="center" flexWrap="wrap">
              <Autocomplete size="small" sx={{ minWidth: 280, flex: '1 1 280px' }}
                options={numerosLov} value={filtroPerdcomp}
                onChange={(_, v) => setFiltroPerdcomp(v)}
                renderInput={(p) => <TextField {...p} label="Nº PER/DCOMP" placeholder="Selecione ou digite..." />}
              />
              <FormControl size="small" sx={{ minWidth: 240, flex: '1 1 240px' }}>
                <InputLabel>Tipo Crédito</InputLabel>
                <Select value={filtroTipoCredito} label="Tipo Crédito" onChange={e => setFiltroTipoCredito(e.target.value)}>
                  <MenuItem value="">Todos</MenuItem>
                  {tiposLov.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 140 }}>
                <InputLabel>Exercício</InputLabel>
                <Select value={filtroAnoBase} label="Exercício" onChange={e => setFiltroAnoBase(e.target.value)}>
                  <MenuItem value="">Todos</MenuItem>
                  {anosLov.map(a => <MenuItem key={a} value={a}>{a}</MenuItem>)}
                </Select>
              </FormControl>
              <FormControl size="small" sx={{ minWidth: 180 }}>
                <InputLabel>Status Atenção</InputLabel>
                <Select value={filtroStatusAtencao} label="Status Atenção" onChange={e => setFiltroStatusAtencao(e.target.value)}>
                  <MenuItem value="">Todos</MenuItem>
                  <MenuItem value="PRESCRITO">🔴 Prescrito</MenuItem>
                  <MenuItem value="URGENTE_6M">🟠 &lt; 6 meses</MenuItem>
                  <MenuItem value="ATENCAO_1A">🟡 &lt; 1 ano</MenuItem>
                  <MenuItem value="AVISO_2A">🟡 &lt; 2 anos</MenuItem>
                  <MenuItem value="OK">🟢 OK</MenuItem>
                </Select>
              </FormControl>
              {(filtroPerdcomp || filtroTipoCredito || filtroAnoBase || filtroStatusAtencao) && (
                <Chip label="Limpar filtros" onClick={() => { setFiltroPerdcomp(null); setFiltroTipoCredito(''); setFiltroAnoBase(''); setFiltroStatusAtencao(''); }} variant="outlined" />
              )}
            </Stack>
          </Paper>

          {/* Tabela analítica completa */}
          <TableContainer component={Paper} sx={{ borderRadius: 3, maxHeight: '70vh' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700, color: T.textSecond }}>PER/DCOMP Inicial</TableCell>
                  {!empresaId && <TableCell sx={{ fontWeight: 700, color: T.textSecond }}>Empresa</TableCell>}
                  <TableCell sx={{ fontWeight: 700, color: T.textSecond }}>Ano Base</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: T.textSecond }}>Prescrição</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: T.textSecond }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 700, color: T.textSecond }}>Tipo Crédito</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>Inicial</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>Utilizado</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>Saldo</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>SELIC%</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>Saldo Atualizado</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>IRPJ</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>CSLL</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>COFINS</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>PIS</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>INSS</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, color: T.textSecond }}>Total Débitos</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 700, color: T.textSecond }}>Nº DCOMPs</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={empresaId ? 17 : 18} align="center" sx={{ py: 4, color: T.textSecond }}>
                    {consolidado.creditos.length === 0
                      ? 'Nenhum crédito encontrado. Sincronize saldos a partir do e-CAC.'
                      : 'Nenhum crédito atende aos filtros aplicados.'}
                  </TableCell></TableRow>
                ) : filtered.map((c, i) => {
                  const atColor: Record<string, string> = {
                    PRESCRITO: '#dc2626', URGENTE_6M: '#ef4444', ATENCAO_1A: '#f97316', AVISO_2A: '#eab308', OK: '#22c55e',
                  };
                  const atLabel: Record<string, string> = {
                    PRESCRITO: 'Prescrito', URGENTE_6M: '< 6 meses', ATENCAO_1A: '< 1 ano', AVISO_2A: '< 2 anos', OK: '> 2 anos',
                  };
                  return (
                    <TableRow key={i} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{c.perdcomp_inicial}</TableCell>
                      {!empresaId && (
                        <TableCell sx={{ fontSize: '0.75rem' }}>
                          <Tooltip title={c.cnpj}><span>{c.empresa?.slice(0, 28)}{c.empresa?.length > 28 ? '...' : ''}</span></Tooltip>
                        </TableCell>
                      )}
                      <TableCell sx={{ fontSize: '0.75rem' }}>{c.ano_base || '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{fmtDate(c.data_prescricao)}</TableCell>
                      <TableCell align="center">
                        <Chip label={atLabel[c.status_atencao]} size="small"
                          sx={{ bgcolor: atColor[c.status_atencao], color: '#fff', fontWeight: 600, fontSize: '0.65rem', height: 20 }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem' }}>{c.tipo_credito}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{fmt(c.valor_credito_inicial)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#dc2626' }}>{fmt(c.valor_credito_utilizado)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#22c55e', fontWeight: 600 }}>{fmt(c.saldo_credito)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{(Number(c.selic_acumulada_pct) || 0).toFixed(2)}%</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem', color: '#2563eb', fontWeight: 600 }}>{fmt(c.saldo_credito_atualizado)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{Number(c.deb_irpj) > 0 ? fmt(c.deb_irpj) : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{Number(c.deb_csll) > 0 ? fmt(c.deb_csll) : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{Number(c.deb_cofins) > 0 ? fmt(c.deb_cofins) : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{Number(c.deb_pis) > 0 ? fmt(c.deb_pis) : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem' }}>{Number(c.deb_inss) > 0 ? fmt(c.deb_inss) : '—'}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{fmt(c.total_debitos)}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.75rem' }}>{c.qtd_perdcomps}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
        );
      })()}

      {/* TAB 2: Saldos Disponíveis */}
      {tab === 2 && (
        <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Nº PER/DCOMP Origem</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Empresa</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Tipo Crédito</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Exercício</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Crédito Atualizado</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Utilizado</TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>Saldo</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>% Util.</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Prescrição</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Origem</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {saldos.length === 0 ? (
                <TableRow><TableCell colSpan={11} align="center" sx={{ py: 6, color: T.textSecond }}>
                  Nenhum saldo de crédito disponível. Sincronize com o e-CAC para popular esta lista.
                </TableCell></TableRow>
              ) : saldos.map(s => {
                const dias = Number(s.dias_para_prescricao);
                const corPrescricao = isNaN(dias) ? T.textSecond
                  : dias <= 0 ? '#ef4444'
                  : dias <= 30 ? '#ef4444'
                  : dias <= 90 ? '#f59e0b'
                  : dias <= 180 ? '#facc15'
                  : '#22c55e';
                return (
                  <TableRow key={s.id} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>{s.numero_perdcomp_origem}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{s.razao_social}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{s.tipo_credito}</TableCell>
                    <TableCell sx={{ fontSize: '0.8rem' }}>{s.exercicio}</TableCell>
                    <TableCell>
                      <Chip size="small" label={STATUS_LABELS[s.status_normalizado] || s.status_normalizado}
                        color={STATUS_COLORS[s.status_normalizado] || 'default'} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{fmt(s.credito_atualizado)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', color: '#dc2626' }}>{fmt(s.total_utilizado)}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#22c55e' }}>{fmt(s.saldo_disponivel)}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem' }}>
                      <Chip size="small" label={`${s.percentual_utilizado}%`}
                        color={s.percentual_utilizado >= 100 ? 'error' : s.percentual_utilizado >= 70 ? 'warning' : 'success'} />
                    </TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.8rem', color: corPrescricao, fontWeight: 600 }}>
                      {fmtDate(s.data_prescricao)}
                      {!isNaN(dias) && (
                        <Typography variant="caption" display="block" color={corPrescricao}>
                          {dias <= 0 ? 'Prescrito' : `${dias} dias`}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.75rem' }}>
                      <Chip size="small" label={s.origem} variant="outlined" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* TAB 2: Prescrição */}
      {tab === 3 && prescricao && (
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <KpiCard label="Prescritos" value={prescricao.buckets.prescritos.quantidade}
              sublabel={fmt(prescricao.buckets.prescritos.valor)} color="#dc2626" icon={<Warning />} />
            <KpiCard label="Crítico (≤30d)" value={prescricao.buckets.critico_30.quantidade}
              sublabel={fmt(prescricao.buckets.critico_30.valor)} color="#ef4444" icon={<AccessTime />} />
            <KpiCard label="Urgente (31-90d)" value={prescricao.buckets.urgente_90.quantidade}
              sublabel={fmt(prescricao.buckets.urgente_90.valor)} color="#f59e0b" icon={<AccessTime />} />
            <KpiCard label="Atenção (91-180d)" value={prescricao.buckets.atencao_180.quantidade}
              sublabel={fmt(prescricao.buckets.atencao_180.valor)} color="#facc15" icon={<AccessTime />} />
            <KpiCard label="Próximo (181-365d)" value={prescricao.buckets.proximo_365.quantidade}
              sublabel={fmt(prescricao.buckets.proximo_365.valor)} color="#22c55e" icon={<AccessTime />} />
          </Stack>

          <Paper sx={{ borderRadius: 3 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Nº Crédito</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Empresa</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tipo</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Saldo Disponível</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Data Entrega</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Data Prescrição</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Dias Restantes</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {prescricao.itens.length === 0 ? (
                    <TableRow><TableCell colSpan={7} align="center" sx={{ py: 6, color: T.textSecond }}>
                      Nenhum crédito próximo da prescrição.
                    </TableCell></TableRow>
                  ) : prescricao.itens.map((i: any) => {
                    const dias = Number(i.dias_para_prescricao);
                    const cor = dias <= 0 ? '#dc2626' : dias <= 30 ? '#ef4444' : dias <= 90 ? '#f59e0b' : dias <= 180 ? '#facc15' : '#22c55e';
                    return (
                      <TableRow key={i.id} hover>
                        <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>{i.numero_perdcomp_origem}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{i.razao_social}</TableCell>
                        <TableCell sx={{ fontSize: '0.8rem' }}>{i.tipo_credito}</TableCell>
                        <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#22c55e' }}>{fmt(i.saldo_disponivel)}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{fmtDate(i.data_entrega_pedido)}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem', color: cor, fontWeight: 600 }}>{fmtDate(i.data_prescricao)}</TableCell>
                        <TableCell align="center" sx={{ fontSize: '0.8rem', color: cor, fontWeight: 700 }}>
                          {dias <= 0 ? 'PRESCRITO' : `${dias} dias`}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}

      {/* TAB 3: Retrabalho */}
      {tab === 4 && retrabalho && (
        <Stack spacing={3}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <KpiCard label="Total de Documentos" value={retrabalho.resumo.total_documentos} color={T.cyan} icon={<Gavel />} />
            <KpiCard label="Retificadores" value={retrabalho.resumo.total_retificadores} color="#8b5cf6" icon={<Cached />} />
            <KpiCard label="Originais Retificados" value={retrabalho.resumo.documentos_originais_retificados} color="#f59e0b" icon={<Cached />} />
            <KpiCard label="Índice de Retrabalho" value={`${retrabalho.resumo.indice_retrabalho_pct}%`} color="#dc2626" icon={<Warning />} />
          </Stack>

          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Typography variant="h6" fontWeight={700} mb={2}>Retrabalho por Empresa</Typography>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Empresa</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>CNPJ</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Total</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Retificadores</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Índice</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {retrabalho.por_empresa.map(e => (
                    <TableRow key={e.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>{e.razao_social}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{e.cnpj}</TableCell>
                      <TableCell align="right">{e.total}</TableCell>
                      <TableCell align="right">{e.retificadores}</TableCell>
                      <TableCell align="center">
                        <Chip size="small" label={`${e.indice_retrabalho_pct}%`}
                          color={e.indice_retrabalho_pct >= 30 ? 'error' : e.indice_retrabalho_pct >= 15 ? 'warning' : 'success'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>

          <Paper sx={{ borderRadius: 3 }}>
            <Box p={2}><Typography variant="h6" fontWeight={700}>Detalhamento (últimos 200 retificadores)</Typography></Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Retificador</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Documento Original</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Empresa</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tipo Crédito</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Data Original</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Data Retific.</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {retrabalho.detalhamento.map((d: any) => (
                    <TableRow key={d.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>{d.numero}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{d.numero_original || d.numero_perdcomp_inicial || '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{d.razao_social}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{d.tipo_credito}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{fmtDate(d.data_entrega_original)}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{fmtDate(d.data_entrega)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={STATUS_LABELS[d.status_normalizado as StatusNormalizado] || d.status_ecac || '—'}
                          color={STATUS_COLORS[d.status_normalizado as StatusNormalizado] || 'default'} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}

      {/* TAB 4: Compensações em Risco */}
      {tab === 5 && risco && (
        <Stack spacing={3}>
          <Alert severity="warning" sx={{ borderRadius: 3 }}>
            <Typography variant="body2">
              Compensações já transmitidas e cujo status no e-CAC indica que o crédito pode ter sido perdido (indeferido / não homologado / cancelado).
              <strong> O crédito já foi consumido na transmissão</strong> — a movimentação permanece registrada, mas há risco de cobrança do débito original com multa e juros.
            </Typography>
          </Alert>

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
            <KpiCard label="Compensações em Risco" value={risco.totais.quantidade} color="#dc2626" icon={<Warning />} />
            <KpiCard label="Valor em Risco" value={fmt(risco.totais.valor_em_risco)} color="#dc2626" icon={<Warning />} />
          </Stack>

          <Paper sx={{ borderRadius: 3 }}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600 }}>Nº DComp</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Crédito Origem</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Empresa</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Tipo Crédito</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 600 }}>Data Entrega</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Valor Compensado</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>Total Débitos</TableCell>
                    <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {risco.itens.length === 0 ? (
                    <TableRow><TableCell colSpan={8} align="center" sx={{ py: 6, color: T.textSecond }}>
                      Nenhuma compensação em risco identificada.
                    </TableCell></TableRow>
                  ) : risco.itens.map((i: any) => (
                    <TableRow key={i.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem', fontWeight: 600 }}>{i.numero}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>{i.numero_perdcomp_inicial || '—'}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{i.razao_social}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{i.tipo_credito}</TableCell>
                      <TableCell align="center" sx={{ fontSize: '0.8rem' }}>{fmtDate(i.data_entrega)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem', fontWeight: 700, color: '#dc2626' }}>{fmt(i.credito_original_utilizado)}</TableCell>
                      <TableCell align="right" sx={{ fontSize: '0.8rem' }}>{fmt(i.total_debitos_dcomp)}</TableCell>
                      <TableCell>
                        <Tooltip title={i.status_ecac || ''}>
                          <Chip size="small" label={STATUS_LABELS[i.status_normalizado as StatusNormalizado] || i.status_ecac || '—'}
                            color={STATUS_COLORS[i.status_normalizado as StatusNormalizado] || 'default'} />
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Stack>
      )}
    </Box>
  );
}
