import { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Card,
  CardContent,
  CircularProgress,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  LinearProgress
} from '@mui/material';
import {
  TrendingUp,
  AttachMoney,
  Error,
  Schedule,
  Warning,
  CheckCircle
} from '@mui/icons-material';
import api from '../services/api';
import { logger } from '../utils/logger';

interface MetricasStripe {
  conversao: {
    total_assinaturas: number;
    com_subscription: number;
    taxa_conversao: number;
  };
  tempo_medio_conversao: {
    minutos: number;
    formatado: string;
  };
  top_erros: Array<{
    erro_mensagem: string;
    total_ocorrencias: number;
    ultima_ocorrencia: string;
  }>;
  mrr: {
    total: number;
    total_assinaturas: number;
  };
  distribuicao_status: Array<{
    status: string;
    total: number;
    percentual: number;
  }>;
  abandonadas: number;
  trials_expirando: number;
  webhook_stats: Array<{
    tipo: string;
    total: number;
  }>;
  historico_conversao: Array<{
    data: string;
    total_criadas: number;
    total_convertidas: number;
  }>;
}

const STATUS_COLORS: Record<string, string> = {
  ATIVO: '#4CAF50',
  TRIAL: '#2196F3',
  INADIMPLENTE: '#F44336',
  CANCELADO: '#9E9E9E',
  PENDENTE: '#FF9800'
};

export default function AdmStripeMetricsPage() {
  const [metricas, setMetricas] = useState<MetricasStripe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    carregarMetricas();
  }, []);

  const carregarMetricas = async () => {
    try {
      setLoading(true);
      const { data } = await api.get<MetricasStripe>('/stripe/metrics');
      setMetricas(data);
      setError(null);
    } catch (err: any) {
      logger.error('Erro ao carregar métricas Stripe', err);
      setError(err.response?.data?.erro || 'Erro ao carregar métricas');
    } finally {
      setLoading(false);
    }
  };

  const formatarValor = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  const formatarData = (data: string) => {
    return new Date(data + 'T00:00:00').toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  if (loading) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4, textAlign: 'center' }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Carregando métricas...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Alert severity="error">{error}</Alert>
      </Container>
    );
  }

  if (!metricas) return null;

  return (
    <Container maxWidth="xl" sx={{ mt: 4, mb: 4 }}>
      {/* Título */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          📊 Métricas Stripe
        </Typography>
        <Typography color="text.secondary">
          Dados atualizados em tempo real
        </Typography>
      </Box>

      {/* Cards de Métricas Principais */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)', md: 'repeat(4, 1fr)' }, gap: 3, mb: 4 }}>
        {/* Taxa de Conversão */}
        <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <TrendingUp color="primary" sx={{ mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Taxa de Conversão
                </Typography>
              </Box>
              <Typography variant="h3" fontWeight={700} color="primary">
                {metricas.conversao.taxa_conversao}%
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {metricas.conversao.com_subscription} de {metricas.conversao.total_assinaturas} assinaturas
              </Typography>
            </CardContent>
          </Card>

        {/* MRR */}
        <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <AttachMoney color="success" sx={{ mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  MRR Estimado
                </Typography>
              </Box>
              <Typography variant="h3" fontWeight={700} color="success.main">
                {formatarValor(metricas.mrr.total)}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {metricas.mrr.total_assinaturas} assinaturas ativas
              </Typography>
            </CardContent>
          </Card>

        {/* Tempo Médio */}
        <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Schedule color="info" sx={{ mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Tempo Médio Conversão
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={700} color="info.main">
                {metricas.tempo_medio_conversao.formatado}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                Últimos 30 dias
              </Typography>
            </CardContent>
          </Card>

        {/* Alertas */}
        <Card>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Warning color="warning" sx={{ mr: 1 }} />
                <Typography variant="body2" color="text.secondary">
                  Atenção Necessária
                </Typography>
              </Box>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Abandonadas:</Typography>
                  <Typography variant="body2" fontWeight={600} color="warning.main">
                    {metricas.abandonadas}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="body2">Trials expirando:</Typography>
                  <Typography variant="body2" fontWeight={600} color="error.main">
                    {metricas.trials_expirando}
                  </Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
      </Box>

      {/* Distribuição por Status */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, 1fr)' }, gap: 3, mb: 4 }}>
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Distribuição por Status
            </Typography>
            <Box sx={{ mt: 2 }}>
              {metricas.distribuicao_status.map((item) => (
                <Box key={item.status} sx={{ mb: 2 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Chip
                        label={item.status}
                        size="small"
                        sx={{
                          backgroundColor: STATUS_COLORS[item.status] || '#757575',
                          color: 'white',
                          fontWeight: 600
                        }}
                      />
                      <Typography variant="body2">
                        {item.total} assinaturas
                      </Typography>
                    </Box>
                    <Typography variant="body2" fontWeight={600}>
                      {item.percentual}%
                    </Typography>
                  </Box>
                  <LinearProgress
                    variant="determinate"
                    value={item.percentual}
                    sx={{
                      height: 8,
                      borderRadius: 1,
                      backgroundColor: '#e0e0e0',
                      '& .MuiLinearProgress-bar': {
                        backgroundColor: STATUS_COLORS[item.status] || '#757575'
                      }
                    }}
                  />
                </Box>
              ))}
            </Box>
          </Paper>

        {/* Webhook Stats */}
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Webhooks Recebidos (7 dias)
            </Typography>
            <TableContainer sx={{ mt: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Evento</TableCell>
                    <TableCell align="right">Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {metricas.webhook_stats.map((item) => (
                    <TableRow key={item.tipo}>
                      <TableCell>
                        <Typography variant="body2" fontFamily="monospace">
                          {item.tipo}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Chip label={item.total} size="small" color="primary" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {metricas.webhook_stats.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={2} align="center">
                        <Typography variant="body2" color="text.secondary">
                          Nenhum webhook recebido
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
      </Box>

      {/* Top 5 Erros */}
      {metricas.top_erros.length > 0 && (
        <Paper sx={{ p: 3, mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
            <Error color="error" sx={{ mr: 1 }} />
            <Typography variant="h6" fontWeight={600}>
              Top 5 Erros (30 dias)
            </Typography>
          </Box>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Mensagem de Erro</TableCell>
                  <TableCell align="center">Ocorrências</TableCell>
                  <TableCell align="right">Última Ocorrência</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {metricas.top_erros.map((erro, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Typography variant="body2" color="error">
                        {erro.erro_mensagem}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        label={erro.total_ocorrencias}
                        size="small"
                        color="error"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="body2" color="text.secondary">
                        {new Date(erro.ultima_ocorrencia).toLocaleString('pt-BR')}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {/* Histórico de Conversão */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" fontWeight={600} gutterBottom>
          Histórico de Conversão (30 dias)
        </Typography>
        <TableContainer sx={{ mt: 2 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Data</TableCell>
                <TableCell align="center">Criadas</TableCell>
                <TableCell align="center">Convertidas</TableCell>
                <TableCell align="center">Taxa</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {metricas.historico_conversao.map((item) => {
                const taxa = item.total_criadas > 0
                  ? ((item.total_convertidas / item.total_criadas) * 100).toFixed(1)
                  : '0';

                return (
                  <TableRow key={item.data}>
                    <TableCell>{formatarData(item.data)}</TableCell>
                    <TableCell align="center">{item.total_criadas}</TableCell>
                    <TableCell align="center">
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                        {item.total_convertidas}
                        {item.total_convertidas > 0 && (
                          <CheckCircle fontSize="small" sx={{ color: 'success.main' }} />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="center">
                      <Typography
                        variant="body2"
                        fontWeight={600}
                        color={parseFloat(taxa) >= 50 ? 'success.main' : 'text.secondary'}
                      >
                        {taxa}%
                      </Typography>
                    </TableCell>
                  </TableRow>
                );
              })}
              {metricas.historico_conversao.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center">
                    <Typography variant="body2" color="text.secondary">
                      Nenhum dado disponível
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Container>
  );
}
