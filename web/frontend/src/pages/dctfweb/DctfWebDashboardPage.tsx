import { useEffect, useState, useCallback } from 'react';
import { Box, Paper, Typography, Stack, Grid, Chip, Alert, CircularProgress, LinearProgress, Divider } from '@mui/material';
import {
  Receipt as ReceiptIcon, AccountBalance as BankIcon, Warning as WarningIcon,
  TrendingUp as TrendingIcon, ErrorOutline as ErrIcon, Schedule as ClockIcon,
} from '@mui/icons-material';
import { dctfwebService, type DctfwebDashboard } from '../../services/dctfwebService';
import { useEmpresa } from '../../contexts/EmpresaContext';

const T = { navy: '#0a1628', cyan: '#00c8f0', cyanHover: '#00b0d8', textSecond: '#64748b', emerald: '#22c55e', amber: '#d29922', red: '#ef4444' };

const SIT_COLORS: Record<string, string> = {
  EM_EDICAO: T.amber,
  TRANSMITIDA: T.cyan,
  ACEITA: T.emerald,
  REJEITADA: T.red,
  RETIFICADA: '#a855f7',
  SEM_MOVIMENTO: '#94a3b8',
  DESCONHECIDA: '#64748b',
};

function brl(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function KpiCard({ label, value, hint, color = T.navy, icon, warning }: {
  label: string; value: string; hint?: string; color?: string; icon?: React.ReactNode; warning?: boolean;
}) {
  return (
    <Paper sx={{
      p: 2.5, borderRadius: 3, height: '100%',
      borderLeft: `4px solid ${color}`,
      bgcolor: warning ? `${color}0a` : 'white',
    }}>
      <Stack direction="row" alignItems="flex-start" gap={1}>
        {icon && <Box sx={{ color, mt: 0.5 }}>{icon}</Box>}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="caption" sx={{ color: T.textSecond, textTransform: 'uppercase', letterSpacing: 0.4, fontSize: 10, fontWeight: 600 }}>
            {label}
          </Typography>
          <Typography variant="h5" sx={{ fontWeight: 700, color, mt: 0.5 }}>{value}</Typography>
          {hint && <Typography variant="caption" sx={{ color: T.textSecond, display: 'block', mt: 0.5 }}>{hint}</Typography>}
        </Box>
      </Stack>
    </Paper>
  );
}

export default function DctfWebDashboardPage() {
  const { empresaId } = useEmpresa();
  const [data, setData] = useState<DctfwebDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const d = await dctfwebService.dashboard(empresaId ? Number(empresaId) : undefined);
      setData(d);
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao carregar dashboard');
    } finally { setLoading(false); }
  }, [empresaId]);
  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <Box display="flex" justifyContent="center" py={8}><CircularProgress sx={{ color: T.cyan }} /></Box>;
  if (erro) return <Alert severity="error">{erro}</Alert>;
  if (!data) return null;

  const k = data.kpis;
  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>DCTF Web · Painel</Typography>
        <Typography variant="body2" sx={{ color: T.textSecond }}>
          Visão geral das declarações e DARFs. Use o seletor de empresa no topo para focar em uma empresa específica.
        </Typography>
      </Box>

      {data.warning && (
        <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
          {data.warning} — após a primeira sincronização os dados aparecerão aqui.
        </Alert>
      )}

      <Grid container spacing={2} mb={3}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard label="Declarações totais" value={String(k.total_declaracoes)} hint={`${k.taxa_transmissao}% transmitidas`} icon={<ReceiptIcon />} color={T.cyan} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard label="Total a pagar" value={brl(k.total_a_pagar)} hint="soma dos saldos a pagar" icon={<BankIcon />} color={T.navy} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard label="DARFs vencidos" value={String(k.darfs_vencidos)} hint={brl(k.valor_vencidos)} icon={<ErrIcon />} color={T.red} warning={k.darfs_vencidos > 0} />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard label="Divergências (eSocial/Reinf)" value={String(k.declaracoes_com_divergencia)} hint="declarações p/ revisar" icon={<WarningIcon />} color={T.amber} warning={k.declaracoes_com_divergencia > 0} />
        </Grid>
      </Grid>

      {/* ═══ KPIs do manual: Em andamento + Impede CND + MAED pendente ═══ */}
      <Grid container spacing={2} mb={3}>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KpiCard
            label="Em andamento (não transmitidas)"
            value={String(k.declaracoes_em_andamento || 0)}
            hint="aguardando transmissão (manual cap. 7)"
            icon={<WarningIcon />}
            color={T.amber}
            warning={(k.declaracoes_em_andamento || 0) > 0}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KpiCard
            label="Impedem emissão de CND"
            value={String(k.declaracoes_impedem_cnd || 0)}
            hint="retificadora pendente — cap. 17.1.1"
            icon={<ErrIcon />}
            color={T.red}
            warning={(k.declaracoes_impedem_cnd || 0) > 0}
          />
        </Grid>
        <Grid size={{ xs: 12, sm: 4 }}>
          <KpiCard
            label="MAED pendente"
            value={brl(k.valor_maed_pendente || 0)}
            hint="multas por atraso na entrega (cap. 5)"
            icon={<BankIcon />}
            color={T.amber}
            warning={(k.valor_maed_pendente || 0) > 0}
          />
        </Grid>
      </Grid>

      {/* ═══ Por categoria oficial (manual cap. 8.1) ═══ */}
      {data.por_categoria && data.por_categoria.length > 0 && (
        <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
          <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
            <ReceiptIcon sx={{ color: T.cyan }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Por categoria</Typography>
            <Typography variant="caption" sx={{ color: T.textSecond, ml: 1 }}>cap. 8.1 do manual</Typography>
          </Stack>
          <Stack gap={1.5}>
            {data.por_categoria.map((c) => {
              const totalAll = data.por_categoria.reduce((acc, x) => acc + x.total, 0) || 1;
              const pct = Math.round((c.total / totalAll) * 100);
              return (
                <Box key={c.chave}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Chip size="small" label={c.label} sx={{ bgcolor: `${T.cyan}22`, color: T.cyan, fontWeight: 700, fontSize: 11 }} />
                    <Typography variant="caption" sx={{ color: T.textSecond }}>{c.total} · {brl(c.valor)}</Typography>
                  </Stack>
                  <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, bgcolor: '#e2e8f0', '& .MuiLinearProgress-bar': { bgcolor: T.cyan } }} />
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      {/* ═══ Por origem dos débitos (manual cap. 8.2): eSocial / Reinf CP / Reinf RET / MIT / Sero ═══ */}
      {data.por_origem && data.por_origem.length > 0 && (
        <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
          <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
            <TrendingIcon sx={{ color: T.cyan }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Origem dos débitos</Typography>
              <Typography variant="caption" sx={{ color: T.textSecond }}>De onde vieram os valores que compõem a DCTFweb (cap. 8.2)</Typography>
            </Box>
          </Stack>
          <Grid container spacing={2}>
            {data.por_origem.map((o) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={o.chave}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
                  <Typography variant="caption" sx={{ color: T.textSecond, fontWeight: 700, letterSpacing: 0.5 }}>{o.label.toUpperCase()}</Typography>
                  <Typography variant="h6" sx={{ fontWeight: 700, color: T.navy, mt: 0.5 }}>{brl(o.valor)}</Typography>
                  <Typography variant="caption" sx={{ color: T.textSecond, display: 'block', mt: 0.5 }}>{o.descricao}</Typography>
                </Paper>
              </Grid>
            ))}
          </Grid>
        </Paper>
      )}

      {/* ═══ Alertas de CND impedida (manual cap. 17.1.1) ═══ */}
      {data.alertas_cnd && data.alertas_cnd.length > 0 && (
        <Paper sx={{ p: 3, borderRadius: 3, mb: 3, borderLeft: `4px solid ${T.red}` }}>
          <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
            <ErrIcon sx={{ color: T.red }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.red }}>
                {data.alertas_cnd.length} declaração(ões) impedindo CND
              </Typography>
              <Typography variant="caption" sx={{ color: T.textSecond }}>
                Retificadora pendente sem transmissão (manual cap. 17.1.1). Resolva para liberar CND/CPD-EN.
              </Typography>
            </Box>
          </Stack>
          <Stack divider={<Divider />}>
            {data.alertas_cnd.slice(0, 5).map((a) => (
              <Box key={a.id} sx={{ py: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Chip size="small" label={`${a.dias_pendente}d`} sx={{ bgcolor: `${T.red}22`, color: T.red, fontWeight: 700 }} />
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>{a.razao_social}</Typography>
                  <Typography variant="caption" sx={{ color: T.textSecond }}>
                    {a.cnpj} · {a.categoria} · {a.tipo} · PA {a.periodo_apuracao}
                  </Typography>
                </Box>
              </Box>
            ))}
          </Stack>
        </Paper>
      )}

      {/* ═══ Próximos PRAZOS LEGAIS (cap. 4.2) — diferente de DARF ═══ */}
      {data.proximos_prazos_legais && data.proximos_prazos_legais.length > 0 && (
        <Paper sx={{ p: 3, borderRadius: 3, mb: 3, borderLeft: `4px solid ${T.amber}` }}>
          <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
            <ClockIcon sx={{ color: T.amber }} />
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>
                Prazos legais próximos (entrega da declaração)
              </Typography>
              <Typography variant="caption" sx={{ color: T.textSecond }}>
                Declarações em andamento que vencem em até 15 dias (manual cap. 4.2). Após o prazo: MAED.
              </Typography>
            </Box>
          </Stack>
          <Stack divider={<Divider />}>
            {data.proximos_prazos_legais.map((p) => {
              const cor = p.dias_para_prazo < 0 ? T.red : p.dias_para_prazo < 3 ? T.red : p.dias_para_prazo < 7 ? T.amber : T.cyan;
              const label = p.dias_para_prazo < 0 ? `venceu há ${Math.abs(p.dias_para_prazo)}d` : p.dias_para_prazo === 0 ? 'vence hoje' : `${p.dias_para_prazo}d`;
              return (
                <Box key={p.id} sx={{ py: 1, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Chip size="small" label={label} sx={{ bgcolor: `${cor}22`, color: cor, fontWeight: 700, minWidth: 80 }} />
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>{p.razao_social}</Typography>
                    <Typography variant="caption" sx={{ color: T.textSecond }}>
                      {p.cnpj} · {p.categoria} · PA {p.periodo_apuracao} · prazo {new Date(p.prazo_legal).toLocaleDateString('pt-BR')}
                    </Typography>
                  </Box>
                  {p.debito_apurado > 0 && (
                    <Typography variant="caption" sx={{ color: T.textSecond, textAlign: 'right' }}>
                      débito: {brl(p.debito_apurado)}
                    </Typography>
                  )}
                </Box>
              );
            })}
          </Stack>
        </Paper>
      )}

      <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
        <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
          <ClockIcon sx={{ color: T.cyan }} />
          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Janela de vencimento</Typography>
            <Typography variant="caption" sx={{ color: T.textSecond }}>DARFs pendentes agrupados por urgência</Typography>
          </Box>
        </Stack>
        <Grid container spacing={2}>
          <Grid size={{ xs: 6, sm: 3 }}><KpiCard label="vence em 7 dias" value={String(k.darfs_a_vencer_7d)} hint={brl(k.valor_a_vencer_7d)} color={T.red} warning={k.darfs_a_vencer_7d > 0} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><KpiCard label="vence em 15 dias" value={String(k.darfs_a_vencer_15d)} hint={brl(k.valor_a_vencer_15d)} color={T.amber} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><KpiCard label="vence em 30 dias" value={String(k.darfs_a_vencer_30d)} hint={brl(k.valor_a_vencer_30d)} color={T.cyan} /></Grid>
          <Grid size={{ xs: 6, sm: 3 }}><KpiCard label="DARFs vencidos" value={String(k.darfs_vencidos)} hint={brl(k.valor_vencidos)} color={T.red} warning={k.darfs_vencidos > 0} /></Grid>
        </Grid>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <TrendingIcon sx={{ color: T.cyan }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Por situação</Typography>
            </Stack>
            {data.por_situacao.length === 0 ? (
              <Typography variant="body2" sx={{ color: T.textSecond }}>Sem declarações ainda.</Typography>
            ) : (
              <Stack gap={1.5}>
                {data.por_situacao.map((s) => {
                  const totalAll = data.por_situacao.reduce((acc, x) => acc + x.total, 0) || 1;
                  const pct = Math.round((s.total / totalAll) * 100);
                  return (
                    <Box key={s.chave}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Chip size="small" label={s.label} sx={{ bgcolor: `${SIT_COLORS[s.chave]}22`, color: SIT_COLORS[s.chave], fontWeight: 700, fontSize: 11 }} />
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{s.total} · {brl(s.valor)}</Typography>
                      </Stack>
                      <LinearProgress variant="determinate" value={pct} sx={{ height: 6, borderRadius: 3, bgcolor: '#e2e8f0', '& .MuiLinearProgress-bar': { bgcolor: SIT_COLORS[s.chave] } }} />
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 3, borderRadius: 3, height: '100%' }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <BankIcon sx={{ color: T.cyan }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Top empresas a pagar</Typography>
            </Stack>
            {data.top_empresas_a_pagar.length === 0 ? (
              <Typography variant="body2" sx={{ color: T.textSecond }}>
                {empresaId ? 'Visão filtrada por empresa única.' : 'Sem saldo pendente.'}
              </Typography>
            ) : (
              <Stack gap={1}>
                {data.top_empresas_a_pagar.map((e, i) => (
                  <Box key={e.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.5 }}>
                    <Chip size="small" label={`#${i + 1}`} sx={{ bgcolor: T.navy, color: 'white', fontWeight: 700, fontSize: 10 }} />
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.razao_social}</Typography>
                      <Typography variant="caption" sx={{ color: T.textSecond }}>{e.cnpj} · {e.qtd_declaracoes} declaração(ões)</Typography>
                    </Box>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: T.red }}>{brl(e.total_a_pagar)}</Typography>
                  </Box>
                ))}
              </Stack>
            )}
          </Paper>
        </Grid>

        <Grid size={{ xs: 12 }}>
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <ClockIcon sx={{ color: T.cyan }} />
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Próximos vencimentos</Typography>
            </Stack>
            {data.proximos_vencimentos.length === 0 ? (
              <Typography variant="body2" sx={{ color: T.textSecond }}>Sem vencimentos próximos.</Typography>
            ) : (
              <Stack divider={<Divider />}>
                {data.proximos_vencimentos.map((v) => {
                  const urg = v.dias_para_vencer < 0 ? T.red
                            : v.dias_para_vencer < 3 ? T.red
                            : v.dias_para_vencer < 7 ? T.amber
                            : T.cyan;
                  const urgLabel = v.dias_para_vencer < 0 ? `vencido há ${Math.abs(v.dias_para_vencer)}d`
                                 : v.dias_para_vencer === 0 ? 'vence hoje'
                                 : `${v.dias_para_vencer}d`;
                  return (
                    <Box key={v.id} sx={{ py: 1.2, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Chip size="small" label={urgLabel} sx={{ bgcolor: `${urg}22`, color: urg, fontWeight: 700, minWidth: 90 }} />
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>
                          {v.razao_social} <Typography component="span" variant="caption" sx={{ color: T.textSecond, ml: 1 }}>{v.cnpj}</Typography>
                        </Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>
                          cód. {v.codigo_receita} · {v.denominacao} · período {v.periodo_apuracao}
                        </Typography>
                      </Box>
                      <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: urg }}>{brl(v.total)}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{new Date(v.vencimento).toLocaleDateString('pt-BR')}</Typography>
                      </Box>
                    </Box>
                  );
                })}
              </Stack>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
}
