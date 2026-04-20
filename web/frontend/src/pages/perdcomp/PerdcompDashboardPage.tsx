import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  CircularProgress,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
} from '@mui/material';
import {
  AccountBalanceWallet as WalletIcon,
  TrendingDown as DebitIcon,
  HourglassTop as AnalysisIcon,
  EmojiEvents as TrophyIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import type { PerdcompDashboardData} from '../../types/perdcomp';
import { type Empresas } from '../../types/index';
import { logger } from '../../utils/logger';

const formatBRL = (value: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatDate = (iso: string): string => {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
};

interface KpiCardProps {
  title: string;
  count: number | string;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

const KpiCard: React.FC<KpiCardProps> = ({ title, count, subtitle, icon, color }) => (
  <Paper
    sx={{
      p: 3,
      flex: 1,
      minWidth: 200,
      borderRadius: 3,
      border: '1px solid',
      borderColor: 'divider',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 2,
    }}
  >
    <Box
      sx={{
        width: 48,
        height: 48,
        borderRadius: 2,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        bgcolor: `${color}18`,
        color,
        flexShrink: 0,
      }}
    >
      {icon}
    </Box>
    <Box>
      <Typography variant="body2" sx={{ color: '#64748b', mb: 0.5 }}>
        {title}
      </Typography>
      <Typography variant="h5" sx={{ fontWeight: 700, color: '#0a1628' }}>
        {count}
      </Typography>
      {subtitle && (
        <Typography variant="body2" sx={{ color, fontWeight: 600, mt: 0.5 }}>
          {subtitle}
        </Typography>
      )}
    </Box>
  </Paper>
);

const PerdcompDashboardPage: React.FC = () => {
  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<number | ''>('');
  const [data, setData] = useState<PerdcompDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');

  const carregarEmpresas = useCallback(async () => {
    try {
      const res = await empresasService.listar({ limit: 500 });
      setEmpresas(res.data);
    } catch (error: any) {
      logger.error('Erro ao carregar empresas:', error);
      setErro(error.response?.data?.erro || 'Erro ao carregar empresas');
    }
  }, []);

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

  useEffect(() => {
    carregarEmpresas();
  }, [carregarEmpresas]);

  useEffect(() => {
    carregarDashboard();
  }, [carregarDashboard]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: '#0a1628' }}>
          Dashboard PERD/Comp
        </Typography>
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel>Filtrar por Empresa</InputLabel>
          <Select
            value={selectedEmpresaId}
            label="Filtrar por Empresa"
            onChange={(e) => setSelectedEmpresaId(e.target.value as number | '')}
            sx={{ borderRadius: '10px' }}
          >
            <MenuItem value="">Todas as empresas</MenuItem>
            {empresas.map((emp) => (
              <MenuItem key={emp.id} value={emp.id}>
                {emp.razao_social}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {erro && (
        <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>
          {erro}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" p={8}>
          <CircularProgress sx={{ color: '#00c8f0' }} />
        </Box>
      ) : data ? (
        <>
          <Box display="flex" gap={2} mb={3} flexWrap="wrap">
            <KpiCard
              title="Créditos Disponíveis"
              count={data.total_creditos_disponiveis}
              subtitle={formatBRL(data.valor_creditos_disponiveis)}
              icon={<WalletIcon />}
              color="#22c55e"
            />
            <KpiCard
              title="Débitos Pendentes"
              count={data.total_debitos_pendentes}
              subtitle={formatBRL(data.valor_debitos_pendentes)}
              icon={<DebitIcon />}
              color="#ef4444"
            />
            <KpiCard
              title="Pedidos em Análise"
              count={data.pedidos_em_analise}
              icon={<AnalysisIcon />}
              color="#3b82f6"
            />
            <KpiCard
              title="Taxa Deferimento"
              count={`${data.taxa_deferimento.toFixed(1)}%`}
              icon={<TrophyIcon />}
              color="#eab308"
            />
          </Box>

          {data.creditos_proximos_prescricao > 0 && (
            <Alert
              severity="warning"
              icon={<WarningIcon />}
              sx={{ mb: 3, borderRadius: 2 }}
            >
              <strong>{data.creditos_proximos_prescricao}</strong> crédito(s) próximo(s) da prescrição
              totalizando <strong>{formatBRL(data.valor_creditos_prescricao)}</strong>.
              Tome providências para evitar a perda.
            </Alert>
          )}

          <Box display="flex" gap={3} mb={3} flexWrap="wrap">
            <Box flex={1} minWidth={340}>
              <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0a1628' }}>
                    Créditos por Tipo
                  </Typography>
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
                        <TableRow>
                          <TableCell colSpan={3} align="center" sx={{ color: '#64748b' }}>
                            Nenhum crédito encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.creditos_por_tipo.map((item) => (
                          <TableRow key={item.tipo} hover>
                            <TableCell>
                              <Chip label={item.tipo} size="small" sx={{ fontWeight: 600 }} />
                            </TableCell>
                            <TableCell align="center">{item.total}</TableCell>
                            <TableCell align="right" sx={{ color: '#22c55e', fontWeight: 600 }}>
                              {formatBRL(item.valor)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>

            <Box flex={1} minWidth={300}>
              <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
                <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0a1628' }}>
                    Pedidos por Status
                  </Typography>
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
                        <TableRow>
                          <TableCell colSpan={2} align="center" sx={{ color: '#64748b' }}>
                            Nenhum pedido encontrado
                          </TableCell>
                        </TableRow>
                      ) : (
                        data.pedidos_por_status.map((item) => (
                          <TableRow key={item.status} hover>
                            <TableCell>
                              <Chip
                                label={item.status}
                                size="small"
                                sx={{
                                  fontWeight: 600,
                                  bgcolor:
                                    item.status === 'Deferido' || item.status === 'Homologado'
                                      ? '#dcfce7'
                                      : item.status === 'Indeferido' || item.status === 'Não Homologado'
                                        ? '#fee2e2'
                                        : item.status === 'Em Análise' || item.status === 'Transmitido'
                                          ? '#dbeafe'
                                          : '#f1f5f9',
                                  color:
                                    item.status === 'Deferido' || item.status === 'Homologado'
                                      ? '#16a34a'
                                      : item.status === 'Indeferido' || item.status === 'Não Homologado'
                                        ? '#dc2626'
                                        : item.status === 'Em Análise' || item.status === 'Transmitido'
                                          ? '#2563eb'
                                          : '#475569',
                                }}
                              />
                            </TableCell>
                            <TableCell align="center" sx={{ fontWeight: 600 }}>
                              {item.total}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Paper>
            </Box>
          </Box>

          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ px: 3, py: 2, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, color: '#0a1628' }}>
                Últimos Movimentos
              </Typography>
            </Box>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Ação</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Detalhes</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Usuário</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Data</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.ultimos_movimentos.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} align="center" sx={{ color: '#64748b' }}>
                        Nenhum movimento registrado
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.ultimos_movimentos.map((mov) => (
                      <TableRow key={mov.id} hover>
                        <TableCell>
                          <Chip label={mov.acao} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell sx={{ color: '#64748b', maxWidth: 400 }}>
                          {mov.detalhes || '—'}
                        </TableCell>
                        <TableCell>{mov.usuario_nome || '—'}</TableCell>
                        <TableCell sx={{ whiteSpace: 'nowrap' }}>
                          {formatDate(mov.criado_em)}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
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
