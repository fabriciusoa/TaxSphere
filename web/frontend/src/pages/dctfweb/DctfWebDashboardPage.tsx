import { useState, useEffect, useCallback } from 'react';
import {
  Box,
  Grid,
  Card,
  CardContent,
  Typography,
  Chip,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Alert,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  LinearProgress,
  alpha,
} from '@mui/material';
import type { SelectChangeEvent } from '@mui/material/Select';
import {
  Assessment as AssessmentIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Receipt as ReceiptIcon,
  TrendingUp as TrendingUpIcon,
  Refresh as RefreshIcon,
  AccountBalance as AccountBalanceIcon,
} from '@mui/icons-material';
import dctfwebService from '../../services/dctfwebService';
import type { DctfWebDashboard } from '../../services/dctfwebService';
import { empresasService } from '../../services/empresasService';

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const formatDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('pt-BR') : '-';

const situacaoColor: Record<string, string> = {
  'Ativa': '#4caf50',
  'Em Andamento': '#ff9800',
  'Retificada': '#2196f3',
  'Excluída': '#f44336',
  'Inativa': '#9e9e9e',
  'Sem Movimento': '#607d8b',
};

interface KpiCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ReactNode;
  color: string;
}

function KpiCard({ title, value, subtitle, icon, color }: KpiCardProps) {
  return (
    <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)', height: '100%' }}>
      <CardContent sx={{ p: 2.5 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box>
            <Typography variant="body2" color="text.secondary" fontWeight={500}>{title}</Typography>
            <Typography variant="h5" fontWeight={700} sx={{ mt: 0.5, color }}>{value}</Typography>
            {subtitle && (
              <Typography variant="caption" color="text.secondary">{subtitle}</Typography>
            )}
          </Box>
          <Box sx={{ p: 1.2, borderRadius: 2, bgcolor: alpha(color, 0.1) }}>{icon}</Box>
        </Box>
      </CardContent>
    </Card>
  );
}

export default function DctfWebDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<DctfWebDashboard | null>(null);
  const [empresas, setEmpresas] = useState<Array<{ id: number; razao_social: string; cnpj: string }>>([]);
  const [idEmpresa, setIdEmpresa] = useState<number | undefined>();
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const [d, e] = await Promise.all([
        dctfwebService.dashboard(idEmpresa),
        empresasService.listar(),
      ]);
      setDash(d);
      setEmpresas(e.data);
    } catch {
      setErro('Erro ao carregar dados do dashboard');
    } finally {
      setLoading(false);
    }
  }, [idEmpresa]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleEmpresa = (e: SelectChangeEvent<string>) => {
    const val = e.target.value;
    setIdEmpresa(val === '' ? undefined : Number(val));
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <CircularProgress />
      </Box>
    );
  }

  const t = dash?.totais;
  const totalDecl = t?.total_declaracoes || 0;

  return (
    <Box>
      {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}

      <Box sx={{ display: 'flex', gap: 2, mb: 3, alignItems: 'center', flexWrap: 'wrap' }}>
        <FormControl size="small" sx={{ minWidth: 280 }}>
          <InputLabel>Empresa</InputLabel>
          <Select value={idEmpresa?.toString() || ''} label="Empresa" onChange={handleEmpresa}>
            <MenuItem value="">Todas as empresas</MenuItem>
            {empresas.map(e => (
              <MenuItem key={e.id} value={e.id.toString()}>{e.razao_social}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <Tooltip title="Atualizar">
          <IconButton onClick={carregar}><RefreshIcon /></IconButton>
        </Tooltip>
      </Box>

      <Grid container spacing={2.5} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Total Declarações" value={totalDecl}
            subtitle={`${t?.ativas || 0} ativa(s)`}
            icon={<AssessmentIcon sx={{ color: '#1976d2' }} />} color="#1976d2" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Débitos Apurados" value={formatCurrency(t?.total_debito || 0)}
            subtitle={`Créditos: ${formatCurrency(t?.total_credito || 0)}`}
            icon={<TrendingUpIcon sx={{ color: '#e65100' }} />} color="#e65100" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Saldo a Pagar" value={formatCurrency(t?.total_saldo || 0)}
            subtitle={`Pago: ${formatCurrency(t?.total_pago || 0)}`}
            icon={<AccountBalanceIcon sx={{ color: '#2e7d32' }} />} color="#2e7d32" />
        </Grid>
        <Grid size={{ xs: 12, sm: 6, md: 3 }}>
          <KpiCard title="Pendentes Pgto" value={formatCurrency(t?.total_pendente || 0)}
            subtitle={`${t?.em_andamento || 0} em andamento`}
            icon={<WarningIcon sx={{ color: '#f57c00' }} />} color="#f57c00" />
        </Grid>
      </Grid>

      {/* Situação x Progresso */}
      {(dash?.porSituacao?.length || 0) > 0 && (
        <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)', mb: 3 }}>
          <CardContent>
            <Typography variant="subtitle1" fontWeight={600} gutterBottom>
              Distribuição por Situação
            </Typography>
            <Grid container spacing={2}>
              {dash!.porSituacao.map(s => {
                const pct = totalDecl > 0 ? (s.qtd / totalDecl) * 100 : 0;
                return (
                  <Grid size={{ xs: 12, sm: 6, md: 4 }} key={s.situacao}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                      <Typography variant="body2" fontWeight={500}>{s.situacao}</Typography>
                      <Typography variant="body2" color="text.secondary">{s.qtd} ({pct.toFixed(0)}%)</Typography>
                    </Box>
                    <LinearProgress variant="determinate" value={pct}
                      sx={{
                        height: 8, borderRadius: 4, bgcolor: '#e0e0e0',
                        '& .MuiLinearProgress-bar': { bgcolor: situacaoColor[s.situacao] || '#9e9e9e', borderRadius: 4 }
                      }} />
                  </Grid>
                );
              })}
            </Grid>
          </CardContent>
        </Card>
      )}

      <Grid container spacing={2.5}>
        {/* Últimos períodos */}
        <Grid size={{ xs: 12, md: 7 }}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                Últimos Períodos
              </Typography>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>Período</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="center">Qtd</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Débito</TableCell>
                      <TableCell sx={{ fontWeight: 600 }} align="right">Saldo</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(dash?.porPeriodo || []).map(p => (
                      <TableRow key={p.periodo_apuracao} hover>
                        <TableCell>{p.periodo_apuracao}</TableCell>
                        <TableCell align="center">{p.qtd}</TableCell>
                        <TableCell align="right">{formatCurrency(p.debito)}</TableCell>
                        <TableCell align="right">{formatCurrency(p.saldo)}</TableCell>
                      </TableRow>
                    ))}
                    {(dash?.porPeriodo?.length || 0) === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                          Nenhuma declaração encontrada
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Próximos vencimentos */}
        <Grid size={{ xs: 12, md: 5 }}>
          <Card sx={{ borderRadius: 3, boxShadow: '0 2px 12px rgba(0,0,0,.08)' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                <ReceiptIcon sx={{ fontSize: 18, mr: 0.5, verticalAlign: 'text-bottom' }} />
                Próximos Vencimentos DARF
              </Typography>
              {(dash?.vencimentos?.length || 0) === 0 ? (
                <Box sx={{ py: 4, textAlign: 'center' }}>
                  <CheckCircleIcon sx={{ fontSize: 40, color: '#4caf50', mb: 1 }} />
                  <Typography color="text.secondary">Nenhum DARF pendente</Typography>
                </Box>
              ) : (
                dash!.vencimentos.map(v => {
                  const dias = Math.ceil((new Date(v.darf_vencimento).getTime() - Date.now()) / 86400000);
                  const isUrgente = dias <= 5;
                  return (
                    <Box key={v.id} sx={{
                      p: 1.5, mb: 1, borderRadius: 2,
                      border: `1px solid ${isUrgente ? '#ffcdd2' : '#e0e0e0'}`,
                      bgcolor: isUrgente ? '#fff5f5' : 'transparent',
                    }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Box>
                          <Typography variant="body2" fontWeight={600} noWrap sx={{ maxWidth: 180 }}>
                            {v.razao_social}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {v.categoria} · {v.periodo_apuracao}
                          </Typography>
                        </Box>
                        <Box sx={{ textAlign: 'right' }}>
                          <Typography variant="body2" fontWeight={700} color={isUrgente ? 'error.main' : 'text.primary'}>
                            {formatCurrency(v.darf_valor)}
                          </Typography>
                          <Chip label={`${formatDate(v.darf_vencimento)} (${dias}d)`}
                            size="small" color={isUrgente ? 'error' : 'default'}
                            sx={{ fontSize: 11 }} />
                        </Box>
                      </Box>
                    </Box>
                  );
                })
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
