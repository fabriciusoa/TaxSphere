import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  CircularProgress,
  Alert,
  Chip,
} from '@mui/material';
import {
  ConfirmationNumber as TicketIcon,
  HourglassEmpty as HourglassIcon,
  CheckCircle as CheckCircleIcon,
  Assignment as AssignmentIcon,
  Timer as TimerIcon,
} from '@mui/icons-material';
import {
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend,
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell,
} from 'recharts';
import chamadosReportsService from '../services/chamadosReportsService';
import type { DashboardChamados, EstatisticasChamados } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan: '#00c8f0',
  cyanDim: 'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  navy: '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const CHART_COLORS = [T.cyan, '#66BB6A', '#FFA726', '#D32F2F', '#78BE20', '#29B6F6'];

const thCellSx = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  accent: string;
}

function StatCard({ icon, label, value, accent }: StatCardProps) {
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
      </CardContent>
    </Card>
  );
}

const ChamadosReportsPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<DashboardChamados | null>(null);
  const [minhasStats, setMinhasStats] = useState<EstatisticasChamados | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { user } = useAuth();
  const isAdmin = user?.adm_mindtax === true;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carregarDados(); }, []);

  const carregarDados = async () => {
    setLoading(true); setErro(null);
    try {
      if (isAdmin) {
        setDashboard(await chamadosReportsService.buscarDashboardAdmin());
      } else {
        setMinhasStats(await chamadosReportsService.buscarMinhasEstatisticas());
      }
    } catch (e: any) {
      setErro(e.response?.data?.erro || 'Erro ao carregar dados');
      logger.error('Erro ao carregar dados', e);
    } finally { setLoading(false); }
  };

  const formatarTempo = (horas: number | null) => {
    if (horas === null) return 'N/A';
    if (horas < 1) return `${Math.round(horas * 60)} min`;
    if (horas < 24) return `${horas.toFixed(1)} h`;
    return `${(horas / 24).toFixed(1)} dias`;
  };

  if (loading) {
    return <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <CircularProgress sx={{ color: T.cyan }} />
    </Box>;
  }

  if (erro) {
    return <Box sx={{ p: 2 }}><Alert severity="error" sx={{ borderRadius: '10px' }}>{erro}</Alert></Box>;
  }

  // Admin dashboard
  if (isAdmin && dashboard) {
    const { estatisticas, por_status = [], por_categoria = [], top_usuarios = [] } = dashboard;

    return (
      <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Dashboard de Chamados
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Visão geral de todos os chamados do sistema
          </Typography>
        </Box>

        {/* Métricas */}
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2, mb: 4 }}>
          <StatCard icon={<TicketIcon sx={{ fontSize: 20 }} />} label="Total de Chamados" value={estatisticas.total_chamados} accent={T.cyan} />
          <StatCard icon={<HourglassIcon sx={{ fontSize: 20 }} />} label="Abertos" value={estatisticas.abertos} accent="#FFA726" />
          <StatCard icon={<AssignmentIcon sx={{ fontSize: 20 }} />} label="Em Andamento" value={estatisticas.em_andamento} accent="#29B6F6" />
          <StatCard icon={<CheckCircleIcon sx={{ fontSize: 20 }} />} label="Resolvidos" value={estatisticas.resolvidos} accent="#66BB6A" />
          <StatCard icon={<TimerIcon sx={{ fontSize: 20 }} />} label="Tempo Médio Resolução" value={formatarTempo(estatisticas.tempo_medio_resolucao_horas)} accent="#78BE20" />
        </Box>

        {/* Gráficos */}
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, mb: 4 }}>
          <Paper elevation={0} sx={{ p: 3, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 2.5 }}>
              Chamados por Status
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={por_status} margin={{ top: 0, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                <XAxis dataKey="status" tick={{ fontSize: 11, fill: T.textSecond }} />
                <YAxis tick={{ fontSize: 11, fill: T.textSecond }} />
                <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${T.border}`, boxShadow: T.cardShadow }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" fill={T.cyan} name="Total" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          <Paper elevation={0} sx={{ p: 3, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 2.5 }}>
              Chamados por Categoria
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={por_categoria} dataKey="total" nameKey="categoria" cx="50%" cy="50%" outerRadius={90}
                  label={(e: any) => `${e.categoria}: ${e.total}`} labelLine={{ stroke: T.textSecond }}>
                  {por_categoria.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 8, border: `1px solid ${T.border}` }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>
        </Box>

        {/* Top usuários */}
        <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
          <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${T.border}` }}>
            <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
              Top Usuários — últimos 30 dias
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  {['Nome', 'Email', 'Total', 'Abertos', 'Resolvidos'].map((h, i) => (
                    <TableCell key={h} align={i >= 2 ? 'right' : 'left'} sx={thCellSx}>{h}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {top_usuarios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: T.textSecond, fontSize: '0.875rem' }}>Nenhum dado disponível</TableCell>
                  </TableRow>
                ) : top_usuarios.map((u) => (
                  <TableRow key={u.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                    <TableCell sx={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}>{u.nome}</TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{u.email}</TableCell>
                    <TableCell align="right">
                      <Chip label={u.total_chamados} size="small" sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22, backgroundColor: T.cyanDim, color: T.cyan, border: `1px solid ${T.cyanBorder}` }} />
                    </TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.875rem', color: '#FFA726', fontWeight: 600 }}>{u.abertos}</TableCell>
                    <TableCell align="right" sx={{ fontSize: '0.875rem', color: '#66BB6A', fontWeight: 600 }}>{u.resolvidos}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    );
  }

  // Usuário comum
  if (minhasStats) {
    return (
      <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
        <Box sx={{ mb: 4 }}>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Minhas Estatísticas
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Resumo dos seus chamados de suporte
          </Typography>
        </Box>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 2 }}>
          <StatCard icon={<TicketIcon sx={{ fontSize: 20 }} />} label="Total" value={minhasStats.total_chamados} accent={T.cyan} />
          <StatCard icon={<HourglassIcon sx={{ fontSize: 20 }} />} label="Abertos" value={minhasStats.abertos} accent="#FFA726" />
          <StatCard icon={<AssignmentIcon sx={{ fontSize: 20 }} />} label="Em Andamento" value={minhasStats.em_andamento} accent="#29B6F6" />
          <StatCard icon={<CheckCircleIcon sx={{ fontSize: 20 }} />} label="Resolvidos" value={minhasStats.resolvidos} accent="#66BB6A" />
          <StatCard icon={<TimerIcon sx={{ fontSize: 20 }} />} label="Tempo Médio Resolução" value={formatarTempo(minhasStats.tempo_medio_resolucao_horas)} accent="#78BE20" />
        </Box>
      </Box>
    );
  }

  return null;
};

export default ChamadosReportsPage;
