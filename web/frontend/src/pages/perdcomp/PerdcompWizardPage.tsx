import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Box, Typography, Stepper, Step, StepLabel, Button, Paper, Stack, Alert,
  TextField, FormControl, InputLabel, Select, MenuItem, CircularProgress,
  Divider, Chip, IconButton, Table, TableBody, TableCell, TableHead, TableRow,
  TableContainer, Dialog, DialogTitle, DialogContent, DialogActions,
  Grid, InputAdornment,
} from '@mui/material';
import {
  ArrowBack, ArrowForward, Save, Send, Add, Delete, CheckCircle,
} from '@mui/icons-material';
import {
  perdcompDocumentosService, TIPOS_DOCUMENTO, TIPOS_CREDITO, GRUPOS_TRIBUTO,
  STATUS_LABELS, type PerdcompDocumento, type CreditoTributario, type DebitoPerdcomp,
  type ResponsavelPreenchimento,
} from '../../services/perdcompDocumentosService';
import { empresasService } from '../../services/empresasService';
import { ecacService } from '../../services/ecacService';

const T = { navy: '#0a1628', cyan: '#00c8f0', cyanHover: '#00b0d8' };

const STEPS = ['Dados Gerais', 'Crédito Tributário', 'Débitos', 'Responsável', 'Revisão'];

const fmt = (v?: number | null) =>
  v != null ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—';

export default function PerdcompWizardPage() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [doc, setDoc] = useState<PerdcompDocumento | null>(null);

  const [empresas, setEmpresas] = useState<any[]>([]);
  const [certificados, setCertificados] = useState<any[]>([]);

  // Form data
  const [gerais, setGerais] = useState({
    id_empresa: '' as any, id_certificado: '' as any,
    tipo_documento: 'DECLARACAO_COMPENSACAO', tipo_credito: 'PAGAMENTO_INDEVIDO_OU_A_MAIOR',
    titularidade: 'PROPRIO_CONTRIBUINTE', observacoes: '',
  });

  const [credito, setCredito] = useState<Partial<CreditoTributario>>({
    cnpj_detentor: '', codigo_receita: '', denominacao_receita: '',
    periodo_apuracao: '', valor_original_inicial: 0, valor_principal: 0,
    selic_acumulada: 0, credito_atualizado: 0,
  });

  const [debitos, setDebitos] = useState<Partial<DebitoPerdcomp>[]>([]);
  const [novoDebitoOpen, setNovoDebitoOpen] = useState(false);
  const [novoDebito, setNovoDebito] = useState<Partial<DebitoPerdcomp>>({
    ordem: 1, grupo_tributo: 'COFINS', tipo_debito: 'PROPRIO_CONTRIBUINTE',
    cnpj_detentor: '', codigo_receita: '', periodo_apuracao: '',
    valor_principal: 0, multa: 0, juros: 0,
  });

  const [responsavel, setResponsavel] = useState<Partial<ResponsavelPreenchimento>>({
    cpf: '', nome: '', telefone_celular: '', email: '',
  });

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, certRes] = await Promise.all([
        empresasService.listar({ limit: 200 }),
        ecacService.certificados.listar(),
      ]);
      setEmpresas(empRes.data || []);
      setCertificados(certRes || []);

      if (isEditing && id) {
        const docData = await perdcompDocumentosService.buscarPorId(Number(id));
        setDoc(docData);
        setGerais({
          id_empresa: docData.id_empresa,
          id_certificado: docData.id_certificado || '',
          tipo_documento: docData.tipo_documento,
          tipo_credito: docData.tipo_credito,
          titularidade: docData.titularidade,
          observacoes: docData.observacoes || '',
        });
        if (docData.credito) setCredito(docData.credito);
        if (docData.debitos) setDebitos(docData.debitos);
        if (docData.responsavel) setResponsavel(docData.responsavel);
      }
    } catch (err: any) {
      setErro('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, [id, isEditing]);

  useEffect(() => { carregar(); }, [carregar]);

  const handleSalvar = async () => {
    setSaving(true);
    setErro('');
    try {
      if (isEditing && id) {
        if (step === 0) await perdcompDocumentosService.atualizar(Number(id), gerais);
        if (step === 1) await perdcompDocumentosService.salvarCredito(Number(id), credito);
        if (step === 3) await perdcompDocumentosService.salvarResponsavel(Number(id), responsavel);
        setSucesso('Salvo com sucesso!');
        setTimeout(() => setSucesso(''), 3000);
      } else {
        if (!gerais.id_empresa) { setErro('Selecione uma empresa'); return; }
        const novo = await perdcompDocumentosService.criar({
          ...(gerais as any), credito, debitos: debitos as any[], responsavel,
        });
        setSucesso('Documento criado com sucesso!');
        navigate(`/fiscal/perdcomp/documentos/${novo.id}/editar`, { replace: true });
      }
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleAdicionarDebito = async () => {
    if (!novoDebito.grupo_tributo || !novoDebito.periodo_apuracao) {
      setErro('Grupo de tributo e período são obrigatórios');
      return;
    }
    const valorTotal = (novoDebito.valor_principal || 0) + (novoDebito.multa || 0) + (novoDebito.juros || 0);

    if (isEditing && id) {
      try {
        const d = await perdcompDocumentosService.criarDebito(Number(id), { ...novoDebito, valor_total: valorTotal });
        setDebitos(prev => [...prev, d]);
        setNovoDebitoOpen(false);
        setNovoDebito({ ordem: debitos.length + 2, grupo_tributo: 'COFINS', tipo_debito: 'PROPRIO_CONTRIBUINTE', cnpj_detentor: '', codigo_receita: '', periodo_apuracao: '', valor_principal: 0, multa: 0, juros: 0 });
      } catch (err: any) {
        setErro(err.response?.data?.error || 'Erro ao adicionar débito');
      }
    } else {
      setDebitos(prev => [...prev, { ...novoDebito, valor_total: valorTotal, ordem: prev.length + 1 } as any]);
      setNovoDebitoOpen(false);
      setNovoDebito({ ordem: debitos.length + 2, grupo_tributo: 'COFINS', tipo_debito: 'PROPRIO_CONTRIBUINTE', cnpj_detentor: '', codigo_receita: '', periodo_apuracao: '', valor_principal: 0, multa: 0, juros: 0 });
    }
  };

  const handleRemoverDebito = async (idx: number, debitoId?: number) => {
    if (isEditing && id && debitoId) {
      await perdcompDocumentosService.excluirDebito(Number(id), debitoId);
    }
    setDebitos(prev => prev.filter((_, i) => i !== idx));
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" p={6}><CircularProgress sx={{ color: T.cyan }} /></Box>;
  }

  const totalDebitos = debitos.reduce((a, d) => a + ((d.valor_principal || 0) + (d.multa || 0) + (d.juros || 0)), 0);
  const statusInfo = doc ? STATUS_LABELS[doc.status] : null;

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box display="flex" alignItems="center" gap={1.5}>
          <IconButton onClick={() => navigate('/fiscal/perdcomp/documentos')} sx={{ color: T.navy }}>
            <ArrowBack />
          </IconButton>
          <Box>
            <Typography variant="h5" fontWeight={700} color={T.navy}>
              {isEditing ? `Editar PER/DCOMP` : 'Novo PER/DCOMP'}
            </Typography>
            {doc?.numero && (
              <Typography variant="body2" color="text.secondary">Nº {doc.numero}</Typography>
            )}
          </Box>
          {statusInfo && (
            <Chip label={statusInfo.label} color={statusInfo.color} size="small" />
          )}
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button
            variant="outlined" startIcon={<Save />} onClick={handleSalvar}
            disabled={saving}
            sx={{ borderColor: T.cyan, color: T.cyan, borderRadius: '10px' }}>
            {saving ? <CircularProgress size={18} /> : 'Salvar'}
          </Button>
          {isEditing && doc && ['RASCUNHO', 'VALIDADO'].includes(doc.status) && (
            <Button
              variant="contained" startIcon={<Send />}
              onClick={() => perdcompDocumentosService.atualizarStatus(Number(id), 'AGUARDANDO_ENVIO').then(() => carregar())}
              sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
              Enviar
            </Button>
          )}
        </Stack>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>{sucesso}</Alert>}

      {/* Stepper */}
      <Paper sx={{ borderRadius: 3, p: 3, mb: 3 }}>
        <Stepper activeStep={step} alternativeLabel>
          {STEPS.map((label, i) => (
            <Step key={label} completed={isEditing && i < step}>
              <StepLabel
                sx={{ cursor: 'pointer', '& .MuiStepLabel-label': { fontSize: '0.8rem' } }}
                onClick={() => isEditing && setStep(i)}>
                {label}
              </StepLabel>
            </Step>
          ))}
        </Stepper>
      </Paper>

      {/* Step 0: Dados Gerais */}
      {step === 0 && (
        <Paper sx={{ borderRadius: 3, p: 3 }}>
          <Typography variant="h6" fontWeight={600} color={T.navy} mb={2}>Dados Gerais</Typography>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Empresa</InputLabel>
                <Select value={gerais.id_empresa} label="Empresa"
                  onChange={e => setGerais(p => ({ ...p, id_empresa: e.target.value }))}>
                  {empresas.map((e: any) => (
                    <MenuItem key={e.id} value={e.id}>{e.razao_social} ({e.cnpj})</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Certificado Digital</InputLabel>
                <Select value={gerais.id_certificado} label="Certificado Digital"
                  onChange={e => setGerais(p => ({ ...p, id_certificado: e.target.value }))}>
                  <MenuItem value="">Nenhum</MenuItem>
                  {certificados
                    .filter((c: any) => !gerais.id_empresa || c.id_empresa === gerais.id_empresa)
                    .map((c: any) => (
                      <MenuItem key={c.id} value={c.id}>
                        {c.cn || c.nome_arquivo} — {c.validade_ate ? `válido até ${new Date(c.validade_ate).toLocaleDateString('pt-BR')}` : ''}
                      </MenuItem>
                    ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Tipo de Documento</InputLabel>
                <Select value={gerais.tipo_documento} label="Tipo de Documento"
                  onChange={e => setGerais(p => ({ ...p, tipo_documento: e.target.value }))}>
                  {TIPOS_DOCUMENTO.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Tipo de Crédito</InputLabel>
                <Select value={gerais.tipo_credito} label="Tipo de Crédito"
                  onChange={e => setGerais(p => ({ ...p, tipo_credito: e.target.value }))}>
                  {TIPOS_CREDITO.map(t => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Titularidade</InputLabel>
                <Select value={gerais.titularidade} label="Titularidade"
                  onChange={e => setGerais(p => ({ ...p, titularidade: e.target.value }))}>
                  <MenuItem value="PROPRIO_CONTRIBUINTE">Próprio Contribuinte</MenuItem>
                  <MenuItem value="EMPRESA_SUCEDIDA">Empresa Sucedida</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField fullWidth multiline rows={3} label="Observações"
                value={gerais.observacoes}
                onChange={e => setGerais(p => ({ ...p, observacoes: e.target.value }))} />
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Step 1: Crédito Tributário */}
      {step === 1 && (
        <Paper sx={{ borderRadius: 3, p: 3 }}>
          <Typography variant="h6" fontWeight={600} color={T.navy} mb={2}>Crédito Tributário</Typography>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="CNPJ Detentor do Crédito" value={credito.cnpj_detentor || ''}
                onChange={e => setCredito(p => ({ ...p, cnpj_detentor: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Código da Receita" value={credito.codigo_receita || ''}
                onChange={e => setCredito(p => ({ ...p, codigo_receita: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth label="Período de Apuração (MM/AAAA)" value={credito.periodo_apuracao || ''}
                onChange={e => setCredito(p => ({ ...p, periodo_apuracao: e.target.value }))}
                placeholder="01/2024" />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField fullWidth label="Denominação da Receita" value={credito.denominacao_receita || ''}
                onChange={e => setCredito(p => ({ ...p, denominacao_receita: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth type="date" label="Data de Arrecadação"
                InputLabelProps={{ shrink: true }}
                value={credito.data_arrecadacao ? String(credito.data_arrecadacao).substring(0, 10) : ''}
                onChange={e => setCredito(p => ({ ...p, data_arrecadacao: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField fullWidth type="date" label="Data de Vencimento"
                InputLabelProps={{ shrink: true }}
                value={credito.data_vencimento ? String(credito.data_vencimento).substring(0, 10) : ''}
                onChange={e => setCredito(p => ({ ...p, data_vencimento: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12 }}><Divider /></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth type="number" label="Valor Original Inicial"
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                value={credito.valor_original_inicial || ''}
                onChange={e => setCredito(p => ({ ...p, valor_original_inicial: Number(e.target.value) }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth type="number" label="Valor Principal"
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                value={credito.valor_principal || ''}
                onChange={e => setCredito(p => ({ ...p, valor_principal: Number(e.target.value) }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth type="number" label="SELIC Acumulada (%)"
                value={credito.selic_acumulada || ''}
                onChange={e => setCredito(p => ({
                  ...p,
                  selic_acumulada: Number(e.target.value),
                  credito_atualizado: (p.valor_principal || 0) * (1 + Number(e.target.value) / 100),
                }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth type="number" label="Crédito Atualizado"
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                value={credito.credito_atualizado || ''}
                onChange={e => setCredito(p => ({ ...p, credito_atualizado: Number(e.target.value) }))} />
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Step 2: Débitos */}
      {step === 2 && (
        <Paper sx={{ borderRadius: 3, p: 3 }}>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Typography variant="h6" fontWeight={600} color={T.navy}>
              Débitos ({debitos.length})
            </Typography>
            <Button variant="outlined" startIcon={<Add />}
              onClick={() => setNovoDebitoOpen(true)}
              sx={{ borderColor: T.cyan, color: T.cyan, borderRadius: '10px' }}>
              Adicionar Débito
            </Button>
          </Box>
          {debitos.length === 0 ? (
            <Box textAlign="center" py={4} color="text.secondary">
              Nenhum débito adicionado. Clique em "Adicionar Débito".
            </Box>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Grupo</TableCell>
                    <TableCell>Código Receita</TableCell>
                    <TableCell>Período</TableCell>
                    <TableCell align="right">Principal</TableCell>
                    <TableCell align="right">Multa</TableCell>
                    <TableCell align="right">Juros</TableCell>
                    <TableCell align="right">Total</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {debitos.map((d, idx) => (
                    <TableRow key={idx}>
                      <TableCell>{d.grupo_tributo}</TableCell>
                      <TableCell>{d.codigo_receita}</TableCell>
                      <TableCell>{d.periodo_apuracao}</TableCell>
                      <TableCell align="right">{fmt(d.valor_principal)}</TableCell>
                      <TableCell align="right">{fmt(d.multa)}</TableCell>
                      <TableCell align="right">{fmt(d.juros)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {fmt((d.valor_principal || 0) + (d.multa || 0) + (d.juros || 0))}
                      </TableCell>
                      <TableCell>
                        <IconButton size="small" onClick={() => handleRemoverDebito(idx, (d as any).id)}
                          sx={{ color: '#ef4444' }}>
                          <Delete fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow>
                    <TableCell colSpan={6} align="right" sx={{ fontWeight: 700 }}>Total:</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 700, color: '#ef4444' }}>{fmt(totalDebitos)}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      )}

      {/* Step 3: Responsável */}
      {step === 3 && (
        <Paper sx={{ borderRadius: 3, p: 3 }}>
          <Typography variant="h6" fontWeight={600} color={T.navy} mb={2}>Responsável pelo Preenchimento</Typography>
          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="CPF" value={responsavel.cpf || ''}
                onChange={e => setResponsavel(p => ({ ...p, cpf: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 8 }}>
              <TextField fullWidth label="Nome Completo" value={responsavel.nome || ''}
                onChange={e => setResponsavel(p => ({ ...p, nome: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Telefone Celular" value={responsavel.telefone_celular || ''}
                onChange={e => setResponsavel(p => ({ ...p, telefone_celular: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Telefone Fixo" value={responsavel.telefone_fixo || ''}
                onChange={e => setResponsavel(p => ({ ...p, telefone_fixo: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="E-mail" type="email" value={responsavel.email || ''}
                onChange={e => setResponsavel(p => ({ ...p, email: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="CRC" value={responsavel.crc || ''}
                onChange={e => setResponsavel(p => ({ ...p, crc: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField fullWidth label="UF CRC" value={responsavel.uf_crc || ''}
                onChange={e => setResponsavel(p => ({ ...p, uf_crc: e.target.value }))}
                inputProps={{ maxLength: 2 }} />
            </Grid>
          </Grid>
        </Paper>
      )}

      {/* Step 4: Revisão */}
      {step === 4 && (
        <Paper sx={{ borderRadius: 3, p: 3 }}>
          <Typography variant="h6" fontWeight={600} color={T.navy} mb={2}>Revisão do Documento</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" color="text.secondary">Empresa</Typography>
              <Typography fontWeight={600}>
                {empresas.find((e: any) => e.id === gerais.id_empresa)?.razao_social || '—'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" color="text.secondary">Tipo de Documento</Typography>
              <Typography fontWeight={600}>
                {TIPOS_DOCUMENTO.find(t => t.value === gerais.tipo_documento)?.label}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" color="text.secondary">Tipo de Crédito</Typography>
              <Typography fontWeight={600}>
                {TIPOS_CREDITO.find(t => t.value === gerais.tipo_credito)?.label}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Typography variant="subtitle2" color="text.secondary">Titularidade</Typography>
              <Typography fontWeight={600}>
                {gerais.titularidade === 'PROPRIO_CONTRIBUINTE' ? 'Próprio Contribuinte' : 'Empresa Sucedida'}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12 }}><Divider /></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary">Valor do Crédito</Typography>
              <Typography fontWeight={700} color="#22c55e" fontSize="1.2rem">
                {fmt(credito.credito_atualizado || credito.valor_principal)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary">Total de Débitos</Typography>
              <Typography fontWeight={700} color="#ef4444" fontSize="1.2rem">{fmt(totalDebitos)}</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary">Saldo</Typography>
              <Typography fontWeight={700} fontSize="1.2rem"
                color={(credito.credito_atualizado || 0) - totalDebitos >= 0 ? '#22c55e' : '#ef4444'}>
                {fmt((credito.credito_atualizado || credito.valor_principal || 0) - totalDebitos)}
              </Typography>
            </Grid>
            <Grid size={{ xs: 12 }}><Divider /></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary">Débitos ({debitos.length})</Typography>
              {debitos.map((d, i) => (
                <Typography key={i} variant="body2">{d.grupo_tributo} — {fmt((d.valor_principal || 0) + (d.multa || 0) + (d.juros || 0))}</Typography>
              ))}
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Typography variant="subtitle2" color="text.secondary">Responsável</Typography>
              <Typography fontWeight={600}>{responsavel.nome || '—'}</Typography>
              <Typography variant="body2" color="text.secondary">{responsavel.cpf}</Typography>
            </Grid>
            {doc && (
              <Grid size={{ xs: 12, md: 4 }}>
                <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                {statusInfo && <Chip label={statusInfo.label} color={statusInfo.color} />}
              </Grid>
            )}
          </Grid>
          {doc && ['RASCUNHO', 'VALIDADO'].includes(doc.status) && (
            <Box mt={3}>
              <Alert severity="info">
                Para enviar ao e-CAC, o documento deve ter um certificado digital configurado e todos os campos preenchidos.
                Clique em "Enviar" para colocar na fila de transmissão.
              </Alert>
            </Box>
          )}
          {doc && doc.status === 'TRANSMITIDO' && (
            <Box mt={3}>
              <Alert severity="success" icon={<CheckCircle />}>
                Documento transmitido com sucesso.
                {doc.protocolo_transmissao && ` Protocolo: ${doc.protocolo_transmissao}`}
              </Alert>
            </Box>
          )}
        </Paper>
      )}

      {/* Navigation */}
      <Box display="flex" justifyContent="space-between" mt={3}>
        <Button startIcon={<ArrowBack />} onClick={() => setStep(s => Math.max(0, s - 1))}
          disabled={step === 0} sx={{ color: T.navy }}>
          Anterior
        </Button>
        {step < STEPS.length - 1 ? (
          <Button variant="contained" endIcon={<ArrowForward />}
            onClick={() => setStep(s => Math.min(STEPS.length - 1, s + 1))}
            sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
            Próximo
          </Button>
        ) : null}
      </Box>

      {/* Dialog Novo Débito */}
      <Dialog open={novoDebitoOpen} onClose={() => setNovoDebitoOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: T.navy }}>Adicionar Débito</DialogTitle>
        <DialogContent>
          <Grid container spacing={2.5} pt={1}>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth required>
                <InputLabel>Grupo de Tributo</InputLabel>
                <Select value={novoDebito.grupo_tributo || ''} label="Grupo de Tributo"
                  onChange={e => setNovoDebito(p => ({ ...p, grupo_tributo: e.target.value }))}>
                  {GRUPOS_TRIBUTO.map(g => <MenuItem key={g} value={g}>{g}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Tipo Débito</InputLabel>
                <Select value={novoDebito.tipo_debito || ''} label="Tipo Débito"
                  onChange={e => setNovoDebito(p => ({ ...p, tipo_debito: e.target.value }))}>
                  <MenuItem value="PROPRIO_CONTRIBUINTE">Próprio Contribuinte</MenuItem>
                  <MenuItem value="EMPRESA_SUCEDIDA">Empresa Sucedida</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="CNPJ Detentor" value={novoDebito.cnpj_detentor || ''}
                onChange={e => setNovoDebito(p => ({ ...p, cnpj_detentor: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Código da Receita" value={novoDebito.codigo_receita || ''}
                onChange={e => setNovoDebito(p => ({ ...p, codigo_receita: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth label="Período (MM/AAAA)" value={novoDebito.periodo_apuracao || ''}
                onChange={e => setNovoDebito(p => ({ ...p, periodo_apuracao: e.target.value }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth type="date" label="Vencimento" InputLabelProps={{ shrink: true }}
                value={novoDebito.data_vencimento ? String(novoDebito.data_vencimento).substring(0, 10) : ''}
                onChange={e => setNovoDebito(p => ({ ...p, data_vencimento: e.target.value as any }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField fullWidth type="number" label="Valor Principal"
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                value={novoDebito.valor_principal || ''}
                onChange={e => setNovoDebito(p => ({ ...p, valor_principal: Number(e.target.value) }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField fullWidth type="number" label="Multa"
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                value={novoDebito.multa || ''}
                onChange={e => setNovoDebito(p => ({ ...p, multa: Number(e.target.value) }))} />
            </Grid>
            <Grid size={{ xs: 12, md: 2 }}>
              <TextField fullWidth type="number" label="Juros"
                InputProps={{ startAdornment: <InputAdornment position="start">R$</InputAdornment> }}
                value={novoDebito.juros || ''}
                onChange={e => setNovoDebito(p => ({ ...p, juros: Number(e.target.value) }))} />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setNovoDebitoOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleAdicionarDebito}
            sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
            Adicionar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
