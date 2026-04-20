import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  CircularProgress,
  Alert,
} from '@mui/material';
import {
  People as PeopleIcon,
  SupportAgent as SupportIcon,
  Assignment as AssignmentIcon,
 // CardMembership as MembershipIcon,
} from '@mui/icons-material';
import { dashboardService, type DashboardIndicadores } from '../services/dashboardService';
import { manutencaoService, type Manutencao } from '../services/manutencaoService';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

const T = {
  navy:        '#0a1628',
  cyan:        '#00c8f0',
  textPrimary: '#1a2332',
  textSecond:  '#64748b',
  border:      'rgba(15, 30, 60, 0.09)',
  surface:     '#FFFFFF',
  cardShadow:  '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

interface MetricCard {
  title: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
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
        const [dados, ativas] = await Promise.all([dashboardService.indicadores(), manutencaoService.ativas()]);
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
      title: 'Chamados Abertos',
      value: indicadores ? (indicadores.qtdeChamadosAbertos ?? 0).toString() : '—',
      icon: <SupportIcon sx={{ fontSize: 20 }} />,
      accent: '#FFA726',
    },
    {
      title: 'Total de Chamados',
      value: indicadores ? (indicadores.qtdeChamadosTotal ?? 0).toString() : '—',
      icon: <AssignmentIcon sx={{ fontSize: 20 }} />,
      accent: T.cyan,
    },
/*    {
      title: 'Assinaturas Ativas',
      value: indicadores ? (indicadores.qtdeAssinaturasAtivas ?? 0).toString() : '—',
      icon: <MembershipIcon sx={{ fontSize: 20 }} />,
      accent: '#66BB6A',
    },*/
    {
      title: 'Usuários Ativos',
      value: indicadores ? (indicadores.qtdeUsuariosAtivos ?? 0).toString() : '—',
      icon: <PeopleIcon sx={{ fontSize: 20 }} />,
      accent: '#7C4DFF',
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

      <Box sx={{ mb: 4 }}>
        <Typography sx={{
          fontSize: '1.375rem', fontWeight: 700,
          color: T.textPrimary, letterSpacing: '-0.02em', lineHeight: 1.2,
        }}>
          Bem-vindo, {user?.nome?.split(' ')[0]}.
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.5 }}>
          Aqui está um resumo do seu painel.
        </Typography>
      </Box>

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
              <Box sx={{
                width: 40, height: 40, borderRadius: '10px',
                backgroundColor: card.accent + '14',
                border: `1px solid ${card.accent}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: card.accent, mb: 2,
              }}>
                {card.icon}
              </Box>

              <Typography sx={{
                fontSize: '1.625rem', fontWeight: 700,
                color: T.textPrimary, letterSpacing: '-0.03em',
                lineHeight: 1, mb: 0.5,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {card.value}
              </Typography>

              <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, fontWeight: 500 }}>
                {card.title}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
    </Box>
  );
}
