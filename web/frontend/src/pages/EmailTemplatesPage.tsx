import React, { useState, useEffect } from 'react';
import {
  Box, Typography, Tabs, Tab, TextField, Button, Paper,
  Stack, Alert, Snackbar, Dialog, DialogTitle, DialogContent,
  DialogActions, List, ListItem, ListItemText, Divider,
  CircularProgress, LinearProgress,
} from '@mui/material';
import {
  Save as SaveIcon,
  RestartAlt as RestartIcon,
  Send as SendIcon,
  Code as CodeIcon,
} from '@mui/icons-material';
import emailTemplatesService from '../services/emailTemplatesService';
import type { EmailTemplate } from '../services/emailTemplatesService';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:       '#00c8f0',
  cyanGlow:   '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:  '0 6px 22px rgba(0,200,240,0.38)',
  cyanDim:    'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
  textPrimary:'#1a2332',
  textSecond: '#64748b',
  border:     'rgba(15, 30, 60, 0.09)',
  surface:    '#FFFFFF',
  inputBg:    '#F7F9FC',
  navy:       '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const inputSx = {
  '& .MuiOutlinedInput-root': {
    backgroundColor: T.inputBg, borderRadius: '10px',
    '& fieldset': { borderColor: 'rgba(15,30,60,0.11)' },
    '&:hover fieldset': { borderColor: 'rgba(15,30,60,0.22)' },
    '&.Mui-focused fieldset': { borderColor: T.cyan, borderWidth: 1.5 },
  },
  '& .MuiInputLabel-root': { color: T.textSecond, fontSize: '0.875rem' },
  '& .MuiInputLabel-root.Mui-focused': { color: T.cyan },
};

const btnPrimary = {
  height: 40, borderRadius: '10px',
  backgroundColor: T.cyan, color: T.navy,
  fontWeight: 700, textTransform: 'none' as const,
  boxShadow: T.cyanGlow,
  '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
  '&.Mui-disabled': { backgroundColor: 'rgba(0,200,240,0.35)', color: T.navy },
};

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

Até breve!`,
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

Aguardamos você!`,
};

const ASSINATURA_DEFAULT = `Atenciosamente,\nEquipe de Atendimento`;

const VARIAVEIS_DISPONIVEIS = [
  { tag: '{{nome_paciente}}',    descricao: 'Nome completo do paciente' },
  { tag: '{{nome_profissional}}',descricao: 'Nome do profissional' },
  { tag: '{{data_hora}}',        descricao: 'Data e hora da consulta' },
  { tag: '{{tipo_consulta}}',    descricao: 'Tipo da consulta' },
  { tag: '{{link_confirmacao}}', descricao: 'Link para confirmação pública' },
  { tag: '{{link_remarcar}}',    descricao: 'Link para remarcação pública' },
  { tag: '{{link_cancelar}}',    descricao: 'Link para cancelamento público' },
];

const EmailTemplatesPage: React.FC = () => {
  const [tabAtual, setTabAtual]               = useState(0);
  const [loading, setLoading]                 = useState(false);
  const [salvando, setSalvando]               = useState(false);
  const [enviandoTeste, setEnviandoTeste]     = useState(false);
  const [assuntoConfirmacao, setAssuntoConfirmacao] = useState('');
  const [corpoConfirmacao, setCorpoConfirmacao]     = useState('');
  const [assuntoLembrete, setAssuntoLembrete]       = useState('');
  const [corpoLembrete, setCorpoLembrete]           = useState('');
  const [assinatura, setAssinatura]                 = useState('');
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: 'success' | 'error' }>({
    open: false, message: '', severity: 'success',
  });
  const [dialogResetar, setDialogResetar] = useState(false);

  useEffect(() => { carregarTemplates(); }, []);

  const carregarTemplates = async () => {
    try {
      setLoading(true);
      const template = await emailTemplatesService.buscar();
      setAssuntoConfirmacao(template.assunto_confirmacao || TEMPLATE_DEFAULT_CONFIRMACAO.assunto);
      setCorpoConfirmacao(template.corpo_confirmacao     || TEMPLATE_DEFAULT_CONFIRMACAO.corpo);
      setAssuntoLembrete(template.assunto_lembrete       || TEMPLATE_DEFAULT_LEMBRETE.assunto);
      setCorpoLembrete(template.corpo_lembrete           || TEMPLATE_DEFAULT_LEMBRETE.corpo);
      setAssinatura(template.assinatura                  || ASSINATURA_DEFAULT);
    } catch (error: any) {
      logger.error('Erro ao carregar templates', error);
      mostrarSnackbar('Erro ao carregar templates. Usando padrões do sistema.', 'error');
      setAssuntoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.assunto);
      setCorpoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.corpo);
      setAssuntoLembrete(TEMPLATE_DEFAULT_LEMBRETE.assunto);
      setCorpoLembrete(TEMPLATE_DEFAULT_LEMBRETE.corpo);
      setAssinatura(ASSINATURA_DEFAULT);
    } finally { setLoading(false); }
  };

  const handleSalvar = async () => {
    if (assuntoConfirmacao.length > 200) { mostrarSnackbar('Assunto de confirmação: máx. 200 caracteres', 'error'); return; }
    if (corpoConfirmacao.length > 5000)  { mostrarSnackbar('Corpo de confirmação: máx. 5000 caracteres', 'error'); return; }
    if (assuntoLembrete.length > 200)    { mostrarSnackbar('Assunto de lembrete: máx. 200 caracteres', 'error'); return; }
    if (corpoLembrete.length > 5000)     { mostrarSnackbar('Corpo de lembrete: máx. 5000 caracteres', 'error'); return; }
    if (assinatura.length > 500)         { mostrarSnackbar('Assinatura: máx. 500 caracteres', 'error'); return; }

    try {
      setSalvando(true);
      const template: EmailTemplate = {
        assunto_confirmacao: assuntoConfirmacao,
        corpo_confirmacao:   corpoConfirmacao,
        assunto_lembrete:    assuntoLembrete,
        corpo_lembrete:      corpoLembrete,
        assinatura,
      };
      await emailTemplatesService.atualizar(template);
      mostrarSnackbar('Templates salvos com sucesso!', 'success');
    } catch (error: any) {
      logger.error('Erro ao salvar templates', error);
      mostrarSnackbar(error.response?.data?.message || 'Erro ao salvar templates', 'error');
    } finally { setSalvando(false); }
  };

  const handleResetar = () => {
    setAssuntoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.assunto);
    setCorpoConfirmacao(TEMPLATE_DEFAULT_CONFIRMACAO.corpo);
    setAssuntoLembrete(TEMPLATE_DEFAULT_LEMBRETE.assunto);
    setCorpoLembrete(TEMPLATE_DEFAULT_LEMBRETE.corpo);
    setAssinatura(ASSINATURA_DEFAULT);
    setDialogResetar(false);
    mostrarSnackbar('Templates resetados para padrão', 'success');
  };

  const handleEnviarTeste = async () => {
    try {
      setEnviandoTeste(true);
      const resultado = await emailTemplatesService.testar();
      mostrarSnackbar(
        resultado.success
          ? (resultado.message || 'Email de teste enviado!')
          : (resultado.error  || 'Erro ao enviar email de teste'),
        resultado.success ? 'success' : 'error',
      );
    } catch (error: any) {
      logger.error('Erro ao enviar email de teste', error);
      mostrarSnackbar(error.response?.data?.message || 'Erro ao enviar email de teste', 'error');
    } finally { setEnviandoTeste(false); }
  };

  const mostrarSnackbar = (message: string, severity: 'success' | 'error') =>
    setSnackbar({ open: true, message, severity });

  const progresso   = (n: number, max: number) => Math.min((n / max) * 100, 100);
  const proximoLim  = (n: number, max: number) => n > max * 0.9;

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
        <CircularProgress sx={{ color: T.cyan }} />
      </Box>
    );
  }

  const tabField = (
    assunto: string, setAssunto: (v: string) => void, maxAssunto: number,
    corpo: string, setCorpo: (v: string) => void, maxCorpo: number,
  ) => (
    <Stack spacing={2.5}>
      <Box>
        <TextField
          label="Assunto"
          value={assunto}
          onChange={(e) => setAssunto(e.target.value)}
          fullWidth
          error={assunto.length > maxAssunto}
          helperText={`${assunto.length}/${maxAssunto} caracteres`}
          sx={inputSx}
        />
        <LinearProgress
          variant="determinate"
          value={progresso(assunto.length, maxAssunto)}
          sx={{
            mt: 0.75, height: 3, borderRadius: '2px',
            backgroundColor: 'rgba(15,30,60,0.06)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: proximoLim(assunto.length, maxAssunto) ? '#EF5350' : T.cyan,
              borderRadius: '2px',
            },
          }}
        />
      </Box>
      <Box>
        <TextField
          label="Corpo do E-mail"
          value={corpo}
          onChange={(e) => setCorpo(e.target.value)}
          fullWidth multiline rows={14}
          error={corpo.length > maxCorpo}
          helperText={`${corpo.length}/${maxCorpo} caracteres — Tags HTML serão removidas`}
          sx={inputSx}
        />
        <LinearProgress
          variant="determinate"
          value={progresso(corpo.length, maxCorpo)}
          sx={{
            mt: 0.75, height: 3, borderRadius: '2px',
            backgroundColor: 'rgba(15,30,60,0.06)',
            '& .MuiLinearProgress-bar': {
              backgroundColor: proximoLim(corpo.length, maxCorpo) ? '#EF5350' : T.cyan,
              borderRadius: '2px',
            },
          }}
        />
      </Box>
    </Stack>
  );

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {/* Header */}
      <Box sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
          Templates de E-mail
        </Typography>
        <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
          Personalize os e-mails enviados aos pacientes
        </Typography>
      </Box>

      <Alert severity="info" sx={{ mb: 3, borderRadius: '10px', fontSize: '0.875rem' }}>
        Tags HTML serão removidas automaticamente dos templates.
      </Alert>

      <Box sx={{ display: 'flex', gap: 3, flexDirection: { xs: 'column', md: 'row' }, alignItems: 'flex-start' }}>
        {/* Editor principal */}
        <Box sx={{ flex: 1 }}>
          <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
            {/* Tabs */}
            <Box sx={{ borderBottom: `1px solid ${T.border}`, px: 2 }}>
              <Tabs
                value={tabAtual}
                onChange={(_, v) => setTabAtual(v)}
                sx={{
                  '& .MuiTab-root': { fontSize: '0.875rem', fontWeight: 600, textTransform: 'none', color: T.textSecond, minHeight: 48 },
                  '& .MuiTab-root.Mui-selected': { color: T.cyan },
                  '& .MuiTabs-indicator': { backgroundColor: T.cyan },
                }}
              >
                <Tab label="Confirmação" />
                <Tab label="Lembrete" />
              </Tabs>
            </Box>

            <Box sx={{ p: 3 }}>
              {tabAtual === 0 && tabField(
                assuntoConfirmacao, setAssuntoConfirmacao, 200,
                corpoConfirmacao, setCorpoConfirmacao, 5000,
              )}
              {tabAtual === 1 && tabField(
                assuntoLembrete, setAssuntoLembrete, 200,
                corpoLembrete, setCorpoLembrete, 5000,
              )}

              {/* Assinatura */}
              <Box sx={{ mt: 2.5 }}>
                <TextField
                  label="Assinatura"
                  value={assinatura}
                  onChange={(e) => setAssinatura(e.target.value)}
                  fullWidth multiline rows={3}
                  error={assinatura.length > 500}
                  helperText={`${assinatura.length}/500 caracteres`}
                  sx={inputSx}
                />
                <LinearProgress
                  variant="determinate"
                  value={progresso(assinatura.length, 500)}
                  sx={{
                    mt: 0.75, height: 3, borderRadius: '2px',
                    backgroundColor: 'rgba(15,30,60,0.06)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: proximoLim(assinatura.length, 500) ? '#EF5350' : T.cyan,
                      borderRadius: '2px',
                    },
                  }}
                />
              </Box>
            </Box>

            {/* Actions footer */}
            <Box sx={{ px: 3, pb: 3, pt: 1, display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
              <Button
                variant="contained"
                startIcon={salvando ? <CircularProgress size={14} sx={{ color: T.navy }} /> : <SaveIcon sx={{ fontSize: 18 }} />}
                onClick={handleSalvar}
                disabled={salvando}
                sx={{ ...btnPrimary, flex: 1, minWidth: 100 }}
              >
                {salvando ? 'Salvando...' : 'Salvar'}
              </Button>
              <Button
                variant="outlined"
                startIcon={<RestartIcon sx={{ fontSize: 18 }} />}
                onClick={() => setDialogResetar(true)}
                disabled={salvando}
                sx={{
                  height: 40, borderRadius: '10px', textTransform: 'none', fontWeight: 600,
                  borderColor: '#FFA72640', color: '#E65100',
                  '&:hover': { borderColor: '#FFA726', backgroundColor: 'rgba(255,167,38,0.06)' },
                }}
              >
                Resetar
              </Button>
              <Button
                variant="outlined"
                startIcon={enviandoTeste ? <CircularProgress size={14} /> : <SendIcon sx={{ fontSize: 18 }} />}
                onClick={handleEnviarTeste}
                disabled={enviandoTeste || salvando}
                sx={{
                  height: 40, borderRadius: '10px', textTransform: 'none', fontWeight: 600,
                  borderColor: T.cyanBorder, color: T.cyan,
                  '&:hover': { borderColor: T.cyan, backgroundColor: T.cyanDim },
                }}
              >
                {enviandoTeste ? 'Enviando...' : 'Enviar Teste'}
              </Button>
            </Box>
          </Paper>
        </Box>

        {/* Variáveis disponíveis */}
        <Box sx={{ width: { xs: '100%', md: 300 }, flexShrink: 0 }}>
          <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 2, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 1 }}>
              <CodeIcon sx={{ fontSize: 16, color: T.textSecond }} />
              <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary }}>
                Variáveis Disponíveis
              </Typography>
            </Box>
            <Box sx={{ px: 2, pb: 1 }}>
              <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, py: 1.5 }}>
                Use estas tags nos templates — serão substituídas pelos dados reais.
              </Typography>
              <List dense disablePadding>
                {VARIAVEIS_DISPONIVEIS.map((v, i) => (
                  <React.Fragment key={v.tag}>
                    {i > 0 && <Divider sx={{ borderColor: T.border }} />}
                    <ListItem disablePadding sx={{ py: 1 }}>
                      <ListItemText
                        primary={
                          <Typography sx={{
                            fontSize: '0.8125rem', fontFamily: 'monospace', fontWeight: 600,
                            color: T.cyan, backgroundColor: T.cyanDim,
                            border: `1px solid ${T.cyanBorder}`,
                            borderRadius: '6px', px: 1, py: 0.25, display: 'inline-block',
                          }}>
                            {v.tag}
                          </Typography>
                        }
                        secondary={
                          <Typography sx={{ fontSize: '0.75rem', color: T.textSecond, mt: 0.5 }}>
                            {v.descricao}
                          </Typography>
                        }
                      />
                    </ListItem>
                  </React.Fragment>
                ))}
              </List>
            </Box>
          </Paper>
        </Box>
      </Box>

      {/* Dialog resetar */}
      <Dialog
        open={dialogResetar}
        onClose={() => setDialogResetar(false)}
        maxWidth="xs"
        fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px', border: `1px solid ${T.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' } } }}
      >
        <DialogTitle sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary, pb: 1 }}>
          Resetar Templates
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond }}>
            Tem certeza que deseja resetar todos os templates para os valores padrão? Esta ação não pode ser desfeita.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={() => setDialogResetar(false)} variant="outlined" sx={{ height: 40, borderRadius: '10px', textTransform: 'none', fontWeight: 600, borderColor: 'rgba(15,30,60,0.18)', color: T.textSecond }}>
            Cancelar
          </Button>
          <Button onClick={handleResetar} variant="contained" sx={{ height: 40, borderRadius: '10px', textTransform: 'none', fontWeight: 700, backgroundColor: '#FFA726', color: '#fff', '&:hover': { backgroundColor: '#F57C00' } }}>
            Resetar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnackbar(s => ({ ...s, open: false }))}
          severity={snackbar.severity}
          sx={{ width: '100%', borderRadius: '10px' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default EmailTemplatesPage;
