import { useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import {
  Box, Paper, Typography, Grid, MenuItem, TextField, Stack, Chip, Tooltip,
  CircularProgress, Alert, Divider, IconButton, Autocomplete,
} from '@mui/material';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
  RadialBarChart, RadialBar,
} from 'recharts';
import {
  TrendingUp, AccountBalance, AttachMoney, Speed, Verified, WarningAmberRounded,
  Refresh as RefreshIcon, Info as InfoIcon, Schedule, ReceiptLong, Business,
} from '@mui/icons-material';
import { useEmpresa } from '../../contexts/EmpresaContext';
import { perdcompBIService, type BIDashboardResponse } from '../../services/perdcompBIService';

const T = {
  navy: '#0a1628', cyan: '#00c8f0', emerald: '#22c55e', amber: '#f59e0b',
  coral: '#ef4444', violet: '#a78bfa', slate: '#64748b', light: '#f8fafc',
};

// Paleta para gráficos categóricos (ordem do gradiente clean/exec dashboard)
const PALETTE = [T.cyan, T.emerald, T.amber, T.violet, T.coral, '#0ea5e9', '#84cc16', '#ec4899', '#14b8a6', '#fb923c'];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  deferido:   { label: 'Deferido / Homologado',   color: T.emerald },
  indeferido: { label: 'Indeferido / Cancelado',  color: T.coral },
  analise:    { label: 'Em análise / Ativo',      color: T.cyan },
  retificado: { label: 'Retificado',               color: T.amber },
  outros:     { label: 'Outros',                   color: T.slate },
};

const fmtMoeda = (v?: number | null) => {
  if (v == null) return '—';
  if (Math.abs(v) >= 1_000_000) return `R$ ${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000)     return `R$ ${(v / 1_000).toFixed(1)}k`;
  return `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};
const fmtMoedaFull = (v?: number | null) =>
  v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const fmtPct = (v?: number | null) => v == null ? '—' : `${v.toFixed(1)}%`;
const fmtInt = (v?: number | null) => v == null ? '—' : v.toLocaleString('pt-BR');
const fmtMes = (m: any): string => {
  // "2025-03" → "mar/25"
  const [a, mes] = m.split('-');
  const nomes = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  return `${nomes[Number(mes) - 1]}/${a.slice(2)}`;
};

// ════════════════════════════════════════════════════════════════════════════
// Componente de KPI Card — visual clean com sombra suave e ícone temático
// ════════════════════════════════════════════════════════════════════════════
function KpiCard({ titulo, valor, sub, icon, cor, insight }: {
  titulo: string; valor: ReactNode; sub?: ReactNode; icon: ReactNode; cor: string; insight?: ReactNode;
}) {
  return (
    <Paper sx={{
      p: 2.5, borderRadius: 3, height: '100%', position: 'relative', overflow: 'hidden',
      transition: 'transform 0.2s, box-shadow 0.2s',
      '&:hover': { transform: 'translateY(-2px)', boxShadow: 4 },
    }}>
      {/* Barra de cor lateral */}
      <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, bgcolor: cor }} />
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="caption" sx={{ color: T.slate, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: '0.7rem' }}>
          {titulo}
        </Typography>
        <Box sx={{
          width: 32, height: 32, borderRadius: '50%',
          bgcolor: `${cor}22`, color: cor,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</Box>
      </Stack>
      <Typography variant="h4" sx={{ fontWeight: 800, color: T.navy, lineHeight: 1.1 }}>
        {valor}
      </Typography>
      {sub && (
        <Typography variant="caption" sx={{ color: T.slate, display: 'block', mt: 0.5 }}>
          {sub}
        </Typography>
      )}
      {insight && (
        <Box sx={{ mt: 1.5, pt: 1.5, borderTop: `1px dashed ${cor}55` }}>
          <Typography variant="caption" sx={{ color: cor, fontWeight: 600, fontSize: '0.7rem' }}>
            💡 {insight}
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

function ChartCard({ titulo, subtitulo, children, hint }: {
  titulo: string; subtitulo?: string; children: ReactNode; hint?: string;
}) {
  return (
    <Paper sx={{ p: 2.5, borderRadius: 3, height: '100%' }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={2}>
        <Box>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>
            {titulo}
          </Typography>
          {subtitulo && (
            <Typography variant="caption" sx={{ color: T.slate, display: 'block' }}>
              {subtitulo}
            </Typography>
          )}
        </Box>
        {hint && (
          <Tooltip title={hint} arrow>
            <InfoIcon sx={{ fontSize: 16, color: T.slate, cursor: 'help' }} />
          </Tooltip>
        )}
      </Stack>
      {children}
    </Paper>
  );
}

// Tooltip customizado: usa nosso visual em vez do default do recharts
function TT({ active, payload, label, format }: any) {
  if (!active || !payload?.length) return null;
  return (
    <Paper sx={{ p: 1.2, border: `1px solid ${T.cyan}55`, borderRadius: 2, bgcolor: 'white' }}>
      {label && <Typography variant="caption" sx={{ fontWeight: 700, color: T.navy, display: 'block', mb: 0.5 }}>{label}</Typography>}
      {payload.map((p: any, i: number) => (
        <Stack key={i} direction="row" gap={1} alignItems="center">
          <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: p.color || p.fill }} />
          <Typography variant="caption" sx={{ color: T.slate }}>{p.name}:</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700, color: T.navy }}>
            {format ? format(p.value) : p.value}
          </Typography>
        </Stack>
      ))}
    </Paper>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Insights automáticos (análise inteligente em texto livre)
// ════════════════════════════════════════════════════════════════════════════
function gerarInsights(data: BIDashboardResponse): string[] {
  const insights: string[] = [];
  const { kpis, status_distribuicao, evolucao, creditos_por_tipo, compliance } = data;

  if (kpis.taxa_deferimento != null) {
    if (kpis.taxa_deferimento >= 80) insights.push(`Taxa de deferimento alta (${kpis.taxa_deferimento.toFixed(1)}%) — fluxo saudável.`);
    else if (kpis.taxa_deferimento < 50) insights.push(`Taxa de deferimento baixa (${kpis.taxa_deferimento.toFixed(1)}%) — revise critérios de elaboração antes de novos pedidos.`);
  }

  const emAnalise = status_distribuicao.find(s => s.chave === 'analise')?.total || 0;
  if (emAnalise > kpis.total_documentos * 0.3) {
    insights.push(`${emAnalise} PER/DCOMPs em análise (${((emAnalise / kpis.total_documentos) * 100).toFixed(0)}% do total) — capital represado.`);
  }

  // Tendência: compara últimos 3 meses vs 3 anteriores
  if (evolucao.length >= 6) {
    const ult3 = evolucao.slice(-3).reduce((a, b) => a + b.valor, 0);
    const ant3 = evolucao.slice(-6, -3).reduce((a, b) => a + b.valor, 0);
    if (ant3 > 0) {
      const delta = ((ult3 - ant3) / ant3) * 100;
      if (Math.abs(delta) > 15) {
        insights.push(`${delta > 0 ? '↗' : '↘'} Volume nos últimos 3 meses ${delta > 0 ? 'subiu' : 'caiu'} ${Math.abs(delta).toFixed(0)}% vs trimestre anterior.`);
      }
    }
  }

  if (creditos_por_tipo.length > 0) {
    const top = creditos_por_tipo[0];
    const share = (top.valor / Math.max(1, kpis.credito_atualizado)) * 100;
    if (share > 50) {
      insights.push(`Concentração de ${share.toFixed(0)}% do crédito em "${top.tipo}" — diversificar reduz risco de glosas.`);
    }
  }

  if (kpis.saldo_disponivel > kpis.credito_utilizado * 0.5 && kpis.saldo_disponivel > 100_000) {
    insights.push(`Saldo de ${fmtMoeda(kpis.saldo_disponivel)} parado — avalie acelerar compensação de débitos.`);
  }

  if (compliance.sem_recibo > 0 && compliance.total_elegivel > 0) {
    const pct = (compliance.sem_recibo / compliance.total_elegivel) * 100;
    if (pct > 10) {
      insights.push(`${compliance.sem_recibo} documentos elegíveis sem recibo baixado (${pct.toFixed(0)}%) — risco em fiscalização.`);
    }
  }

  if (kpis.tempo_medio_dias && kpis.tempo_medio_dias > 365) {
    insights.push(`Tempo médio de análise de ${Math.round(kpis.tempo_medio_dias)} dias — planeje fluxo de caixa com horizonte longo.`);
  }

  if (insights.length === 0) {
    insights.push('Sem desvios relevantes nos indicadores no período selecionado.');
  }
  return insights;
}

// ════════════════════════════════════════════════════════════════════════════
// Página BI
// ════════════════════════════════════════════════════════════════════════════
export default function BIPage() {
  const { empresaId, empresas } = useEmpresa();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [data, setData] = useState<BIDashboardResponse | null>(null);
  // Período aberto por padrão para evitar BI vazio quando há poucos docs recentes
  const [periodoPreset, setPeriodoPreset] = useState<'12m' | '24m' | '36m' | 'all' | 'custom'>('all');
  const [periodoInicio, setPeriodoInicio] = useState<string>('');
  const [periodoFim, setPeriodoFim] = useState<string>('');
  // Multi-select de empresas próprio da página — independente da LOV global,
  // mas pré-populado com a empresa global se houver uma selecionada.
  const [empresasSelecionadas, setEmpresasSelecionadas] = useState<number[]>([]);
  // Sincroniza com a LOV global na primeira renderização (e quando o usuário trocar)
  useEffect(() => {
    if (empresaId && !empresasSelecionadas.includes(empresaId)) {
      setEmpresasSelecionadas([empresaId]);
    } else if (!empresaId && empresasSelecionadas.length === 0) {
      // Sem seleção global e sem seleção local → mostra todas
    }
  }, [empresaId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Calcula filtro de período baseado no preset
  const filtroPeriodo = useMemo(() => {
    if (periodoPreset === 'all') return { inicio: '', fim: '' };
    if (periodoPreset === 'custom') return { inicio: periodoInicio, fim: periodoFim };
    const meses = periodoPreset === '12m' ? 12 : periodoPreset === '24m' ? 24 : 36;
    const dt = new Date();
    dt.setMonth(dt.getMonth() - meses);
    return { inicio: dt.toISOString().slice(0, 10), fim: '' };
  }, [periodoPreset, periodoInicio, periodoFim]);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const r = await perdcompBIService.dashboard({
        ids_empresas: empresasSelecionadas.length > 0 ? empresasSelecionadas : null,
        periodo_inicio: filtroPeriodo.inicio || null,
        periodo_fim: filtroPeriodo.fim || null,
      });
      setData(r);
    } catch (e: any) {
      setErro(e?.response?.data?.error || 'Falha ao carregar BI');
    } finally {
      setLoading(false);
    }
  }, [empresasSelecionadas, filtroPeriodo.inicio, filtroPeriodo.fim]);

  useEffect(() => { carregar(); }, [carregar]);

  const insights = useMemo(() => data ? gerarInsights(data) : [], [data]);

  // ─── KPIs com pequenos insights inline ──────────────────────────────
  const kpiInsights = useMemo(() => {
    if (!data) return {} as Record<string, string | undefined>;
    const k = data.kpis;
    const map: Record<string, string | undefined> = {};
    if (k.docs_legados > 0)
      map.total = `${k.docs_legados} legados pré-2018`;
    if (k.credito_original > 0)
      map.atualizado = `+${(((k.credito_atualizado - k.credito_original) / k.credito_original) * 100).toFixed(1)}% pela SELIC`;
    if (k.credito_original > 0)
      map.utilizado = `${((k.credito_utilizado / k.credito_original) * 100).toFixed(0)}% do crédito original`;
    if (k.taxa_deferimento != null && k.taxa_deferimento >= 70) map.taxa = 'Performance acima da média';
    else if (k.taxa_deferimento != null && k.taxa_deferimento < 50) map.taxa = 'Atenção: revisar elaboração';
    return map;
  }, [data]);

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>
          BI · Inteligência de PERD/Comp
        </Typography>
        <Typography variant="body2" sx={{ color: T.slate }}>
          Indicadores estratégicos e análises automáticas para apoiar decisões sobre créditos tributários.
        </Typography>
      </Box>

      {/* ═══ Filtros ═══════════════════════════════════════════════════════ */}
      <Paper sx={{ p: 2, borderRadius: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={2} alignItems={{ xs: 'stretch', sm: 'center' }}>
          <TextField
            label="Período"
            select
            size="small"
            value={periodoPreset}
            onChange={(e) => setPeriodoPreset(e.target.value as any)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="12m">Últimos 12 meses</MenuItem>
            <MenuItem value="24m">Últimos 24 meses</MenuItem>
            <MenuItem value="36m">Últimos 36 meses</MenuItem>
            <MenuItem value="all">Todo o histórico</MenuItem>
            <MenuItem value="custom">Personalizado…</MenuItem>
          </TextField>
          {periodoPreset === 'custom' && (
            <>
              <TextField label="De"  type="date" size="small" InputLabelProps={{ shrink: true }}
                value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
              <TextField label="Até" type="date" size="small" InputLabelProps={{ shrink: true }}
                value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
            </>
          )}
          <Autocomplete
            multiple
            size="small"
            options={empresas}
            getOptionLabel={(opt) => `${opt.razao_social} — ${opt.cnpj}`}
            value={empresas.filter(e => empresasSelecionadas.includes(e.id))}
            onChange={(_, val) => setEmpresasSelecionadas(val.map(v => v.id))}
            isOptionEqualToValue={(o, v) => o.id === v.id}
            sx={{ flex: 1, minWidth: 280 }}
            renderTags={(value, getTagProps) =>
              value.map((option, index) => (
                <Chip
                  {...getTagProps({ index })}
                  key={option.id}
                  label={option.razao_social.length > 22 ? option.razao_social.substring(0, 20) + '…' : option.razao_social}
                  size="small"
                  sx={{ bgcolor: `${T.cyan}22`, color: T.navy, fontWeight: 600 }}
                />
              ))
            }
            renderInput={(params) => (
              <TextField {...params}
                label="Empresas"
                placeholder={empresasSelecionadas.length === 0 ? 'Todas as empresas' : ''}
                InputProps={{
                  ...params.InputProps,
                  startAdornment: (
                    <>
                      <Business sx={{ fontSize: 18, color: T.slate, ml: 0.5, mr: 0.5 }} />
                      {params.InputProps.startAdornment}
                    </>
                  ),
                }}
              />
            )}
          />
          <IconButton onClick={carregar} disabled={loading} sx={{ color: T.cyan }}>
            <RefreshIcon />
          </IconButton>
        </Stack>
      </Paper>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}

      {loading ? (
        <Box display="flex" justifyContent="center" py={10}>
          <CircularProgress sx={{ color: T.cyan }} />
        </Box>
      ) : !data ? null : data.kpis.total_documentos === 0 ? (
        <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center', border: `1px dashed ${T.cyan}55`, bgcolor: T.light }}>
          <ReceiptLong sx={{ fontSize: 56, color: T.cyan, opacity: 0.6, mb: 1 }} />
          <Typography variant="h6" sx={{ color: T.navy, fontWeight: 700, mb: 0.5 }}>
            Sem dados no período
          </Typography>
          <Typography variant="body2" sx={{ color: T.slate }}>
            Ajuste o filtro de período ou sincronize o e-CAC para popular as análises.
          </Typography>
        </Paper>
      ) : (
        <>
          {/* ═══ KPI Cards ═════════════════════════════════════════════════ */}
          <Grid container spacing={2} mb={3}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Total de PER/DCOMPs"
                valor={fmtInt(data.kpis.total_documentos)}
                sub={`${data.kpis.total_empresas} empresa(s) • ${data.kpis.docs_legados} legados`}
                icon={<ReceiptLong />}
                cor={T.cyan}
                insight={kpiInsights.total}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Crédito atualizado (SELIC)"
                valor={fmtMoeda(data.kpis.credito_atualizado)}
                sub={fmtMoedaFull(data.kpis.credito_atualizado)}
                icon={<AttachMoney />}
                cor={T.emerald}
                insight={kpiInsights.atualizado}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Crédito utilizado"
                valor={fmtMoeda(data.kpis.credito_utilizado)}
                sub={`${fmtMoeda(data.kpis.debitos_compensados)} em débitos compensados`}
                icon={<AccountBalance />}
                cor={T.violet}
                insight={kpiInsights.utilizado}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Saldo disponível"
                valor={fmtMoeda(data.kpis.saldo_disponivel)}
                sub={data.kpis.saldo_disponivel > 0 ? 'Pronto para compensação' : 'Sem saldo livre'}
                icon={<TrendingUp />}
                cor={data.kpis.saldo_disponivel > 0 ? T.emerald : T.slate}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Taxa de deferimento"
                valor={fmtPct(data.kpis.taxa_deferimento)}
                sub="Sobre pedidos com decisão final"
                icon={<Verified />}
                cor={
                  data.kpis.taxa_deferimento == null ? T.slate :
                  data.kpis.taxa_deferimento >= 70 ? T.emerald :
                  data.kpis.taxa_deferimento >= 50 ? T.amber : T.coral
                }
                insight={kpiInsights.taxa}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Tempo médio análise"
                valor={data.kpis.tempo_medio_dias ? `${Math.round(data.kpis.tempo_medio_dias)}d` : '—'}
                sub={data.kpis.tempo_mediana_dias ? `Mediana: ${Math.round(data.kpis.tempo_mediana_dias)}d` : undefined}
                icon={<Schedule />}
                cor={T.amber}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Compliance documental"
                valor={
                  data.compliance.total_elegivel
                    ? fmtPct((data.compliance.com_recibo / data.compliance.total_elegivel) * 100)
                    : '—'
                }
                sub={`${data.compliance.sem_recibo} sem recibo de ${data.compliance.total_elegivel}`}
                icon={<WarningAmberRounded />}
                cor={
                  !data.compliance.total_elegivel ? T.slate :
                  (data.compliance.com_recibo / data.compliance.total_elegivel) >= 0.9 ? T.emerald :
                  (data.compliance.com_recibo / data.compliance.total_elegivel) >= 0.7 ? T.amber : T.coral
                }
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <KpiCard
                titulo="Aproveitamento SELIC"
                valor={
                  data.kpis.credito_original > 0
                    ? `+${(((data.kpis.credito_atualizado - data.kpis.credito_original) / data.kpis.credito_original) * 100).toFixed(1)}%`
                    : '—'
                }
                sub={`${fmtMoeda(data.kpis.credito_atualizado - data.kpis.credito_original)} de correção`}
                icon={<Speed />}
                cor={T.cyan}
              />
            </Grid>
          </Grid>

          {/* ═══ Insights automáticos ══════════════════════════════════════ */}
          <Paper sx={{
            p: 2.5, borderRadius: 3, mb: 3,
            background: `linear-gradient(135deg, ${T.navy} 0%, #1e3a5f 100%)`,
            color: 'white',
          }}>
            <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
              <InfoIcon sx={{ color: T.cyan }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Análise inteligente</Typography>
              <Chip label="AUTO" size="small" sx={{ bgcolor: T.cyan, color: T.navy, fontWeight: 700, fontSize: '0.6rem', height: 16 }} />
            </Stack>
            <Grid container spacing={1}>
              {insights.map((ins, i) => (
                <Grid key={i} size={{ xs: 12, md: 6 }}>
                  <Stack direction="row" gap={1} alignItems="flex-start">
                    <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: T.cyan, mt: 0.8, flexShrink: 0 }} />
                    <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.9)' }}>{ins}</Typography>
                  </Stack>
                </Grid>
              ))}
            </Grid>
          </Paper>

          {/* ═══ Gráficos ══════════════════════════════════════════════════ */}
          <Grid container spacing={2}>
            {/* Evolução temporal — multi-empresa quando há 2+ empresas */}
            <Grid size={{ xs: 12, lg: 8 }}>
              <ChartCard
                titulo={data.multi_empresa ? "Evolução por empresa (crédito atualizado)" : "Evolução de PER/DCOMPs no tempo"}
                subtitulo={data.multi_empresa
                  ? "Uma linha por empresa — compare ritmos e sazonalidades"
                  : "Quantidade e valor de crédito atualizado por mês de entrega"}
                hint={data.multi_empresa
                  ? "Cruzamentos de linhas indicam mudança de liderança no volume de pedidos. Picos isolados em uma empresa merecem investigação."
                  : "Picos podem indicar fechamento de períodos fiscais. Compare quantidade × valor para perceber casos pontuais de alto valor."}
              >
                {data.multi_empresa && data.por_empresa ? (() => {
                  // Pivot: cada linha = mês; colunas = id_empresa → valor
                  const meses = Array.from(new Set(data.por_empresa.evolucao.map(p => p.mes))).sort();
                  const empresasUnicas = Array.from(
                    new Map(data.por_empresa.evolucao.map(p => [p.id_empresa, p.razao_social])).entries()
                  );
                  const pivot = meses.map(mes => {
                    const row: Record<string, any> = { mes };
                    for (const [id] of empresasUnicas) {
                      const p = data.por_empresa!.evolucao.find(e => e.mes === mes && e.id_empresa === id);
                      row[`e${id}`] = p ? p.valor : 0;
                    }
                    return row;
                  });
                  return (
                    <ResponsiveContainer width="100%" height={280}>
                      <LineChart data={pivot} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: T.slate }} />
                        <YAxis tickFormatter={fmtMoeda} tick={{ fontSize: 11, fill: T.slate }} />
                        <RTooltip content={<TT format={fmtMoedaFull} />} labelFormatter={fmtMes} />
                        <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                        {empresasUnicas.map(([id, razao], i) => (
                          <Line
                            key={id} type="monotone" dataKey={`e${id}`}
                            name={razao.length > 30 ? razao.substring(0, 28) + '…' : razao}
                            stroke={PALETTE[i % PALETTE.length]} strokeWidth={2}
                            dot={{ r: 2 }} activeDot={{ r: 5 }}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  );
                })() : (
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={data.evolucao} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="gradCyan" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={T.cyan} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={T.cyan} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradEmerald" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%"   stopColor={T.emerald} stopOpacity={0.5} />
                          <stop offset="100%" stopColor={T.emerald} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="mes" tickFormatter={fmtMes} tick={{ fontSize: 11, fill: T.slate }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: T.slate }} />
                      <YAxis yAxisId="right" orientation="right" tickFormatter={fmtMoeda} tick={{ fontSize: 11, fill: T.slate }} />
                      <RTooltip content={<TT format={undefined} />} labelFormatter={fmtMes} />
                      <Legend wrapperStyle={{ fontSize: '0.75rem' }} />
                      <Area yAxisId="left"  type="monotone" dataKey="total" name="Quantidade" stroke={T.cyan} fill="url(#gradCyan)" strokeWidth={2} />
                      <Area yAxisId="right" type="monotone" dataKey="valor" name="Valor (R$)" stroke={T.emerald} fill="url(#gradEmerald)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </Grid>

            {/* Status — pie quando 1 empresa, stacked bar quando multi */}
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard
                titulo={data.multi_empresa ? "Status por empresa" : "Distribuição por status"}
                subtitulo={data.multi_empresa
                  ? "Empilhamento revela perfil de risco e maturidade"
                  : "Situação atual dos PER/DCOMPs no e-CAC"}
                hint={data.multi_empresa
                  ? "Empresas com muito 'Em análise' têm capital represado. Foque deferimento nelas."
                  : "Foco em reduzir 'Em análise' através de provocações e em zerar 'Outros' classificando manualmente."}
              >
                {data.multi_empresa && data.por_empresa ? (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart
                      data={data.por_empresa.status.map(e => ({
                        razao: e.razao_social.length > 16 ? e.razao_social.substring(0, 14) + '…' : e.razao_social,
                        deferido:   e.buckets.deferido   || 0,
                        analise:    e.buckets.analise    || 0,
                        indeferido: e.buckets.indeferido || 0,
                        retificado: e.buckets.retificado || 0,
                        outros:     e.buckets.outros     || 0,
                      }))}
                      layout="vertical"
                      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: T.slate }} />
                      <YAxis dataKey="razao" type="category" tick={{ fontSize: 10, fill: T.navy }} width={100} />
                      <RTooltip content={<TT />} />
                      <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                      {(['deferido','analise','indeferido','retificado','outros'] as const).map(k => (
                        <Bar key={k} dataKey={k} stackId="a"
                          name={STATUS_LABELS[k]?.label || k}
                          fill={STATUS_LABELS[k]?.color || T.slate}
                          radius={k === 'outros' ? [0, 4, 4, 0] : undefined}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (<>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={data.status_distribuicao.map(s => ({
                        name: STATUS_LABELS[s.chave]?.label || s.chave,
                        value: s.total,
                        color: STATUS_LABELS[s.chave]?.color || T.slate,
                      }))}
                      dataKey="value" nameKey="name"
                      innerRadius={50} outerRadius={85}
                      paddingAngle={2}
                    >
                      {data.status_distribuicao.map((s, i) => (
                        <Cell key={i} fill={STATUS_LABELS[s.chave]?.color || T.slate} />
                      ))}
                    </Pie>
                    <RTooltip content={<TT />} />
                  </PieChart>
                </ResponsiveContainer>
                <Stack mt={1} gap={0.5}>
                  {data.status_distribuicao.map(s => (
                    <Stack key={s.chave} direction="row" alignItems="center" justifyContent="space-between">
                      <Stack direction="row" gap={0.75} alignItems="center">
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: STATUS_LABELS[s.chave]?.color || T.slate }} />
                        <Typography variant="caption" sx={{ color: T.navy }}>{STATUS_LABELS[s.chave]?.label || s.chave}</Typography>
                      </Stack>
                      <Typography variant="caption" sx={{ fontWeight: 700, color: T.navy }}>{fmtInt(s.total)}</Typography>
                    </Stack>
                  ))}
                </Stack>
                </>)}
              </ChartCard>
            </Grid>

            {/* Funil financeiro — comparativo por empresa em multi */}
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartCard
                titulo={data.multi_empresa ? "Comparativo de capital por empresa" : "Funil de aproveitamento financeiro"}
                subtitulo={data.multi_empresa
                  ? "Solicitado × atualizado × utilizado por empresa"
                  : "De solicitado → utilizado: onde está o seu capital"}
                hint={data.multi_empresa
                  ? "Barras de 'Utilizado' muito menores que 'Atualizado' indicam saldo parado naquela empresa."
                  : "Quanto maior o gap entre 'Atualizado' e 'Utilizado', mais saldo parado para compensação."}
              >
                {data.multi_empresa && data.por_empresa ? (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={data.por_empresa.kpis.map(e => ({
                        razao: e.razao_social.length > 14 ? e.razao_social.substring(0, 12) + '…' : e.razao_social,
                        Solicitado:  e.valor_solicitado,
                        Atualizado:  e.credito_atualizado,
                        Utilizado:   e.credito_utilizado,
                      }))}
                      margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="razao" tick={{ fontSize: 10, fill: T.navy }} interval={0} angle={-15} textAnchor="end" height={50} />
                      <YAxis tickFormatter={fmtMoeda} tick={{ fontSize: 11, fill: T.slate }} />
                      <RTooltip content={<TT format={fmtMoedaFull} />} />
                      <Legend wrapperStyle={{ fontSize: '0.7rem' }} />
                      <Bar dataKey="Solicitado"  fill={T.slate}   radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Atualizado"  fill={T.cyan}    radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Utilizado"   fill={T.violet}  radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={[
                        { etapa: 'Solicitado',  valor: data.funil.solicitado,  fill: T.slate },
                        { etapa: 'Atualizado',  valor: data.funil.atualizado,  fill: T.cyan },
                        { etapa: 'Utilizado',   valor: data.funil.utilizado,   fill: T.violet },
                        { etapa: 'Disponível',  valor: data.funil.disponivel,  fill: T.emerald },
                      ]}
                      layout="vertical"
                      margin={{ top: 8, right: 32, bottom: 0, left: 16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={fmtMoeda} tick={{ fontSize: 11, fill: T.slate }} />
                      <YAxis dataKey="etapa" type="category" tick={{ fontSize: 12, fill: T.navy, fontWeight: 600 }} width={90} />
                      <RTooltip content={<TT format={fmtMoedaFull} />} />
                      <Bar dataKey="valor" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </Grid>

            {/* Créditos por tipo — stacked por empresa em multi */}
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartCard
                titulo={data.multi_empresa ? "Créditos por tipo × empresa" : "Créditos por tipo de tributo"}
                subtitulo={data.multi_empresa
                  ? "Empilhamento mostra quem detém cada categoria de crédito"
                  : "Valor de crédito atualizado consolidado"}
                hint="Concentração alta em um único tipo aumenta o risco frente a mudanças de jurisprudência."
              >
                {data.multi_empresa && data.por_empresa ? (() => {
                  // Pivot: linha = tipo de crédito; colunas = id_empresa → valor
                  const tipos = Array.from(new Set(data.por_empresa.creditos_por_tipo.map(p => p.tipo)));
                  const empresasUnicas = Array.from(
                    new Map(data.por_empresa.creditos_por_tipo.map(p => [p.id_empresa, p.razao_social])).entries()
                  );
                  const pivot = tipos.map(tipo => {
                    const row: Record<string, any> = { tipo: tipo.length > 22 ? tipo.substring(0, 20) + '…' : tipo };
                    for (const [id] of empresasUnicas) {
                      const p = data.por_empresa!.creditos_por_tipo.find(e => e.tipo === tipo && e.id_empresa === id);
                      row[`e${id}`] = p ? p.valor : 0;
                    }
                    return row;
                  }).filter(r => empresasUnicas.some(([id]) => r[`e${id}`] > 0))
                    .sort((a, b) => empresasUnicas.reduce((s, [id]) => s + (b[`e${id}`] || 0), 0)
                                  - empresasUnicas.reduce((s, [id]) => s + (a[`e${id}`] || 0), 0))
                    .slice(0, 10);
                  return (
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={pivot} layout="vertical" margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis type="number" tickFormatter={fmtMoeda} tick={{ fontSize: 10, fill: T.slate }} />
                        <YAxis dataKey="tipo" type="category" tick={{ fontSize: 10, fill: T.navy }} width={140} />
                        <RTooltip content={<TT format={fmtMoedaFull} />} />
                        <Legend wrapperStyle={{ fontSize: '0.65rem' }} />
                        {empresasUnicas.map(([id, razao], i) => (
                          <Bar key={id} dataKey={`e${id}`} stackId="t"
                            name={razao.length > 22 ? razao.substring(0, 20) + '…' : razao}
                            fill={PALETTE[i % PALETTE.length]}
                            radius={i === empresasUnicas.length - 1 ? [0, 4, 4, 0] : undefined}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  );
                })() : (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.creditos_por_tipo} layout="vertical" margin={{ top: 8, right: 32, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={fmtMoeda} tick={{ fontSize: 11, fill: T.slate }} />
                      <YAxis dataKey="tipo" type="category" tick={{ fontSize: 11, fill: T.navy }} width={150}
                        tickFormatter={(v) => v.length > 22 ? v.substring(0, 20) + '…' : v} />
                      <RTooltip content={<TT format={fmtMoedaFull} />} />
                      <Bar dataKey="valor" name="Crédito (R$)" radius={[0, 6, 6, 0]}>
                        {data.creditos_por_tipo.map((_, i) => (
                          <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </Grid>

            {/* Tipo de documento (radial) */}
            <Grid size={{ xs: 12, md: 6 }}>
              <ChartCard
                titulo="Composição por tipo de documento"
                subtitulo="PER (Pedido) × DCOMP (Compensação) × demais formulários"
                hint="DCOMPs sinalizam uso ativo do crédito; PERs sem DCOMPs subsequentes podem indicar saldo parado."
              >
                <ResponsiveContainer width="100%" height={260}>
                  <RadialBarChart
                    cx="50%" cy="50%"
                    innerRadius="20%" outerRadius="100%"
                    data={data.documentos_por_tipo.map((d, i) => ({
                      name: d.tipo, value: d.total, fill: PALETTE[i % PALETTE.length],
                    }))}
                    startAngle={90} endAngle={-270}
                  >
                    <RadialBar background dataKey="value" cornerRadius={6} />
                    <Legend iconSize={10} layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '0.7rem', lineHeight: '1rem' }} />
                    <RTooltip content={<TT />} />
                  </RadialBarChart>
                </ResponsiveContainer>
              </ChartCard>
            </Grid>

            {/* Top empresas (só quando todas) ou Compliance gauge (quando filtrado) */}
            <Grid size={{ xs: 12, md: 6 }}>
              {empresasSelecionadas.length !== 1 && data.top_empresas.length > 0 ? (
                <ChartCard
                  titulo="Top 10 empresas por crédito"
                  subtitulo="Maiores carteiras consolidadas (SELIC)"
                  hint="Empresas com alto saldo + baixa utilização são candidatas prioritárias a planos de compensação."
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={data.top_empresas} layout="vertical" margin={{ top: 8, right: 32, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis type="number" tickFormatter={fmtMoeda} tick={{ fontSize: 11, fill: T.slate }} />
                      <YAxis dataKey="razao_social" type="category" tick={{ fontSize: 10, fill: T.navy }} width={160}
                        tickFormatter={(v) => v.length > 22 ? v.substring(0, 20) + '…' : v} />
                      <RTooltip content={<TT format={fmtMoedaFull} />} />
                      <Bar dataKey="valor" name="Crédito (R$)" fill={T.cyan} radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>
              ) : (
                <ChartCard
                  titulo="Compliance documental"
                  subtitulo="Cobertura de recibos e PDFs sobre documentos elegíveis (>= 2018)"
                  hint="Documentos sem recibo são vulnerabilidade em fiscalização. Mire 95%+ de cobertura."
                >
                  <Box display="flex" flexDirection={{ xs: 'column', sm: 'row' }} gap={2} alignItems="center" justifyContent="center" height={260}>
                    {(['com_recibo', 'com_pdf'] as const).map((k) => {
                      const valor = data.compliance[k];
                      const total = data.compliance.total_elegivel || 1;
                      const pct = (valor / total) * 100;
                      const cor = pct >= 90 ? T.emerald : pct >= 70 ? T.amber : T.coral;
                      return (
                        <Box key={k} sx={{ position: 'relative', width: 140, height: 140 }}>
                          <CircularProgress variant="determinate" value={100} size={140} thickness={5}
                            sx={{ color: '#e2e8f0', position: 'absolute' }} />
                          <CircularProgress variant="determinate" value={pct} size={140} thickness={5}
                            sx={{ color: cor, position: 'absolute', transform: 'rotate(-90deg)!important' }} />
                          <Box sx={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="h5" sx={{ fontWeight: 800, color: T.navy }}>{pct.toFixed(0)}%</Typography>
                            <Typography variant="caption" sx={{ color: T.slate, textAlign: 'center' }}>
                              {k === 'com_recibo' ? 'com recibo' : 'com PDF completo'}
                            </Typography>
                            <Typography variant="caption" sx={{ color: T.slate, fontSize: '0.65rem' }}>{valor}/{total}</Typography>
                          </Box>
                        </Box>
                      );
                    })}
                  </Box>
                </ChartCard>
              )}
            </Grid>

            {/* Rodapé: nota */}
            <Grid size={{ xs: 12 }}>
              <Divider sx={{ my: 1 }} />
              <Typography variant="caption" sx={{ color: T.slate, display: 'block', textAlign: 'center' }}>
                Dados atualizados em tempo real a partir do e-CAC e dos recibos PER/DCOMP processados. Valores em R$ refletem crédito atualizado pela SELIC.
              </Typography>
            </Grid>
          </Grid>
        </>
      )}
    </Box>
  );
}
