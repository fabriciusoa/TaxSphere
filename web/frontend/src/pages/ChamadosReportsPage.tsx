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
  Alert
} from '@mui/material';
import {
  ConfirmationNumber as TicketIcon,
  HourglassEmpty as HourglassIcon,
  CheckCircle as CheckCircleIcon,
  Assignment as AssignmentIcon
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
  Cell
} from 'recharts';
import chamadosReportsService from '../services/chamadosReportsService';
import type { DashboardChamados, EstatisticasChamados } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

const ChamadosReportsPage: React.FC = () => {
  const [dashboard, setDashboard] = useState<DashboardChamados | null>(null);
  const [minhasStats, setMinhasStats] = useState<EstatisticasChamados | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Usuário atual
  const { user } = useAuth();
  const isAdmin = user?.perfil === 'ADMIN';

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    setErro(null);
    try {
      if (isAdmin) {
        const dashboardData = await chamadosReportsService.buscarDashboardAdmin();
        setDashboard(dashboardData);
      } else {
        const statsData = await chamadosReportsService.buscarMinhasEstatisticas();
        setMinhasStats(statsData);
      }
    } catch (error: any) {
      setErro(error.response?.data?.erro || 'Erro ao carregar dados');
      logger.error('Erro ao carregar dados', error);
    } finally {
      setLoading(false);
    }
  };

  const formatarTempo = (horas: number | null) => {
    if (horas === null) return 'N/A';
    if (horas < 1) return `${Math.round(horas * 60)} min`;
    if (horas < 24) return `${horas.toFixed(1)} h`;
    return `${(horas / 24).toFixed(1)} dias`;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (erro) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">{erro}</Alert>
      </Box>
    );
  }

  // Renderizar dashboard do admin
  if (isAdmin && dashboard) {
    const estatisticas = dashboard.estatisticas;
    const porStatus = dashboard.por_status || [];
    const porCategoria = dashboard.por_categoria || [];
    const topUsuarios = dashboard.top_usuarios || [];

    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Dashboard de Chamados
        </Typography>

        {/* Cards de Estatísticas */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <TicketIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Total de Chamados</Typography>
                </Box>
                <Typography variant="h3">{estatisticas.total_chamados}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <HourglassIcon color="warning" sx={{ mr: 1 }} />
                  <Typography variant="h6">Abertos</Typography>
                </Box>
                <Typography variant="h3">{estatisticas.abertos}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <AssignmentIcon color="info" sx={{ mr: 1 }} />
                  <Typography variant="h6">Em Andamento</Typography>
                </Box>
                <Typography variant="h3">{estatisticas.em_andamento}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                  <Typography variant="h6">Resolvidos</Typography>
                </Box>
                <Typography variant="h3">{estatisticas.resolvidos}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 400px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Tempo Médio de Resolução
                </Typography>
                <Typography variant="h3">
                  {formatarTempo(estatisticas.tempo_medio_resolucao_horas)}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>

        {/* Gráficos */}
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3, mb: 4 }}>
          <Box sx={{ flex: '1 1 400px', minWidth: 300 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Chamados por Status
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={porStatus}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="status" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total" fill="#8884d8" name="Total" />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          </Box>
          <Box sx={{ flex: '1 1 400px', minWidth: 300 }}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Chamados por Categoria
              </Typography>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={porCategoria}
                    dataKey="total"
                    nameKey="categoria"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={(entry: any) => `${entry.categoria}: ${entry.total}`}
                  >
                    {porCategoria.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </Paper>
          </Box>
        </Box>

        {/* Top Usuários */}
        <Paper sx={{ p: 2 }}>
          <Typography variant="h6" gutterBottom>
            Top Usuários (últimos 30 dias)
          </Typography>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nome</TableCell>
                  <TableCell>Email</TableCell>
                  <TableCell align="right">Total</TableCell>
                  <TableCell align="right">Abertos</TableCell>
                  <TableCell align="right">Resolvidos</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {topUsuarios.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      Nenhum dado disponível
                    </TableCell>
                  </TableRow>
                ) : (
                  topUsuarios.map((usuario) => (
                    <TableRow key={usuario.id} hover>
                      <TableCell>{usuario.nome}</TableCell>
                      <TableCell>{usuario.email}</TableCell>
                      <TableCell align="right">{usuario.total_chamados}</TableCell>
                      <TableCell align="right">{usuario.abertos}</TableCell>
                      <TableCell align="right">{usuario.resolvidos}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    );
  }

  // Renderizar estatísticas do usuário comum
  if (minhasStats) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h4" gutterBottom>
          Minhas Estatísticas
        </Typography>

        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <TicketIcon color="primary" sx={{ mr: 1 }} />
                  <Typography variant="h6">Total</Typography>
                </Box>
                <Typography variant="h3">{minhasStats.total_chamados}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <HourglassIcon color="warning" sx={{ mr: 1 }} />
                  <Typography variant="h6">Abertos</Typography>
                </Box>
                <Typography variant="h3">{minhasStats.abertos}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <AssignmentIcon color="info" sx={{ mr: 1 }} />
                  <Typography variant="h6">Em Andamento</Typography>
                </Box>
                <Typography variant="h3">{minhasStats.em_andamento}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 200px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                  <Typography variant="h6">Resolvidos</Typography>
                </Box>
                <Typography variant="h3">{minhasStats.resolvidos}</Typography>
              </CardContent>
            </Card>
          </Box>
          <Box sx={{ flex: '1 1 400px', minWidth: 200 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Tempo Médio de Resolução
                </Typography>
                <Typography variant="h3">
                  {formatarTempo(minhasStats.tempo_medio_resolucao_horas)}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        </Box>
      </Box>
    );
  }

  return null;
};

export default ChamadosReportsPage;
