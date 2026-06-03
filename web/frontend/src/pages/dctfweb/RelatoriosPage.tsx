import { useEffect, useState, useCallback } from 'react';
import {
  Box, Paper, Typography, Stack, Grid, Chip, Alert, CircularProgress, Tabs, Tab,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer,
} from '@mui/material';
import {
  Schedule as ClockIcon, Warning as WarningIcon, AccountBalance as BankIcon,
  Gavel as MaedIcon, Event as PrazoIcon, Source as OrigemIcon,
} from '@mui/icons-material';
import { dctfwebService, CATEGORIA_LABELS } from '../../services/dctfwebService';
import { useEmpresa } from '../../contexts/EmpresaContext';

const T = { navy: '#0a1628', cyan: '#00c8f0', textSecond: '#64748b', emerald: '#22c55e', amber: '#d29922', red: '#ef4444' };

const URG_COLORS: Record<string, string> = {
  VENCIDO: T.red, URGENTE_3D: T.red, ALERTA_7D: T.amber, AVISO_15D: '#f59e0b', NORMAL: T.cyan,
};
const URG_LABELS: Record<string, string> = {
  VENCIDO: 'Vencido', URGENTE_3D: 'Urgente (3d)', ALERTA_7D: 'Alerta (7d)', AVISO_15D: 'Aviso (15d)', NORMAL: 'Normal',
};

function brl(v: number): string {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function RelatoriosPage() {
  const { empresaId } = useEmpresa();
  const [tab, setTab] = useState(0);
  const [vencimentos, setVencimentos] = useState<any[]>([]);
  const [atrasos, setAtrasos] = useState<any[]>([]);
  const [projecao, setProjecao] = useState<any>(null);
  const [maed, setMaed] = useState<{ data: any[]; total_pendente: number }>({ data: [], total_pendente: 0 });
  const [prazosLegais, setPrazosLegais] = useState<any[]>([]);
  const [porOrigem, setPorOrigem] = useState<{ resumo: any; origens: any[] }>({ resumo: {}, origens: [] });
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const id = empresaId ? Number(empresaId) : undefined;
      const [v, a, p, m, pl, po] = await Promise.all([
        dctfwebService.relatorioVencimentos(id, 90),
        dctfwebService.relatorioAtrasos(id),
        dctfwebService.projecaoCaixa(id),
        dctfwebService.relatorioMaed(id).catch(() => ({ data: [], total_pendente: 0 })),
        dctfwebService.relatorioPrazos(id, 60).catch(() => ({ data: [] })),
        dctfwebService.relatorioPorOrigem(id).catch(() => ({ resumo: {}, origens: [] })),
      ]);
      setVencimentos(v.data); setAtrasos(a.data); setProjecao(p);
      setMaed(m); setPrazosLegais(pl.data); setPorOrigem(po);
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao carregar relatórios');
    } finally { setLoading(false); }
  }, [empresaId]);
  useEffect(() => { carregar(); }, [carregar]);

  if (loading) return <Box display="flex" justifyContent="center" py={8}><CircularProgress sx={{ color: T.cyan }} /></Box>;
  if (erro) return <Alert severity="error">{erro}</Alert>;

  const totalProj = (projecao?.vencidos || 0) + (projecao?.proximos_30d || 0) + (projecao?.proximos_60d || 0) + (projecao?.proximos_90d || 0);

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>DCTF Web · Relatórios</Typography>
        <Typography variant="body2" sx={{ color: T.textSecond }}>
          Vencimentos, atrasos e projeção de caixa. Use o seletor de empresa no topo para foco específico.
        </Typography>
      </Box>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
        sx={{ mb: 2, '& .Mui-selected': { color: `${T.cyan} !important` }, '& .MuiTabs-indicator': { bgcolor: T.cyan } }}>
        <Tab label={`Vencimentos DARF (${vencimentos.length})`} icon={<ClockIcon fontSize="small" />} iconPosition="start" />
        <Tab label={`Atrasos (${atrasos.length})`} icon={<WarningIcon fontSize="small" />} iconPosition="start" />
        <Tab label="Projeção de caixa" icon={<BankIcon fontSize="small" />} iconPosition="start" />
        <Tab label={`MAED (${maed.data.length})`} icon={<MaedIcon fontSize="small" />} iconPosition="start" />
        <Tab label={`Prazos legais (${prazosLegais.length})`} icon={<PrazoIcon fontSize="small" />} iconPosition="start" />
        <Tab label="Por origem" icon={<OrigemIcon fontSize="small" />} iconPosition="start" />
      </Tabs>

      {tab === 0 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {vencimentos.length === 0 ? (
            <Box textAlign="center" py={6}><Typography variant="body2" sx={{ color: T.textSecond }}>Sem vencimentos no horizonte de 90 dias.</Typography></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    {['Urgência', 'Empresa', 'Receita', 'Período', 'Vencimento', 'Total'].map(h =>
                      <TableCell key={h} sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {vencimentos.map((v: any) => (
                    <TableRow key={v.id} hover>
                      <TableCell><Chip size="small" label={URG_LABELS[v.urgencia]} sx={{ bgcolor: `${URG_COLORS[v.urgencia]}22`, color: URG_COLORS[v.urgencia], fontWeight: 700, fontSize: 10 }} /></TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{v.razao_social}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{v.cnpj}</Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{v.codigo_receita}</Typography></TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{v.periodo_apuracao}</Typography></TableCell>
                      <TableCell>
                        <Typography variant="body2">{new Date(v.vencimento).toLocaleDateString('pt-BR')}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{v.dias_para_vencer >= 0 ? `${v.dias_para_vencer}d` : `${Math.abs(v.dias_para_vencer)}d atrás`}</Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontWeight: 700, color: T.navy }}>{brl(v.total)}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {tab === 1 && (
        <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
          {atrasos.length === 0 ? (
            <Box textAlign="center" py={6}><Typography variant="body2" sx={{ color: T.emerald, fontWeight: 600 }}>✓ Nenhum DARF em atraso</Typography></Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#fef2f2' }}>
                    {['Empresa', 'Receita', 'Período', 'Vencimento', 'Dias atraso', 'Total', 'Multa est.', 'Juros est.'].map(h =>
                      <TableCell key={h} sx={{ fontWeight: 700, color: T.red, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</TableCell>
                    )}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {atrasos.map((a: any) => (
                    <TableRow key={a.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{a.razao_social}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{a.cnpj}</Typography>
                      </TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{a.codigo_receita}</Typography></TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{a.periodo_apuracao}</Typography></TableCell>
                      <TableCell>{new Date(a.vencimento).toLocaleDateString('pt-BR')}</TableCell>
                      <TableCell><Chip size="small" label={`${a.dias_em_atraso}d`} sx={{ bgcolor: `${T.red}22`, color: T.red, fontWeight: 700 }} /></TableCell>
                      <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{brl(a.total)}</Typography></TableCell>
                      <TableCell><Typography variant="body2" sx={{ color: T.red }}>{brl(a.multa_estimada)}</Typography></TableCell>
                      <TableCell><Typography variant="body2" sx={{ color: T.red }}>{brl(a.juros_estimado)}</Typography></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {tab === 2 && (
        <Box>
          <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <BankIcon sx={{ color: T.cyan }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Projeção de caixa</Typography>
                <Typography variant="caption" sx={{ color: T.textSecond }}>
                  Total a desembolsar nos próximos 90 dias: <strong>{brl(totalProj)}</strong>
                </Typography>
              </Box>
            </Stack>
            <Grid container spacing={2}>
              {[
                { label: 'Vencidos (precisa quitar)', value: projecao?.vencidos || 0, color: T.red, warning: true },
                { label: 'Próximos 30 dias', value: projecao?.proximos_30d || 0, color: T.amber },
                { label: 'Entre 31 e 60 dias', value: projecao?.proximos_60d || 0, color: T.cyan },
                { label: 'Entre 61 e 90 dias', value: projecao?.proximos_90d || 0, color: T.navy },
                { label: 'Após 90 dias', value: projecao?.apos_90d || 0, color: T.emerald },
              ].map((b) => (
                <Grid item xs={12} sm={6} md={2.4} key={b.label}>
                  <Paper sx={{
                    p: 2.5, borderRadius: 3, borderLeft: `4px solid ${b.color}`,
                    bgcolor: b.warning && b.value > 0 ? `${b.color}0a` : 'white',
                  }}>
                    <Typography variant="caption" sx={{ color: T.textSecond, textTransform: 'uppercase', fontSize: 10, fontWeight: 600 }}>{b.label}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: b.color, mt: 0.5 }}>{brl(b.value)}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Box>
      )}

      {/* ═══ ABA 3 - MAED (Multa por Atraso na Entrega) — manual cap. 5 ═══ */}
      {tab === 3 && (
        <Box>
          <Paper sx={{ p: 3, borderRadius: 3, mb: 2, borderLeft: `4px solid ${T.amber}` }}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <MaedIcon sx={{ color: T.amber, fontSize: 36 }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>
                  Multa por Atraso na Entrega · Total pendente: <Typography component="span" sx={{ color: T.amber, fontWeight: 700 }}>{brl(maed.total_pendente)}</Typography>
                </Typography>
                <Typography variant="caption" sx={{ color: T.textSecond }}>
                  Manual cap. 5: 2% ao mês (max 20%), mínima R$ 200 (sem mov.) / R$ 500 (com débitos). MEI -90%, ME/EPP Simples -50%. Código de receita 5440-01.
                </Typography>
              </Box>
            </Stack>
          </Paper>
          {maed.data.length === 0 ? (
            <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: T.emerald, fontWeight: 600 }}>✓ Nenhuma MAED pendente</Typography>
            </Paper>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: `${T.amber}11` }}>
                      {['Empresa', 'Período', 'Categoria', 'Tipo', 'Prazo legal', 'Transmissão', 'Dias atraso', 'Débito apurado', 'MAED'].map(h =>
                        <TableCell key={h} sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {maed.data.map((m: any) => (
                      <TableRow key={m.id} hover>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>{m.razao_social}</Typography>
                          <Typography variant="caption" sx={{ color: T.textSecond }}>{m.cnpj}</Typography>
                        </TableCell>
                        <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{m.periodo_apuracao}</Typography></TableCell>
                        <TableCell><Typography variant="body2">{(CATEGORIA_LABELS as any)[m.categoria] || m.categoria}</Typography></TableCell>
                        <TableCell><Chip size="small" label={m.tipo} sx={{ bgcolor: '#a855f722', color: '#a855f7', fontWeight: 700, fontSize: 10 }} /></TableCell>
                        <TableCell>{m.prazo_legal ? new Date(m.prazo_legal).toLocaleDateString('pt-BR') : '—'}</TableCell>
                        <TableCell>{m.data_transmissao ? new Date(m.data_transmissao).toLocaleDateString('pt-BR') : <Chip size="small" label="Não entregue" sx={{ bgcolor: `${T.red}22`, color: T.red, fontWeight: 700 }} />}</TableCell>
                        <TableCell><Chip size="small" label={`${m.dias_atraso_calculado || 0}d`} sx={{ bgcolor: `${T.red}22`, color: T.red, fontWeight: 700 }} /></TableCell>
                        <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{brl(m.debito_apurado || 0)}</Typography></TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: T.amber }}>{brl(m.maed_valor || m.maed_calculada || 0)}</Typography>
                          {m.maed_paga && <Chip size="small" label="PAGA" sx={{ bgcolor: `${T.emerald}22`, color: T.emerald, fontWeight: 700, fontSize: 9 }} />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Box>
      )}

      {/* ═══ ABA 4 - Prazos legais (entrega da declaração) — manual cap. 4.2 ═══ */}
      {tab === 4 && (
        <Box>
          <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1.5}>
              <PrazoIcon sx={{ color: T.cyan }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Prazos legais de entrega (próximos 60 dias)</Typography>
                <Typography variant="caption" sx={{ color: T.textSecond }}>
                  Manual cap. 4.2: Geral = último dia útil do mês seguinte · 13º = 20/dez · Espetáculo = 2º dia útil pós-evento · Aferição = último dia útil do mês.
                </Typography>
              </Box>
            </Stack>
          </Paper>
          {prazosLegais.length === 0 ? (
            <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center' }}>
              <Typography variant="body2" sx={{ color: T.textSecond }}>Sem declarações em andamento com prazo próximo.</Typography>
            </Paper>
          ) : (
            <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow sx={{ bgcolor: '#f8fafc' }}>
                      {['Urgência', 'Empresa', 'Período', 'Categoria', 'Tipo', 'Prazo legal', 'Dias', 'Débito apurado'].map(h =>
                        <TableCell key={h} sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>{h}</TableCell>
                      )}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {prazosLegais.map((p: any) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Chip size="small" label={URG_LABELS[p.urgencia] || p.urgencia}
                            sx={{ bgcolor: `${URG_COLORS[p.urgencia] || T.cyan}22`, color: URG_COLORS[p.urgencia] || T.cyan, fontWeight: 700, fontSize: 10 }} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{p.razao_social}</Typography>
                          <Typography variant="caption" sx={{ color: T.textSecond }}>{p.cnpj}</Typography>
                        </TableCell>
                        <TableCell><Typography variant="body2" sx={{ fontFamily: 'ui-monospace, monospace' }}>{p.periodo_apuracao}</Typography></TableCell>
                        <TableCell>{(CATEGORIA_LABELS as any)[p.categoria] || p.categoria}</TableCell>
                        <TableCell><Chip size="small" label={p.tipo} sx={{ bgcolor: '#a855f722', color: '#a855f7', fontWeight: 700, fontSize: 10 }} /></TableCell>
                        <TableCell>{new Date(p.prazo_legal).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell>
                          <Typography variant="caption" sx={{ color: p.dias_para_prazo < 0 ? T.red : T.textSecond, fontWeight: 700 }}>
                            {p.dias_para_prazo < 0 ? `${Math.abs(p.dias_para_prazo)}d atrás` : `${p.dias_para_prazo}d`}
                          </Typography>
                        </TableCell>
                        <TableCell><Typography variant="body2" sx={{ fontWeight: 700 }}>{brl(p.debito_apurado || 0)}</Typography></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          )}
        </Box>
      )}

      {/* ═══ ABA 5 - Por origem dos débitos — manual cap. 8.2 ═══ */}
      {tab === 5 && (
        <Box>
          <Paper sx={{ p: 3, borderRadius: 3, mb: 2 }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <OrigemIcon sx={{ color: T.cyan }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Origem dos débitos consolidados</Typography>
                <Typography variant="caption" sx={{ color: T.textSecond }}>
                  Manual cap. 8.2: a DCTFweb consolida apurações de cinco fontes distintas. Útil para conciliar.
                </Typography>
              </Box>
            </Stack>
            <Grid container spacing={2}>
              {porOrigem.origens.map((o: any) => (
                <Grid item xs={12} sm={6} md={4} key={o.chave}>
                  <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, borderLeft: `4px solid ${T.cyan}` }}>
                    <Typography variant="caption" sx={{ color: T.textSecond, fontWeight: 700, letterSpacing: 0.5 }}>{o.label.toUpperCase()}</Typography>
                    <Typography variant="h6" sx={{ fontWeight: 700, color: T.navy, mt: 0.5 }}>{brl(o.valor)}</Typography>
                  </Paper>
                </Grid>
              ))}
            </Grid>
            {porOrigem.resumo && (porOrigem.resumo.debito_total > 0) && (
              <Box sx={{ mt: 3, p: 2, bgcolor: '#f8fafc', borderRadius: 2 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: T.textSecond }}>Débito total apurado</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: T.navy }}>{brl(porOrigem.resumo.debito_total || 0)}</Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between" mt={0.5}>
                  <Typography variant="body2" sx={{ color: T.textSecond }}>Saldo a pagar</Typography>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: T.red }}>{brl(porOrigem.resumo.saldo_pagar || 0)}</Typography>
                </Stack>
              </Box>
            )}
          </Paper>
        </Box>
      )}
    </Box>
  );
}
