import { useState, useEffect } from 'react';
import { Box, Typography, Card, CardContent, CardHeader, CircularProgress, List, ListItem, ListItemText, Alert } from '@mui/material';
import {
  People as PeopleIcon,
  CalendarMonth as CalendarIcon,
  AttachMoney as MoneyIcon,
  TrendingUp as TrendingIcon,
  Schedule as ScheduleIcon,
  Cake as CakeIcon,
  AttachMoney as AttachMoneyIcon
} from '@mui/icons-material';
import { dashboardService, type DashboardIndicadores } from '../services/dashboardService';
import { manutencaoService, type Manutencao } from '../services/manutencaoService';
import { formatarData } from '../utils/dateHelpers';
import { useAuth } from '../contexts/AuthContext';
import { logger } from '../utils/logger';

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

  const cards = [
    {
      title: 'Pacientes',
      value: indicadores ? indicadores.qtdePacientes.toString() : '0',
      icon: <PeopleIcon />,
      color: '#00A3E0'
    },
    {
      title: 'Agendamentos Hoje',
      value: indicadores ? indicadores.qtdeAgendamentosHoje.toString() : '0',
      icon: <CalendarIcon />,
      color: '#78BE20'
    },
    {
      title: 'Receitas do Mês',
      value: indicadores ? `R$ ${indicadores.totalReceitasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00',
      icon: <MoneyIcon />,
      color: '#FFA726'
    },
    {
      title: 'Despesas do Mês',
      value: indicadores ? `R$ ${indicadores.totalDespesasMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'R$ 0,00',
      icon: <MoneyIcon />,
      color: '#ff0000ff'
    },    
    {
      title: 'Taxa de Ocupação',
      value: indicadores ? `${indicadores.taxaOcupacao.toFixed(2)}%` : '0%',
      icon: <TrendingIcon />,
      color: '#66BB6A'
    }
  ];

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="error">
          {error}
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom>
        Bem-vindo, {user?.nome}!
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Painel de controle do sistema Mentis
      </Typography>

      {/* Avisos de Manutenção */}
      {manutencoesAtivas.map(m => (
        <Alert
          key={m.id}
          severity={m.status === 'em_execucao' ? 'error' : 'warning'}
          sx={{ mb: 2 }}
        >
          <strong>
            {m.status === 'em_execucao' ? '⚠️ Manutenção em andamento' : '🔧 Manutenção programada'}
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

      {/* Próximos Agendamentos */}
      {indicadores && indicadores.proximosAgendamentos.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <ScheduleIcon sx={{ mr: 1 }} />
            Próximos Agendamentos
          </Typography>
          <Card>
            <CardContent>
              <List>
                {indicadores.proximosAgendamentos.map((agendamento, index) => (
                  <ListItem key={index} divider={index < indicadores.proximosAgendamentos.length - 1}>
                    <ListItemText
                      primary={agendamento.paciente_nome + ' - ' + new Date(agendamento.data_inicio).toLocaleString('pt-BR', {hour: '2-digit',minute: '2-digit'})}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Aniversariantes do Dia */}
      {indicadores && indicadores.aniversariantesDoDia && indicadores.aniversariantesDoDia.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <CakeIcon sx={{ mr: 1 }} />
            Aniversariantes do Dia
          </Typography>
          <Card>
            <CardContent>
              <List>
                {indicadores.aniversariantesDoDia.map((paciente, index) => (
                  <ListItem key={index} divider={index < indicadores.aniversariantesDoDia.length - 1}>
                    <ListItemText
                      primary={paciente.nome}
                      secondary={`Aniversário: ${formatarData(paciente.dt_nascimento)}`}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Contas a Vencer */}
      {indicadores && indicadores.contasVencer && indicadores.contasVencer.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <AttachMoneyIcon sx={{ mr: 1 }} />
            Contas a Vencer para os próximos 15 dias
          </Typography>
          <Card>
            <CardContent>
              <List>
                {indicadores.contasVencer.map((conta, index) => (
                  <ListItem key={index} divider={index < indicadores.contasVencer.length - 1}>
                    <ListItemText
                      primary={conta.tipo_conta}
                      secondary={`Descrição: ${conta.descricao} - Valor: R$ ${conta.valor.toFixed(2)} - Vencimento: ${new Date(conta.dt_vencimento).toLocaleDateString('pt-BR')}`}
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>
      )}      

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
        {cards.map((card) => (
          <Box key={card.title} sx={{ flex: '1 1 250px', minWidth: 250, maxWidth: 350 }}>
            <Card sx={{ height: '100%' }}>
              <CardHeader
                avatar={
                  <Box
                    sx={{
                      p: 1,
                      borderRadius: 2,
                      bgcolor: card.color,
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                  >
                    {card.icon}
                  </Box>
                }
              />
              <CardContent>
                <Typography variant="h4" component="div" gutterBottom>
                  {card.value}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {card.title}
                </Typography>
              </CardContent>
            </Card>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
