import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  List,
  ListItem,
  ListItemText,
  Alert,
  Chip,
} from '@mui/material';
import {
  People as PeopleIcon,
  CalendarMonth as CalendarIcon,
  AttachMoney as MoneyIcon,
  TrendingUp as TrendingIcon,
  Schedule as ScheduleIcon,
  Cake as CakeIcon,
  AttachMoney as AttachMoneyIcon,
  TrendingDown as TrendingDownIcon,
} from '@mui/icons-material';
import { dashboardService, type DashboardIndicadores } from '../services/dashboardService';
import { manutencaoService, type Manutencao } from '../services/manutencaoService';
import { formatarData } from '../utils/dateHelpers';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  navy:        '#0a1628',
  cyan:        '#00c8f0',
  cyanDim:     'rgba(0, 200, 240, 0.08)',
  cyanBorder:  'rgba(0, 200, 240, 0.18)',
  textPrimary: '#1a2332',
  textSecond:  '#64748b',
  textMuted:   'rgba(100, 116, 139, 0.65)',
  border:      'rgba(15, 30, 60, 0.09)',
  surface:     '#FFFFFF',
  cardShadow:  '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

interface MetricCard {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  suffix?: string;
}

export default function DashboardPage() {
  const [indicadores, setIndicadores] = useState<DashboardIndicadores | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [manutencoesAtivas, setManutencoesAtivas] = useState<Manutencao[]>([]);

  const { user } = useAuth();

  useEffect(() => {
    const carregarIndicadores = async () => {
      try {
        setLoading(true);
        const [dados, ativas] = await Promise.all([
          dashboardService.indicadores(),
          manutencaoService.ativas()
        ]);
        setIndicadores(dados);
        setManutencoesAtivas(ativas);
      } catch (error: any) {
        logger.error('Erro ao carregar indicadores', error);
        setError('Erro ao carregar indicadores');
      } finally {
        setLoading(false);
      }
    };

    carregarIndicadores();
  }, []);

  const cards: MetricCard[] = [
    {
      title: 'Usuários Ativos',
      value: indicadores ? indicadores.qtdePacientes.toString() : '—',
      icon: <PeopleIcon sx={{ fontSize: 20 }} />,
      accent: T.cyan,
    },
    {
      title: 'Agendamentos Hoje',
      value: indicadores ? indicadores.qtdeAgendamentosHoje.toString() : '—',
      icon: <CalendarIcon sx={{ fontSize: 20 }} />,
      accent: '#66BB6A',
    },
    {
      title: 'Receitas do Mês',
      value: indicadores
        ? `R$ ${indicadores.totalReceitasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : 'R$ —',
      icon: <MoneyIcon sx={{ fontSize: 20 }} />,
      accent: '#78BE20',
    },
    {
      title: 'Despesas do Mês',
      value: indicadores
        ? `R$ ${indicadores.totalDespesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
        : 'R$ —',
      icon: <TrendingDownIcon sx={{ fontSize: 20 }} />,
      accent: '#D32F2F',
    },
    {
      title: 'Taxa de Ocupação',
      value: indicadores ? `${indicadores.taxaOcupacao.toFixed(1)}%` : '—',
      icon: <TrendingIcon sx={{ fontSize: 20 }} />,
      accent: '#FFA726',
    },
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress sx={{ color: T.cyan }} />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="error" sx={{ borderRadius: '10px' }}>{error}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      {/* Cabeçalho da página */}
      <Box sx={{ mb: 4 }}>
        <Typography sx={{
          fontSize: '1.375rem', fontWeight: 700,
          color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2,
        }}>
          Bem-vindo, {user?.nome?.split(' ')[0]}.
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.5 }}>
          Aqui está um resumo do seu painel fiscal.
        </Typography>
      </Box>

      {/* Avisos de Manutenção */}
      {manutencoesAtivas.map(m => (
        <Alert
          key={m.id}
          severity={m.status === 'em_execucao' ? 'error' : 'warning'}
          sx={{ mb: 2, borderRadius: '10px' }}
        >
          <strong>
            {m.status === 'em_execucao' ? 'Manutenção em andamento' : 'Manutenção programada'}
          </strong>
          {' — '}{m.descricao}
          {m.dt_fim && (
            <> (previsão de término: {new Date(m.dt_fim).toLocaleString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })})</>
          )}
        </Alert>
      ))}

      {/* Cards de métricas */}
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 2, mb: 4 }}>
        {cards.map((card) => (
          <Card key={card.title} elevation={0} sx={{
            borderRadius: '12px',
            border: `1px solid ${T.border}`,
            boxShadow: T.cardShadow,
            backgroundColor: T.surface,
            transition: 'box-shadow 0.2s ease',
            '&:hover': { boxShadow: '0 4px 20px rgba(0,0,0,0.09)' },
          }}>
            <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
              {/* Ícone */}
              <Box sx={{
                width: 40, height: 40, borderRadius: '10px',
                backgroundColor: card.accent + '14',
                border: `1px solid ${card.accent}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: card.accent, mb: 2,
              }}>
                {card.icon}
              </Box>

              {/* Valor */}
              <Typography sx={{
                fontSize: '1.625rem', fontWeight: 700,
                color: T.textPrimary, letterSpacing: '-0.03em',
                lineHeight: 1, mb: 0.5,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {card.value}
              </Typography>

              {/* Label */}
              <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, fontWeight: 500 }}>
                {card.title}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>

      {/* Linha inferior — dois cards lado a lado */}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>

        {/* Próximos Agendamentos */}
        {indicadores && indicadores.proximosAgendamentos.length > 0 && (
          <Card elevation={0} sx={{
            borderRadius: '12px', border: `1px solid ${T.border}`,
            boxShadow: T.cardShadow, backgroundColor: T.surface,
          }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{
                px: 2.5, py: 2,
                display: 'flex', alignItems: 'center', gap: 1,
                borderBottom: `1px solid ${T.border}`,
              }}>
                <ScheduleIcon sx={{ color: T.cyan, fontSize: 18 }} />
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
                  Próximos Agendamentos
                </Typography>
                <Chip
                  label={indicadores.proximosAgendamentos.length}
                  size="small"
                  sx={{
                    ml: 'auto', height: 20, fontSize: '0.6875rem', fontWeight: 600,
                    backgroundColor: T.cyanDim, color: T.cyan,
                    border: `1px solid ${T.cyanBorder}`,
                  }}
                />
              </Box>
              <List disablePadding>
                {indicadores.proximosAgendamentos.map((agendamento, index) => (
                  <ListItem
                    key={index}
                    divider={index < indicadores.proximosAgendamentos.length - 1}
                    sx={{
                      px: 2.5, py: 1.25,
                      '& .MuiDivider-root': { borderColor: T.border },
                    }}
                  >
                    <ListItemText
                      primary={agendamento.paciente_nome}
                      secondary={new Date(agendamento.data_inicio).toLocaleString('pt-BR', {
                        hour: '2-digit', minute: '2-digit'
                      })}
                      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}
                      secondaryTypographyProps={{ fontSize: '0.8125rem', color: T.textSecond }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        )}

        {/* Aniversariantes do Dia */}
        {indicadores && indicadores.aniversariantesDoDia && indicadores.aniversariantesDoDia.length > 0 && (
          <Card elevation={0} sx={{
            borderRadius: '12px', border: `1px solid ${T.border}`,
            boxShadow: T.cardShadow, backgroundColor: T.surface,
          }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{
                px: 2.5, py: 2,
                display: 'flex', alignItems: 'center', gap: 1,
                borderBottom: `1px solid ${T.border}`,
              }}>
                <CakeIcon sx={{ color: '#FFA726', fontSize: 18 }} />
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
                  Aniversariantes do Dia
                </Typography>
                <Chip
                  label={indicadores.aniversariantesDoDia.length}
                  size="small"
                  sx={{
                    ml: 'auto', height: 20, fontSize: '0.6875rem', fontWeight: 600,
                    backgroundColor: 'rgba(255,167,38,0.10)', color: '#FFA726',
                    border: '1px solid rgba(255,167,38,0.22)',
                  }}
                />
              </Box>
              <List disablePadding>
                {indicadores.aniversariantesDoDia.map((paciente, index) => (
                  <ListItem
                    key={index}
                    divider={index < indicadores.aniversariantesDoDia.length - 1}
                    sx={{ px: 2.5, py: 1.25 }}
                  >
                    <ListItemText
                      primary={paciente.nome}
                      secondary={`Aniversário: ${formatarData(paciente.dt_nascimento)}`}
                      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}
                      secondaryTypographyProps={{ fontSize: '0.8125rem', color: T.textSecond }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        )}

        {/* Contas a Vencer */}
        {indicadores && indicadores.contasVencer && indicadores.contasVencer.length > 0 && (
          <Card elevation={0} sx={{
            borderRadius: '12px', border: `1px solid ${T.border}`,
            boxShadow: T.cardShadow, backgroundColor: T.surface,
            gridColumn: { xs: '1', md: '1 / -1' },
          }}>
            <CardContent sx={{ p: 0, '&:last-child': { pb: 0 } }}>
              <Box sx={{
                px: 2.5, py: 2,
                display: 'flex', alignItems: 'center', gap: 1,
                borderBottom: `1px solid ${T.border}`,
              }}>
                <AttachMoneyIcon sx={{ color: '#D32F2F', fontSize: 18 }} />
                <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
                  Contas a Vencer — próximos 15 dias
                </Typography>
                <Chip
                  label={indicadores.contasVencer.length}
                  size="small"
                  sx={{
                    ml: 'auto', height: 20, fontSize: '0.6875rem', fontWeight: 600,
                    backgroundColor: 'rgba(211,47,47,0.08)', color: '#D32F2F',
                    border: '1px solid rgba(211,47,47,0.20)',
                  }}
                />
              </Box>
              <List disablePadding>
                {indicadores.contasVencer.map((conta, index) => (
                  <ListItem
                    key={index}
                    divider={index < indicadores.contasVencer.length - 1}
                    sx={{ px: 2.5, py: 1.25 }}
                  >
                    <ListItemText
                      primary={`${conta.tipo_conta} — ${conta.descricao}`}
                      secondary={`Vencimento: ${new Date(conta.dt_vencimento).toLocaleDateString('pt-BR')} · R$ ${conta.valor.toFixed(2)}`}
                      primaryTypographyProps={{ fontSize: '0.875rem', fontWeight: 500, color: T.textPrimary }}
                      secondaryTypographyProps={{ fontSize: '0.8125rem', color: T.textSecond }}
                    />
                    <Chip
                      label={`R$ ${conta.valor.toFixed(2)}`}
                      size="small"
                      sx={{
                        fontSize: '0.75rem', fontWeight: 600,
                        backgroundColor: 'rgba(211,47,47,0.08)', color: '#D32F2F',
                        border: '1px solid rgba(211,47,47,0.18)',
                        flexShrink: 0,
                      }}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        )}
      </Box>
    </Box>
  );
}
