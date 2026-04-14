import { useState, useEffect, useRef } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField, MenuItem,
  IconButton, CircularProgress, Alert, Paper,
} from '@mui/material';
import {
  Send as SendIcon,
  TrendingUp as TrendingUpIcon,
  Lightbulb as LightbulbIcon,
  Shield as ShieldIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import type { PerdcompEmpresa, IAChatMessage } from '../../types/perdcomp';
import { logger } from '../../utils/logger';

const T = {
  navy: '#0a1628',
  cyan: '#00c8f0',
  slate: '#64748b',
  textPrimary: '#1a2332',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

function renderBoldSegments(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={j}>{part.slice(2, -2)}</strong>;
    }
    return <span key={j}>{part}</span>;
  });
}

function formatAssistantContent(text: string) {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (/^[-•]\s/.test(line)) {
      return (
        <Typography
          key={i}
          component="li"
          sx={{ fontSize: '0.875rem', color: T.textPrimary, ml: 2, mb: 0.25 }}
        >
          {renderBoldSegments(line.replace(/^[-•]\s/, ''))}
        </Typography>
      );
    }

    if (line.trim() === '') return <Box key={i} sx={{ height: 8 }} />;

    return (
      <Typography
        key={i}
        sx={{ fontSize: '0.875rem', color: T.textPrimary, mb: 0.25 }}
      >
        {renderBoldSegments(line)}
      </Typography>
    );
  });
}

export default function AssistenteIAPage() {
  const [empresas, setEmpresas] = useState<PerdcompEmpresa[]>([]);
  const [empresaId, setEmpresaId] = useState<number | ''>('');
  const [messages, setMessages] = useState<IAChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pedidoIdRisco, setPedidoIdRisco] = useState('');
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    perdcompService.empresas.listar({ ativo: 'true', limit: 200 })
      .then(res => setEmpresas(res.data))
      .catch(err => {
        logger.error('Erro ao carregar empresas', err);
        setError('Erro ao carregar empresas');
      });
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addAssistantMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'assistant', content, timestamp: new Date().toISOString() }]);
  };

  const addUserMessage = (content: string) => {
    setMessages(prev => [...prev, { role: 'user', content, timestamp: new Date().toISOString() }]);
  };

  const handleAnalisar = async () => {
    if (!empresaId) return;
    try {
      setLoading(true);
      addUserMessage('Analisar oportunidades de compensação');
      const res = await perdcompService.ia.analisar(empresaId as number);
      addAssistantMessage(res.analise);
    } catch (err: any) {
      logger.error('Erro na análise IA', err);
      addAssistantMessage('Desculpe, ocorreu um erro ao analisar oportunidades. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleSugerir = async () => {
    if (!empresaId) return;
    try {
      setLoading(true);
      addUserMessage('Sugerir estratégia de compensação');
      const res = await perdcompService.ia.sugerir(empresaId as number);
      addAssistantMessage(res.sugestao);
    } catch (err: any) {
      logger.error('Erro na sugestão IA', err);
      addAssistantMessage('Desculpe, ocorreu um erro ao gerar sugestões. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleRisco = async () => {
    const id = Number(pedidoIdRisco);
    if (!id) return;
    try {
      setLoading(true);
      addUserMessage(`Avaliar risco do pedido #${id}`);
      const res = await perdcompService.ia.risco(id);
      addAssistantMessage(res.avaliacao);
    } catch (err: any) {
      logger.error('Erro na avaliação de risco IA', err);
      addAssistantMessage('Desculpe, ocorreu um erro ao avaliar o risco. Verifique o ID do pedido.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !empresaId) return;
    const msg = input.trim();
    setInput('');
    addUserMessage(msg);

    try {
      setLoading(true);
      const historico = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await perdcompService.ia.chat(empresaId as number, msg, historico);
      addAssistantMessage(res.resposta);
    } catch (err: any) {
      logger.error('Erro no chat IA', err);
      addAssistantMessage('Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' }}>
      <Box sx={{ mb: 2 }}>
        <Typography sx={{
          fontSize: '1.375rem', fontWeight: 700,
          color: T.textPrimary, letterSpacing: '-0.02em', mb: 0.5,
        }}>
          Assistente IA Fiscal
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: T.slate, mb: 2 }}>
          Consulte a IA para análise de oportunidades, estratégias e avaliação de riscos fiscais.
        </Typography>

        <TextField
          select
          size="small"
          value={empresaId}
          onChange={e => { setEmpresaId(Number(e.target.value)); setMessages([]); }}
          sx={{ minWidth: 400, mb: 2 }}
        >
          <MenuItem value="" disabled>Selecione uma empresa</MenuItem>
          {empresas.map(emp => (
            <MenuItem key={emp.id} value={emp.id}>
              {emp.razao_social} — {emp.cnpj}
            </MenuItem>
          ))}
        </TextField>
      </Box>

      {!empresaId ? (
        <Alert severity="info" sx={{ borderRadius: '10px' }}>
          Selecione uma empresa acima para começar a usar o Assistente IA.
        </Alert>
      ) : (
        <>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>{error}</Alert>}

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={4}>
              <Card
                elevation={0}
                onClick={handleAnalisar}
                sx={{
                  borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow,
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  '&:hover': loading ? {} : { boxShadow: '0 4px 20px rgba(0,0,0,0.09)', borderColor: T.cyan },
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: '10px',
                    backgroundColor: T.cyan + '14', border: `1px solid ${T.cyan}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <TrendingUpIcon sx={{ color: T.cyan, fontSize: 20 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textPrimary }}>
                      Analisar Oportunidades
                    </Typography>
                    <Typography sx={{ fontSize: '0.6875rem', color: T.slate }}>
                      Identifique créditos e compensações
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Card
                elevation={0}
                onClick={handleSugerir}
                sx={{
                  borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow,
                  cursor: loading ? 'default' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                  transition: 'all 0.2s ease',
                  '&:hover': loading ? {} : { boxShadow: '0 4px 20px rgba(0,0,0,0.09)', borderColor: '#f59e0b' },
                }}
              >
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: '10px',
                    backgroundColor: '#f59e0b14', border: '1px solid #f59e0b22',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <LightbulbIcon sx={{ color: '#f59e0b', fontSize: 20 }} />
                  </Box>
                  <Box>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textPrimary }}>
                      Sugerir Estratégia
                    </Typography>
                    <Typography sx={{ fontSize: '0.6875rem', color: T.slate }}>
                      Receba recomendações fiscais
                    </Typography>
                  </Box>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={4}>
              <Card elevation={0} sx={{
                borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow,
              }}>
                <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 2, '&:last-child': { pb: 2 } }}>
                  <Box sx={{
                    width: 40, height: 40, borderRadius: '10px',
                    backgroundColor: '#ef444414', border: '1px solid #ef444422',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <ShieldIcon sx={{ color: '#ef4444', fontSize: 20 }} />
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography sx={{ fontSize: '0.8125rem', fontWeight: 600, color: T.textPrimary, mb: 0.5 }}>
                      Avaliar Risco
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                      <TextField
                        size="small"
                        placeholder="ID do pedido"
                        value={pedidoIdRisco}
                        onChange={e => setPedidoIdRisco(e.target.value)}
                        type="number"
                        sx={{ flex: 1, '& input': { fontSize: '0.75rem', py: 0.5 } }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={handleRisco}
                        disabled={loading || !pedidoIdRisco}
                        sx={{
                          minWidth: 'auto', px: 1.5, fontSize: '0.6875rem',
                          borderColor: '#ef4444', color: '#ef4444', textTransform: 'none',
                          '&:hover': { borderColor: '#dc2626', backgroundColor: '#ef444408' },
                        }}
                      >
                        Avaliar
                      </Button>
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Paper
            elevation={0}
            sx={{
              flex: 1, display: 'flex', flexDirection: 'column',
              borderRadius: '12px', border: `1px solid ${T.border}`,
              overflow: 'hidden', minHeight: 300,
            }}
          >
            <Box sx={{
              flex: 1, overflowY: 'auto', p: 2.5,
              display: 'flex', flexDirection: 'column', gap: 1.5,
              backgroundColor: '#f8fafc',
            }}>
              {messages.length === 0 && (
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                  <Typography sx={{ color: T.slate, fontSize: '0.875rem' }}>
                    Envie uma mensagem ou use uma das ações rápidas acima.
                  </Typography>
                </Box>
              )}

              {messages.map((msg, i) => (
                <Box
                  key={i}
                  sx={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <Box sx={{
                    maxWidth: '75%',
                    px: 2, py: 1.5,
                    borderRadius: msg.role === 'user'
                      ? '12px 12px 2px 12px'
                      : '12px 12px 12px 2px',
                    backgroundColor: msg.role === 'user' ? T.cyan : T.surface,
                    border: msg.role === 'assistant' ? `1px solid ${T.border}` : 'none',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                  }}>
                    {msg.role === 'user' ? (
                      <Typography sx={{ fontSize: '0.875rem', color: '#fff' }}>
                        {msg.content}
                      </Typography>
                    ) : (
                      <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                        {formatAssistantContent(msg.content)}
                      </Box>
                    )}
                    <Typography sx={{
                      fontSize: '0.625rem', mt: 0.75,
                      color: msg.role === 'user' ? 'rgba(255,255,255,0.7)' : T.slate,
                      textAlign: msg.role === 'user' ? 'right' : 'left',
                    }}>
                      {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </Typography>
                  </Box>
                </Box>
              ))}

              {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <Box sx={{
                    px: 2.5, py: 1.5, borderRadius: '12px 12px 12px 2px',
                    backgroundColor: T.surface, border: `1px solid ${T.border}`,
                    display: 'flex', alignItems: 'center', gap: 1,
                  }}>
                    <CircularProgress size={16} sx={{ color: T.cyan }} />
                    <Typography sx={{ fontSize: '0.8125rem', color: T.slate }}>Pensando...</Typography>
                  </Box>
                </Box>
              )}

              <div ref={messagesEndRef} />
            </Box>

            <Box sx={{
              p: 2, borderTop: `1px solid ${T.border}`,
              display: 'flex', gap: 1, alignItems: 'flex-end',
              backgroundColor: T.surface,
            }}>
              <TextField
                fullWidth
                multiline
                maxRows={3}
                size="small"
                placeholder="Digite sua pergunta sobre compensação tributária..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '10px',
                    fontSize: '0.875rem',
                  },
                }}
              />
              <IconButton
                onClick={handleSendMessage}
                disabled={loading || !input.trim()}
                sx={{
                  backgroundColor: T.cyan,
                  color: '#fff',
                  borderRadius: '10px',
                  width: 40, height: 40,
                  '&:hover': { backgroundColor: '#00b0d8' },
                  '&.Mui-disabled': { backgroundColor: '#e2e8f0', color: '#94a3b8' },
                }}
              >
                <SendIcon sx={{ fontSize: 18 }} />
              </IconButton>
            </Box>
          </Paper>
        </>
      )}
    </Box>
  );
}
