import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Card, CardContent,
  CircularProgress, Alert, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, LinearProgress,
} from '@mui/material';
import {
  TrendingUp, AttachMoney, Schedule, Warning, CheckCircle,
  ErrorOutline as ErrorIcon,
} from '@mui/icons-material';
import api from '../services/api';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:       '#00c8f0',
  cyanDim:    'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
  textPrimary:'#1a2332',
  textSecond: '#64748b',
  border:     'rgba(15, 30, 60, 0.09)',
  surface:    '#FFFFFF',
  navy:       '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const thCellSx = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
};

const STATUS_COLORS: Record<string, { bg: string; color: string }> = {
  ATIVO:        { bg: 'rgba(102,187,106,0.12)', color: '#388E3C' },
  TRIAL:        { bg: 'rgba(41,182,246,0.12)',  color: '#0277BD' },
  INADIMPLENTE: { bg: 'rgba(239,83,80,0.12)',   color: '#C62828' },
  CANCELADO:    { bg: 'rgba(158,158,158,0.12)', color: '#616161' },
  PENDENTE:     { bg: 'rgba(255,167,38,0.12)',  color: '#E65100' },
};

const BAR_COLORS: Record<string, string> = {
  ATIVO: '#66BB6A', TRIAL: '#29B6F6', INADIMPLENTE: '#EF5350',
  CANCELADO: '#9E9E9E', PENDENTE: '#FFA726',
};

interface MetricasStripe {
  conversao: { total_assinaturas: number; com_subscription: number; taxa_conversao: number };
  tempo_medio_conversao: { minutos: number; formatado: string };
  top_erros: Array<{ erro_mensagem: string; total_ocorrencias: number; ultima_ocorrencia: string }>;
  mrr: { total: number; total_assinaturas: number };
  distribuicao_status: Array<{ status: string; total: number; percentual: number }>;
  abandonadas: number;
  trials_expirando: number;
  webhook_stats: Array<{ tipo: string; total: number }>;
  historico_conversao: Array<{ data: string; total_criadas: number; total_convertidas: number }>;
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent: string;
}

function StatCard({ icon, label, value, sub, accent }: StatCardProps) {
  return (
    <Card elevation={0} sx={{
      borderRadius: '12px', border: `1px solid ${T.border}`,
      boxShadow: T.cardShadow, backgroundColor: T.surface,
    }}>
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{
          width: 40, height: 40, borderRadius: '10px', mb: 2,
          backgroundColor: accent + '14', border: `1px solid ${accent}22`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: accent,
        }}>
          {icon}
        </Box>
        <Typography sx={{ fontSize: '1.625rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.03em', lineHeight: 1, mb: 0.5, fontVariantNumeric: 'tabular-nums' }}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, fontWeight: 500 }}>
          {label}
        </Typography>
        {sub && (
          <Typography sx={{ fontSize: '0.75rem', color: T.textSecond, mt: 0.5 }}>
            {sub}
          </Typography>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdmStripeMetricsPage() {
  const [metricas, setMetricas] = useState<MetricasStripe | null>(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => { carregarMetricas(); }, []);

  const carregarMetricas = async () => {
    try {
      setLoading(true);
      const { data } = await api.get<MetricasStripe>('/stripe/metrics');
      setMetricas(data); setError(null);
    } catch (err: any) {
      logger.error('Erro ao carregar métricas Stripe', err);
      setError(err.response?.data?.erro || 'Erro ao carregar métricas');
    } finally { setLoading(false); }
  };

  const formatarValor = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

  const formatarData = (data: string) =>
    new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress sx={{ color: T.cyan }} />
      </Box>
    );
  }

  if (error) {
    return <Box sx={{ p: 2 }}><Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert></Box>;
  }

  if (!metricas) return null;

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {/* Header */}
      <Box sx={{ mb: 4 }}>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
          Métricas Stripe
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
          Dados atualizados em tempo real
        </Typography>
      </Box>

      {/* Stat cards */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2, mb: 4 }}>
        <StatCard
          icon={<TrendingUp sx={{ fontSize: 20 }} />}
          label="Taxa de Conversão"
          value={`${metricas.conversao.taxa_conversao}%`}
          sub={`${metricas.conversao.com_subscription} de ${metricas.conversao.total_assinaturas} assinaturas`}
          accent={T.cyan}
        />
        <StatCard
          icon={<AttachMoney sx={{ fontSize: 20 }} />}
          label="MRR Estimado"
          value={formatarValor(metricas.mrr.total)}
          sub={`${metricas.mrr.total_assinaturas} assinaturas ativas`}
          accent="#66BB6A"
        />
        <StatCard
          icon={<Schedule sx={{ fontSize: 20 }} />}
          label="Tempo Médio Conversão"
          value={metricas.tempo_medio_conversao.formatado}
          sub="Últimos 30 dias"
          accent="#29B6F6"
        />
        <StatCard
          icon={<Warning sx={{ fontSize: 20 }} />}
          label="Abandonadas"
          value={metricas.abandonadas}
          sub={`${metricas.trials_expirando} trials expirando`}
          accent="#FFA726"
        />
      </Box>

      {/* Distribuição + Webhooks */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 4 }}>
        {/* Distribuição por Status */}
        <Paper elevation={0} sx={{ p: 3, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 2.5 }}>
            Distribuição por Status
          </Typography>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {metricas.distribuicao_status.map((item) => (
              <Box key={item.status}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Chip
                      label={item.status}
                      size="small"
                      sx={{
                        fontSize: '0.6875rem', fontWeight: 600, height: 22,
                        backgroundColor: STATUS_COLORS[item.status]?.bg || 'rgba(158,158,158,0.12)',
                        color: STATUS_COLORS[item.status]?.color || '#616161',
                        border: `1px solid ${STATUS_COLORS[item.status]?.color || '#616161'}22`,
                      }}
                    />
                    <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                      {item.total} assinaturas
                    </Typography>
                  </Box>
                  <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textPrimary }}>
                    {item.percentual}%
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={item.percentual}
                  sx={{
                    height: 6, borderRadius: '3px',
                    backgroundColor: 'rgba(15,30,60,0.06)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: BAR_COLORS[item.status] || '#9E9E9E',
                      borderRadius: '3px',
                    },
                  }}
                />
              </Box>
            ))}
          </Box>
        </Paper>

        {/* Webhooks */}
        <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${T.border}` }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
              Webhooks Recebidos — 7 dias
            </Typography>
          </Box>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={thCellSx}>Evento</TableCell>
                  <TableCell align="right" sx={thCellSx}>Total</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {metricas.webhook_stats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} align="center" sx={{ py: 4, color: T.textSecond, fontSize: '0.875rem' }}>
                      Nenhum webhook recebido
                    </TableCell>
                  </TableRow>
                ) : metricas.webhook_stats.map((item) => (
                  <TableRow key={item.tipo} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.8125rem', fontFamily: 'monospace', color: T.textPrimary }}>
                        {item.tipo}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Chip label={item.total} size="small" sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22, backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid ${T.cyanBorder}` }} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>

      {/* Top Erros */}
      {metricas.top_erros.length > 0 && (
        <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden', mb: 4 }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
            <ErrorIcon sx={{ fontSize: 18, color: '#D32F2F' }} />
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
              Top 5 Erros — 30 dias
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={thCellSx}>Mensagem de Erro</TableCell>
                  <TableCell align="center" sx={thCellSx}>Ocorrências</TableCell>
                  <TableCell align="right" sx={thCellSx}>Última Ocorrência</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {metricas.top_erros.map((erro, index) => (
                  <TableRow key={index} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                    <TableCell sx={{ fontSize: '0.875rem', color: '#C62828', maxWidth: 400 }}>{erro.erro_mensagem}</TableCell>
                    <TableCell align="center">
                      <Chip label={erro.total_ocorrencias} size="small" sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22, backgroundColor: 'rgba(239,83,80,0.10)', color: '#C62828', border: '1px solid rgba(198,40,40,0.20)' }} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                      {new Date(erro.ultima_ocorrencia).toLocaleString('pt-BR')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Histórico de Conversão */}
      <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
        <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${T.border}` }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
            Histórico de Conversão — 30 dias
          </Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Data', 'Criadas', 'Convertidas', 'Taxa'].map((h, i) => (
                  <TableCell key={h} align={i === 0 ? 'left' : 'center'} sx={thCellSx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {metricas.historico_conversao.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4, color: T.textSecond, fontSize: '0.875rem' }}>
                    Nenhum dado disponível
                  </TableCell>
                </TableRow>
              ) : metricas.historico_conversao.map((item) => {
                const taxa = item.total_criadas > 0
                  ? ((item.total_convertidas / item.total_criadas) * 100).toFixed(1)
                  : '0';
                const taxaOk = parseFloat(taxa) >= 50;

                return (
                  <TableRow key={item.data} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                    <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}>{formatarData(item.data)}</TableCell>
                    <TableCell align="center" sx={{ fontSize: '0.875rem', color: T.textSecond }}>{item.total_criadas}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.75 }}>
                        <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary }}>{item.total_convertidas}</Typography>
                        {item.total_convertidas > 0 && (
                          <CheckCircle sx={{ fontSize: 14, color: '#66BB6A' }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: taxaOk ? '#388E3C' : T.textSecond }}>
                        {taxa}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
}
