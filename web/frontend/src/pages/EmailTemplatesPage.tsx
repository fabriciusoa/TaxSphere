import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Tabs,
  Tab,
  TextField,
  Button,
  Card,
  CardContent,
  Stack,
  Alert,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemText,
  Divider,
  CircularProgress,
  LinearProgress
} from '@mui/material';
import {
  Save as SaveIcon,
  RestartAlt as RestartIcon,
  Send as SendIcon
} from '@mui/icons-material';

import emailTemplatesService from '../services/emailTemplatesService';
import type { EmailTemplate } from '../services/emailTemplatesService';
import { logger } from '../utils/logger';

// Templates padrão (hardcoded como fallback)
const TEMPLATE_DEFAULT_CONFIRMACAO = {
  assunto: 'Confirmação de Consulta - {{data_hora}}',
  corpo: `Olá {{nome_paciente}},

Sua consulta foi agendada com sucesso!

Detalhes:
- Data e Hora: {{data_hora}}
- Profissional: {{nome_profissional}}
- Tipo: {{tipo_consulta}}

Para confirmar sua presença, clique no link abaixo:
{{link_confirmacao}}

Se precisar remarcar ou cancelar, use os links:
- Remarcar: {{link_remarcar}}
- Cancelar: {{link_cancelar}}

Até breve!`
};

const TEMPLATE_DEFAULT_LEMBRETE = {
  assunto: 'Lembrete: Consulta amanhã - {{data_hora}}',
  corpo: `Olá {{nome_paciente}},

Este é um lembrete da sua consulta:

Detalhes:
- Data e Hora: {{data_hora}}
- Profissional: {{nome_profissional}}
- Tipo: {{tipo_consulta}}

Caso não possa comparecer, por favor nos avise:
{{link_cancelar}}

Aguardamos você!`
};

const ASSINATURA_DEFAULT = `Atenciosamente,
Equipe de Atendimento`;

const VARIAVEIS_DISPONIVEIS = [
  { tag: '{{nome_paciente}}', descricao: 'Nome completo do paciente' },
  { tag: '{{nome_profissional}}', descricao: 'Nome do profissional' },
  { tag: '{{data_hora}}', descricao: 'Data e hora da consulta (formato: DD/MM/YYYY às HH:MM)' },
  { tag: '{{tipo_consulta}}', descricao: 'Tipo da consulta (Primeira Consulta, Retorno, etc.)' },
  { tag: '{{link_confirmacao}}', descricao: 'Link para confirmação pública' },
  { tag: '{{link_remarcar}}', descricao: 'Link para remarcação pública' },
  { tag: '{{link_cancelar}}', descricao: 'Link para cancelamento público' }
];

const EmailTemplatesPage: React.FC = () => {
  const [tabAtual, setTabAtual] = useState(0);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [enviandoTeste, setEnviandoTeste] = useState(false);
  
  // Template states
  const [assuntoConfirmacao, setAssuntoConfirmacao] = useState('');
  const [corpoConfirmacao, setCorpoConfirmacao] = useState('');
  const [assuntoLembrete, setAssuntoLembrete] = useState('');
  const [corpoLembrete, setCorpoLembrete] = useState('');
  const [assinatura, setAssinatura] = useState('');
  
  // UI states
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false,
    message: '',
    severity: 'success'
  });
  const [dialogResetar, setDialogResetar] = useState(false);

  // Carregar templates no mount
  useEffect(() => {
    carregarTemplates();
  }, []);

  const carregarTemplates = async () => {
    try {
      setLoading(true);
      const template = await emailTemplatesService.buscar();
      
      setAssuntoConfirmacao(template.assunto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.assunto);
      setCorpoConfirmacao(template.corpo_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.corpo);
      setAssuntoLembrete(template.assunto_lembrete || TEMPLATE_DEFAULT_LEMBRETE.assunto);
      setCorpoLembrete(template.corpo_lembrete || TEMPLATE_DEFAULT_LEMBRETE.corpo);
      setAssinatura(template.assinatura || ASSINATURA_DEFAULT);
    } catch (error: any) {
      logger.error('Erro ao carregar templates', error);
      mostrarSnackbar('Erro ao carregar templates. Usando padrões do sistema.', 'error');
      
      // Fallback para templates padrão
      setAssuntoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.assunto);
      setCorpoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.corpo);
      setAssuntoLembrete(TEMPLATE_DEFAULT_LEMBRETE.assunto);
      setCorpoLembrete(TEMPLATE_DEFAULT_LEMBRETE.corpo);
      setAssinatura(ASSINATURA_DEFAULT);
    } finally {
      setLoading(false);
    }
  };

  // Salvar templates
  const handleSalvar = async () => {
    // Validações
    if (assuntoConfirmacao.length > 200) {
      mostrarSnackbar('Assunto de confirmação deve ter no máximo 200 caracteres', 'error');
      return;
    }
    if (corpoConfirmacao.length > 5000) {
      mostrarSnackbar('Corpo de confirmação deve ter no máximo 5000 caracteres', 'error');
      return;
    }
    if (assuntoLembrete.length > 200) {
      mostrarSnackbar('Assunto de lembrete deve ter no máximo 200 caracteres', 'error');
      return;
    }
    if (corpoLembrete.length > 5000) {
      mostrarSnackbar('Corpo de lembrete deve ter no máximo 5000 caracteres', 'error');
      return;
    }
    if (assinatura.length > 500) {
      mostrarSnackbar('Assinatura deve ter no máximo 500 caracteres', 'error');
      return;
    }

    try {
      setSalvando(true);
      
      const template: EmailTemplate = {
        assunto_confirmacao: assuntoConfirmacao,
        corpo_confirmacao: corpoConfirmacao,
        assunto_lembrete: assuntoLembrete,
        corpo_lembrete: corpoLembrete,
        assinatura: assinatura
      };

      await emailTemplatesService.atualizar(template);
      mostrarSnackbar('Templates salvos com sucesso!', 'success');
    } catch (error: any) {
      logger.error('Erro ao salvar templates', error);
      const message = error.response?.data?.message || 'Erro ao salvar templates';
      mostrarSnackbar(message, 'error');
    } finally {
      setSalvando(false);
    }
  };

  // Resetar para padrão
  const handleResetar = () => {
    setAssuntoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.assunto);
    setCorpoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.corpo);
    setAssuntoLembrete(TEMPLATE_DEFAULT_LEMBRETE.assunto);
    setCorpoLembrete(TEMPLATE_DEFAULT_LEMBRETE.corpo);
    setAssinatura(ASSINATURA_DEFAULT);
    setDialogResetar(false);
    mostrarSnackbar('Templates resetados para padrão', 'success');
  };

  // Enviar email de teste
  const handleEnviarTeste = async () => {
    try {
      setEnviandoTeste(true);
      const resultado = await emailTemplatesService.testar();
      
      if (resultado.success) {
        mostrarSnackbar(resultado.message || 'Email de teste enviado com sucesso!', 'success');
      } else {
        mostrarSnackbar(resultado.error || 'Erro ao enviar email de teste', 'error');
      }
    } catch (error: any) {
      logger.error('Erro ao enviar email de teste', error);
      const message = error.response?.data?.message || 'Erro ao enviar email de teste';
      mostrarSnackbar(message, 'error');
    } finally {
      setEnviandoTeste(false);
    }
  };

  const mostrarSnackbar = (message: string, severity: 'success' | 'error') => {
    setSnackbar({ open: true, message, severity });
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  // Calcular progresso do contador (para indicador visual)
  const calcularProgresso = (tamanho: number, max: number): number => {
    return (tamanho / max) * 100;
  };

  // Verificar se está próximo do limite (> 90%)
  const estaProximoLimite = (tamanho: number, max: number): boolean => {
    return tamanho > max * 0.9;
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Templates de E-mail
      </Typography>

      <Alert severity="info" sx={{ mb: 3 }}>
        Personalize os templates de e-mail enviados aos pacientes. Tags HTML serão removidas automaticamente.
      </Alert>

      {/* TODO: 05 Implementar preview visual dos templates com substituição das variáveis */}

      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' } }}>
        {/* Painel Principal */}
        <Box sx={{ flex: 1 }}>
          <Card>
            <CardContent>
              <Tabs value={tabAtual} onChange={(_, newValue) => setTabAtual(newValue)} sx={{ mb: 3 }}>
                <Tab label="E-mail de Confirmação" />
                <Tab label="E-mail de Lembrete" />
              </Tabs>

              {/* Tab 1 - Confirmação */}
              {tabAtual === 0 && (
                <Stack spacing={3}>
                  <Box>
                    <TextField
                      label="Assunto"
                      value={assuntoConfirmacao}
                      onChange={(e) => setAssuntoConfirmacao(e.target.value)}
                      fullWidth
                      helperText={`${assuntoConfirmacao.length}/200 caracteres`}
                      error={assuntoConfirmacao.length > 200}
                      FormHelperTextProps={{
                        sx: { color: estaProximoLimite(assuntoConfirmacao.length, 200) ? 'error.main' : 'text.secondary' }
                      }}
                    />
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(calcularProgresso(assuntoConfirmacao.length, 200), 100)}
                      color={estaProximoLimite(assuntoConfirmacao.length, 200) ? 'error' : 'primary'}
                      sx={{ mt: 1 }}
                    />
                  </Box>

                  <Box>
                    <TextField
                      label="Corpo do E-mail"
                      value={corpoConfirmacao}
                      onChange={(e) => setCorpoConfirmacao(e.target.value)}
                      fullWidth
                      multiline
                      rows={15}
                      helperText={`${corpoConfirmacao.length}/5000 caracteres - Tags HTML serão removidas`}
                      error={corpoConfirmacao.length > 5000}
                      FormHelperTextProps={{
                        sx: { color: estaProximoLimite(corpoConfirmacao.length, 5000) ? 'error.main' : 'text.secondary' }
                      }}
                    />
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(calcularProgresso(corpoConfirmacao.length, 5000), 100)}
                      color={estaProximoLimite(corpoConfirmacao.length, 5000) ? 'error' : 'primary'}
                      sx={{ mt: 1 }}
                    />
                  </Box>
                </Stack>
              )}

              {/* Tab 2 - Lembrete */}
              {tabAtual === 1 && (
                <Stack spacing={3}>
                  <Box>
                    <TextField
                      label="Assunto"
                      value={assuntoLembrete}
                      onChange={(e) => setAssuntoLembrete(e.target.value)}
                      fullWidth
                      helperText={`${assuntoLembrete.length}/200 caracteres`}
                      error={assuntoLembrete.length > 200}
                      FormHelperTextProps={{
                        sx: { color: estaProximoLimite(assuntoLembrete.length, 200) ? 'error.main' : 'text.secondary' }
                      }}
                    />
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(calcularProgresso(assuntoLembrete.length, 200), 100)}
                      color={estaProximoLimite(assuntoLembrete.length, 200) ? 'error' : 'primary'}
                      sx={{ mt: 1 }}
                    />
                  </Box>

                  <Box>
                    <TextField
                      label="Corpo do E-mail"
                      value={corpoLembrete}
                      onChange={(e) => setCorpoLembrete(e.target.value)}
                      fullWidth
                      multiline
                      rows={15}
                      helperText={`${corpoLembrete.length}/5000 caracteres - Tags HTML serão removidas`}
                      error={corpoLembrete.length > 5000}
                      FormHelperTextProps={{
                        sx: { color: estaProximoLimite(corpoLembrete.length, 5000) ? 'error.main' : 'text.secondary' }
                      }}
                    />
                    <LinearProgress 
                      variant="determinate" 
                      value={Math.min(calcularProgresso(corpoLembrete.length, 5000), 100)}
                      color={estaProximoLimite(corpoLembrete.length, 5000) ? 'error' : 'primary'}
                      sx={{ mt: 1 }}
                    />
                  </Box>
                </Stack>
              )}

              {/* Assinatura (comum para ambos) */}
              <Box sx={{ mt: 3 }}>
                <TextField
                  label="Assinatura"
                  value={assinatura}
                  onChange={(e) => setAssinatura(e.target.value)}
                  fullWidth
                  multiline
                  rows={4}
                  helperText={`${assinatura.length}/500 caracteres`}
                  error={assinatura.length > 500}
                  FormHelperTextProps={{
                    sx: { color: estaProximoLimite(assinatura.length, 500) ? 'error.main' : 'text.secondary' }
                  }}
                />
                <LinearProgress 
                  variant="determinate" 
                  value={Math.min(calcularProgresso(assinatura.length, 500), 100)}
                  color={estaProximoLimite(assinatura.length, 500) ? 'error' : 'primary'}
                  sx={{ mt: 1 }}
                />
              </Box>

              {/* Botões de Ação */}
              <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
                <Button
                  variant="contained"
                  startIcon={<SaveIcon />}
                  onClick={handleSalvar}
                  disabled={salvando}
                  fullWidth
                >
                  {salvando ? 'Salvando...' : 'Salvar'}
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<RestartIcon />}
                  onClick={() => setDialogResetar(true)}
                  disabled={salvando}
                  color="warning"
                >
                  Resetar para Padrão
                </Button>
                <Button
                  variant="outlined"
                  startIcon={<SendIcon />}
                  onClick={handleEnviarTeste}
                  disabled={enviandoTeste || salvando}
                  color="info"
                >
                  {enviandoTeste ? 'Enviando...' : 'Enviar E-mail de Teste'}
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>

        {/* Painel Lateral - Variáveis Disponíveis */}
        <Box sx={{ width: { xs: '100%', md: 350 } }}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Variáveis Disponíveis
              </Typography>
              <Typography variant="body2" color="text.secondary" paragraph>
                Use estas tags nos seus templates. Elas serão substituídas pelos dados reais:
              </Typography>
              <List dense>
                {VARIAVEIS_DISPONIVEIS.map((variavel, index) => (
                  <React.Fragment key={variavel.tag}>
                    {index > 0 && <Divider />}
                    <ListItem>
                      <ListItemText
                        primary={
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 'bold' }}>
                            {variavel.tag}
                          </Typography>
                        }
                        secondary={
                          <Typography variant="caption" color="text.secondary">
                            {variavel.descricao}
                          </Typography>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </CardContent>
          </Card>
        </Box>
      </Box>

      {/* Dialog de Confirmação - Resetar */}
      <Dialog open={dialogResetar} onClose={() => setDialogResetar(false)}>
        <DialogTitle>Resetar Templates para Padrão</DialogTitle>
        <DialogContent>
          <Typography>
            Tem certeza que deseja resetar todos os templates para os valores padrão do sistema? 
            Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogResetar(false)}>Cancelar</Button>
          <Button onClick={handleResetar} color="warning" variant="contained">
            Resetar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar para feedbacks */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert onClose={handleCloseSnackbar} severity={snackbar.severity} sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default EmailTemplatesPage;
