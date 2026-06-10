import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Stack, LinearProgress,
  Card, CardContent, Tooltip, Badge,
} from '@mui/material';
import {
  Security as SecurityIcon,
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Delete as DeleteIcon,
  Sync as ValidarIcon,
  Key as KeyIcon,
  Lock as LockIcon,
  Add as AddIcon,
  CloudUpload as UploadIcon,
  Verified as VerifiedIcon,
  LogoutOutlined as LogoutIcon,
  Schedule as SessionIcon,
} from '@mui/icons-material';
import { ecacService, type CertificadoDigital, type CertStatusType } from '../services/ecacService';
import { empresasService } from '../services/empresasService';
import { type Empresas } from '../types/index';
import { logger } from '../utils/logger';

// ── Design tokens ──────────────────────────────────────────────────────────────
const T = {
  navy: '#0a1628',
  cyan: '#00c8f0',
  cyanHover: '#00b0d8',
  textSecond: '#64748b',
  border: 'rgba(15,30,60,0.10)',
  bg: '#f4f7fa',
};

const formatDate = (d: string | null) => {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d; }
};

const fromNow = (d: string | null): string => {
  if (!d) return '—';
  const ms = Date.now() - new Date(d).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  return `há ${Math.floor(hrs / 24)}d`;
};

const diasParaExpirar = (validoAte: string | null): number => {
  if (!validoAte) return 0;
  return Math.ceil((new Date(validoAte).getTime() - Date.now()) / 86400000);
};

// ── Status chip ────────────────────────────────────────────────────────────────
const statusConfig: Record<CertStatusType, { color: 'success' | 'warning' | 'error' | 'default'; label: string }> = {
  ATIVO:     { color: 'success', label: 'Ativo' },
  EXPIRANDO: { color: 'warning', label: 'Expirando' },
  EXPIRADO:  { color: 'error',   label: 'Expirado' },
  REVOGADO:  { color: 'default', label: 'Revogado' },
};

function StatusChip({ status }: { status: CertStatusType }) {
  const cfg = statusConfig[status] || statusConfig.ATIVO;
  const icon = status === 'ATIVO'
    ? <CheckCircleIcon sx={{ fontSize: 14 }} />
    : status === 'EXPIRANDO'
      ? <WarningIcon sx={{ fontSize: 14 }} />
      : <ErrorIcon sx={{ fontSize: 14 }} />;
  return <Chip icon={icon} label={cfg.label} color={cfg.color} size="small" />;
}

// ── Vida útil (barra de progresso) ────────────────────────────────────────────
function VidaUtil({ cert }: { cert: CertificadoDigital }) {
  const criadoEm = new Date(cert.criado_em).getTime();
  const expira = cert.validade_ate ? new Date(cert.validade_ate).getTime() : criadoEm;
  const totalDias = Math.max(1, Math.ceil((expira - criadoEm) / 86400000));
  const diasRestantes = Math.max(0, diasParaExpirar(cert.validade_ate));
  const pct = Math.round((diasRestantes / totalDias) * 100);
  const cor = pct <= 10 ? 'error' : pct <= 25 ? 'warning' : 'primary';

  return (
    <Box sx={{ minWidth: 140 }}>
      <LinearProgress variant="determinate" value={Math.min(pct, 100)} color={cor}
        sx={{ height: 6, borderRadius: 3, mb: 0.5 }} />
      <Typography variant="caption" color="text.secondary">{diasRestantes} dia(s) restante(s)</Typography>
    </Box>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export default function CertificadosPage() {
  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [certificados, setCertificados] = useState<CertificadoDigital[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  // Upload modal
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEmpresa, setUploadEmpresa] = useState<number | ''>('');
  const [uploadNome, setUploadNome] = useState('');
  const [uploadSenha, setUploadSenha] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Senha modal
  const [senhaOpen, setSenhaOpen] = useState(false);
  const [senhaCertId, setSenhaCertId] = useState<number | null>(null);
  const [novaSenha, setNovaSenha] = useState('');
  const [savingSenha, setSavingSenha] = useState(false);

  // Autenticar modal
  const [autenticarOpen, setAutenticarOpen] = useState(false);
  const [autenticarCertId, setAutenticarCertId] = useState<number | null>(null);
  const [autenticando, setAutenticando] = useState(false);
  const [autenticarResult, setAutenticarResult] = useState<string>('');
  const [autenticarStatus, setAutenticarStatus] = useState<'idle' | 'aguardando' | 'sucesso' | 'erro'>('idle');
  // Plataforma do servidor: 'win32' usa Edge+Windows Store (2 passos); Mac/Linux
  // usa Playwright clientCertificates (1 passo, captura automática). Default true
  // mantém o fluxo legado até o /health responder.
  const [serverIsWindows, setServerIsWindows] = useState(true);
  const pollRef = useRef<number | null>(null);
  // Cooldown anti-WAF: timestamp em ms até quando o usuário precisa esperar.
  // null quando não há cooldown ativo. Re-render com setInterval enquanto contagem > 0.
  const [cooldownEnd, setCooldownEnd] = useState<number | null>(null);
  const [, setTickNow] = useState<number>(Date.now());
  useEffect(() => {
    if (!cooldownEnd) return;
    const id = setInterval(() => setTickNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownEnd]);
  const cooldownRestante = cooldownEnd ? Math.max(0, Math.ceil((cooldownEnd - Date.now()) / 1000)) : 0;

  // Validando (por linha)
  const [validandoId, setValidandoId] = useState<number | null>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, certRes] = await Promise.all([
        empresasService.listar({ limit: 200 }),
        ecacService.certificados.listar(),
      ]);
      setEmpresas(empRes.data);
      setCertificados(certRes);
    } catch (err: any) {
      logger.error('Erro ao carregar certificados', err);
      setErro('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);
  useEffect(() => {
    if (sucesso) { const t = setTimeout(() => setSucesso(''), 5000); return () => clearTimeout(t); }
  }, [sucesso]);
  // Descobre o SO do servidor (onde o RPA roda) para escolher o fluxo de autenticação.
  useEffect(() => {
    ecacService.getServerPlatform().then((p) => setServerIsWindows(p === 'win32')).catch(() => {});
  }, []);
  // Para o polling de sessão ao desmontar a página.
  useEffect(() => () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } }, []);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.match(/\.(pfx|p12)$/i)) { setErro('Selecione um arquivo .pfx ou .p12'); return; }
    setUploadFile(file);
    if (!uploadNome) setUploadNome(file.name.replace(/\.(pfx|p12)$/i, ''));
    setUploadPreview('');
  };

  const handleValidarArquivo = async () => {
    if (!uploadFile || !uploadSenha) return;
    setUploading(true);
    try {
      const result = await ecacService.certificados.validarArquivo(uploadFile, uploadSenha);
      if (result.valid && result.info) {
        const i = result.info;
        setUploadPreview(`CN: ${i.cn} · Emissor: ${i.emissor} · Válido até ${formatDate(i.validadeAte)} (${i.diasRestantes}d)`);
      } else {
        setErro(result.error || 'Certificado inválido ou senha incorreta');
      }
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao validar certificado');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadEmpresa || !uploadSenha) return;
    setUploading(true);
    try {
      await ecacService.certificados.upload(uploadFile, uploadEmpresa as number, uploadSenha, uploadNome);
      setSucesso('Certificado adicionado ao repositório com sucesso!');
      setUploadOpen(false);
      setUploadFile(null); setUploadNome(''); setUploadSenha(''); setUploadEmpresa(''); setUploadPreview('');
      carregarDados();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao cadastrar certificado');
    } finally {
      setUploading(false);
    }
  };

  const handleValidar = async (cert: CertificadoDigital) => {
    setValidandoId(cert.id);
    try {
      const result = await ecacService.certificados.validar(cert.id);
      setSucesso(`Certificado validado — ${result.diasRestantes} dia(s) restantes · Status: ${result.status}`);
      carregarDados();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao validar certificado');
    } finally {
      setValidandoId(null);
    }
  };

  // ── Mac/Linux: fluxo Playwright de 1 passo ──────────────────────────────────
  // O backend abre um browser visível, aguarda o login (até 5 min) e captura a
  // sessão automaticamente. O frontend só verifica a sessão periodicamente.
  const pararPoll = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  };
  const iniciarPollSessao = (id: number) => {
    pararPoll();
    const deadline = Date.now() + 6 * 60 * 1000; // login tem 5 min; damos folga
    pollRef.current = window.setInterval(async () => {
      try {
        const st = await ecacService.certificados.statusSessao(id);
        if (st.sessao_ativa) {
          pararPoll();
          setAutenticarStatus('sucesso');
          setAutenticarResult('Sessão e-CAC capturada com sucesso. O RPA pode sincronizar documentos sem precisar repetir o login.');
          carregarDados();
        } else if (Date.now() > deadline) {
          pararPoll();
          setAutenticarStatus('erro');
          setAutenticarResult('Tempo esgotado aguardando o login. Tente novamente e conclua o login no navegador que abriu.');
        }
      } catch { /* mantém o polling — falhas transitórias são esperadas */ }
    }, 4000);
  };

  const handleAutenticarPlaywright = async () => {
    if (!autenticarCertId) return;
    setAutenticando(true);
    try {
      await ecacService.certificados.autenticar(autenticarCertId);
      setAutenticarStatus('aguardando');
      iniciarPollSessao(autenticarCertId);
    } catch (err: any) {
      setAutenticarStatus('erro');
      setAutenticarResult(err.response?.data?.error || 'Erro ao iniciar autenticação no e-CAC');
    } finally {
      setAutenticando(false);
    }
  };

  const handleAbrirEcacNoEdge = async () => {
    if (!autenticarCertId) return;
    setAutenticando(true);
    try {
      const result = await ecacService.certificados.instalarCertificado(autenticarCertId);
      // Edge is opened server-side with an isolated profile to avoid TLS cache issues.
      // Only fall back to window.open if the server couldn't open it.
      if (!result.edgeAberto) {
        window.open(result.loginUrl, '_blank', 'noopener');
      }
      setAutenticarStatus('aguardando');
    } catch (err: any) {
      setAutenticarStatus('erro');
      // O backend devolve 429 com `aguardar_segundos` quando duas auths são feitas
      // muito juntas — armazenamos só a parte fixa da mensagem; o contador é
      // calculado no render via cooldownRestante.
      const data = err.response?.data;
      if (data?.aguardar_segundos) {
        setCooldownEnd(Date.now() + Number(data.aguardar_segundos) * 1000);
        setAutenticarResult(
          'O e-CAC bloqueia autenticações em sequência rápida (BOT detection).\n\n' +
          'Motivo: o WAF da Receita (página "BOT support ID") bloqueia autenticações em sequência.'
        );
      } else {
        setCooldownEnd(null);
        setAutenticarResult(data?.error || 'Erro ao instalar certificado no Windows Store');
      }
    } finally {
      setAutenticando(false);
    }
  };

  const handleCapturarSessaoEdge = async () => {
    if (!autenticarCertId) return;
    setAutenticando(true);
    try {
      const result = await ecacService.certificados.capturarSessaoEdge(autenticarCertId);
      setAutenticarStatus('sucesso');
      setAutenticarResult(`Sessão e-CAC capturada com sucesso (${result.cookiesCount} cookies). O RPA pode sincronizar documentos sem precisar repetir o login.`);
      carregarDados();
    } catch (err: any) {
      const msg = err.response?.data?.error || '';
      setAutenticarStatus('erro');
      // Detecção da página BOT do WAF — reporta ao backend para escalar backoff
      // e mostra ao usuário o novo tempo de espera vindo do servidor.
      const wafDetectado = /BOT support|requested URL was rejected|consult.*administrator/i.test(msg);
      if (wafDetectado) {
        try {
          const r = await ecacService.certificados.reportarWafBlock(msg.slice(0, 200));
          setCooldownEnd(Date.now() + r.aguardar_segundos * 1000);
          setAutenticarResult(
            `WAF da Receita bloqueou a captura (BOT detection) — backoff agora em ${r.backoff_multiplier}×.\n\n` +
            `${msg}\n\nO sistema vai esperar mais tempo antes da próxima tentativa para que a reputação do nosso IP/fingerprint normalize.`
          );
        } catch {
          setAutenticarResult(msg || 'WAF da Receita bloqueou a captura.');
        }
      } else {
        setAutenticarResult(msg || 'Falha ao capturar sessão. Verifique se o login foi concluído no Edge.');
      }
    } finally {
      setAutenticando(false);
    }
  };


  const handleAtualizarSenha = async () => {
    if (!senhaCertId || !novaSenha) return;
    setSavingSenha(true);
    try {
      await ecacService.certificados.atualizarSenha(senhaCertId, novaSenha);
      setSucesso('Senha atualizada. Certificado habilitado para o RPA.');
      setSenhaOpen(false); setNovaSenha(''); setSenhaCertId(null);
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao atualizar senha');
    } finally {
      setSavingSenha(false);
    }
  };

  const handleLimparSessao = async (id: number) => {
    if (!window.confirm('Limpar sessão e-CAC? O sistema fará nova autenticação na próxima execução.')) return;
    try {
      await ecacService.certificados.limparSessao(id);
      setSucesso('Sessão removida. RPA fará nova autenticação.');
      carregarDados();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao limpar sessão');
    }
  };

  const handleExcluir = async (id: number) => {
    if (!window.confirm('Remover este certificado do repositório?')) return;
    try {
      await ecacService.certificados.excluir(id);
      setSucesso('Certificado removido');
      carregarDados();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao excluir');
    }
  };

  const abrirUploadModal = () => {
    setUploadFile(null); setUploadNome(''); setUploadSenha(''); setUploadEmpresa(''); setUploadPreview('');
    setUploadOpen(true);
  };

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const total = certificados.length;
  const ativos = certificados.filter(c => c.status === 'ATIVO').length;
  const expirando = certificados.filter(c => c.status === 'EXPIRANDO').length;
  const comSessao = certificados.filter(c => c.sessao_ativa).length;

  if (loading) {
    return <Box display="flex" justifyContent="center" p={6}><CircularProgress sx={{ color: T.cyan }} /></Box>;
  }

  return (
    <Box>
      {/* Cabeçalho */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>
            <SecurityIcon sx={{ mr: 1, fontSize: 32, verticalAlign: 'middle', color: T.cyan }} />
            Repositório de Certificados
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Certificados digitais A1 (e-CNPJ / e-CPF) para uso no e-CAC e módulo RPA
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={abrirUploadModal}
          sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
          Adicionar Certificado
        </Button>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2, borderRadius: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2, borderRadius: 2 }}>{sucesso}</Alert>}

      {/* KPIs */}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} mb={3}>
        {[
          { label: 'Total', value: total, icon: <SecurityIcon />, color: T.cyan },
          { label: 'Ativos', value: ativos, icon: <CheckCircleIcon />, color: '#22c55e' },
          { label: 'Expirando', value: expirando, icon: <WarningIcon />, color: '#f59e0b' },
          { label: 'Sessões e-CAC', value: comSessao, icon: <KeyIcon />, color: '#8b5cf6' },
        ].map(kpi => (
          <Card key={kpi.label} sx={{ flex: 1, borderRadius: 3, borderTop: `3px solid ${kpi.color}` }}>
            <CardContent sx={{ textAlign: 'center', py: 2 }}>
              <Box sx={{ color: kpi.color, mb: 0.5 }}>{kpi.icon}</Box>
              <Typography variant="h4" fontWeight={700} sx={{ color: kpi.color }}>{kpi.value}</Typography>
              <Typography variant="body2" color="text.secondary">{kpi.label}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      {/* Tabela */}
      <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: '0 1px 8px rgba(0,0,0,0.06)' }}>
        <Table sx={{ minWidth: 1100 }}>
          <TableHead>
            <TableRow sx={{ '& th': { fontWeight: 600, color: T.textSecond, fontSize: '0.8125rem', py: 1.5 } }}>
              <TableCell>Empresa / CNPJ</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Emitido para (CN)</TableCell>
              <TableCell>Validade</TableCell>
              <TableCell>Vida útil</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">Sessão e-CAC</TableCell>
              <TableCell>Último uso</TableCell>
              <TableCell align="center">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {certificados.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 6, color: T.textSecond }}>
                  <SecurityIcon sx={{ fontSize: 40, opacity: 0.3, display: 'block', mx: 'auto', mb: 1 }} />
                  Nenhum certificado no repositório. Clique em "Adicionar Certificado" para começar.
                </TableCell>
              </TableRow>
            ) : certificados.map(cert => (
              <TableRow key={cert.id} hover>
                {/* Empresa */}
                <TableCell>
                  <Typography variant="body2" fontWeight={500} noWrap sx={{ maxWidth: 200 }}>
                    {cert.razao_social || `Empresa #${cert.id_empresa}`}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace' }}>
                    {cert.cnpj || '—'}
                  </Typography>
                </TableCell>

                {/* Nome */}
                <TableCell>
                  <Box display="flex" alignItems="center" gap={0.75}>
                    <SecurityIcon sx={{ fontSize: 16, color: T.cyan, flexShrink: 0 }} />
                    <Typography variant="body2" noWrap sx={{ maxWidth: 180 }}>{cert.nome}</Typography>
                  </Box>
                </TableCell>

                {/* CN */}
                <TableCell>
                  <Tooltip title={cert.emitido_para || cert.cn || '—'}>
                    <Typography variant="body2" noWrap sx={{ maxWidth: 180, fontFamily: 'monospace', fontSize: '0.8rem' }}>
                      {cert.emitido_para || cert.cn || '—'}
                    </Typography>
                  </Tooltip>
                </TableCell>

                {/* Validade */}
                <TableCell>
                  <Typography variant="body2" noWrap>
                    {formatDate(cert.validade_ate)}
                  </Typography>
                  {(() => {
                    const dias = diasParaExpirar(cert.validade_ate);
                    if (dias <= 0) return <Chip label="Expirado" color="error" size="small" sx={{ mt: 0.5 }} />;
                    if (dias <= 30) return <Chip label={`${dias}d restantes`} color="warning" size="small" sx={{ mt: 0.5 }} />;
                    return null;
                  })()}
                </TableCell>

                {/* Vida útil */}
                <TableCell><VidaUtil cert={cert} /></TableCell>

                {/* Status */}
                <TableCell align="center">
                  <StatusChip status={cert.status} />
                </TableCell>

                {/* Sessão e-CAC */}
                <TableCell align="center">
                  {cert.sessao_ativa ? (
                    <Badge color="success" variant="dot">
                      <Typography variant="caption" sx={{ color: '#22c55e', fontWeight: 600 }}>Ativa</Typography>
                    </Badge>
                  ) : (
                    <Typography variant="caption" color="text.secondary">Inativa</Typography>
                  )}
                </TableCell>

                {/* Último uso */}
                <TableCell>
                  <Tooltip title={cert.ultimo_uso ? formatDate(cert.ultimo_uso) : ''}>
                    <Typography variant="body2" color="text.secondary">
                      {cert.ultimo_uso ? fromNow(cert.ultimo_uso) : '—'}
                    </Typography>
                  </Tooltip>
                </TableCell>

                {/* Ações */}
                <TableCell align="center">
                  <Stack direction="row" spacing={0.5} justifyContent="center">
                    <Tooltip title="Verificar validade">
                      <IconButton size="small" onClick={() => handleValidar(cert)}
                        disabled={validandoId === cert.id}
                        sx={{ color: T.cyan }}>
                        {validandoId === cert.id
                          ? <CircularProgress size={16} />
                          : <ValidarIcon fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Autenticar no e-CAC (Gov.BR)">
                      <IconButton size="small"
                        onClick={() => { setAutenticarCertId(cert.id); setAutenticarResult(''); setAutenticarOpen(true); }}
                        sx={{ color: '#22c55e' }}>
                        <VerifiedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Configurar senha para RPA">
                      <IconButton size="small"
                        onClick={() => { setSenhaCertId(cert.id); setNovaSenha(''); setSenhaOpen(true); }}
                        sx={{ color: '#f59e0b' }}>
                        <LockIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Limpar sessão e-CAC">
                      <IconButton size="small" onClick={() => handleLimparSessao(cert.id)}
                        sx={{ color: '#8b5cf6' }}>
                        <LogoutIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Remover certificado">
                      <IconButton size="small" onClick={() => handleExcluir(cert.id)}
                        sx={{ color: '#ef4444' }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* ── Modal: Upload ─────────────────────────────────────────────────────── */}
      <Dialog open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} maxWidth="sm" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, color: T.navy, pb: 1 }}>
          <SecurityIcon sx={{ mr: 1, color: T.cyan, verticalAlign: 'middle' }} />
          Adicionar Certificado ao Repositório
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5} pt={1}>
            {/* Empresa */}
            <FormControl fullWidth required>
              <InputLabel>Empresa</InputLabel>
              <Select value={uploadEmpresa} label="Empresa"
                onChange={e => setUploadEmpresa(e.target.value as number)}
                sx={{ borderRadius: '10px' }}>
                {empresas.map(emp => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.cnpj} — {emp.razao_social}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Nome customizado */}
            <TextField label="Nome do Certificado" placeholder="Ex: e-CNPJ EMPRESA 2026"
              value={uploadNome} onChange={e => setUploadNome(e.target.value)}
              fullWidth required InputProps={{ sx: { borderRadius: '10px' } }}
              helperText="Nome de identificação no repositório" />

            {/* Senha */}
            <TextField label="Senha do Certificado (.pfx)" type="password"
              value={uploadSenha} onChange={e => setUploadSenha(e.target.value)}
              fullWidth required InputProps={{ sx: { borderRadius: '10px' } }}
              helperText="Será armazenada de forma cifrada (AES-256) para uso pelo RPA" />

            {/* Arquivo */}
            <Box>
              <input ref={fileInputRef} type="file" accept=".pfx,.p12" onChange={handleFileChange} style={{ display: 'none' }} />
              <Button variant="outlined" fullWidth startIcon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{
                  borderRadius: '10px', py: 2.5, borderStyle: 'dashed',
                  borderColor: uploadFile ? T.cyan : 'rgba(0,0,0,0.23)',
                  color: uploadFile ? T.cyan : 'text.secondary',
                  flexDirection: 'column', gap: 0.5,
                }}>
                <SecurityIcon sx={{ fontSize: 32, opacity: 0.7 }} />
                <span style={{ fontWeight: 500 }}>
                  {uploadFile ? uploadFile.name : 'Clique ou selecione o arquivo .pfx / .p12'}
                </span>
                <Typography variant="caption" color="text.secondary">Máx. 10 MB</Typography>
              </Button>
            </Box>

            {/* Botão validar */}
            {uploadFile && uploadSenha && !uploadPreview && (
              <Button variant="text" onClick={handleValidarArquivo} disabled={uploading}
                sx={{ color: T.cyan, alignSelf: 'flex-start' }}>
                {uploading ? <CircularProgress size={18} /> : 'Verificar certificado antes de cadastrar'}
              </Button>
            )}

            {uploadPreview && (
              <Alert severity="info" sx={{ borderRadius: 2, fontSize: '0.8rem' }}>{uploadPreview}</Alert>
            )}

            <Alert severity="info" sx={{ borderRadius: 2 }} icon={<LockIcon />}>
              A senha é cifrada com AES-256 e usada automaticamente pelo RPA para autenticar no e-CAC.
            </Alert>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
          <Button variant="contained" onClick={handleUpload}
            disabled={uploading || !uploadFile || !uploadEmpresa || !uploadSenha || !uploadNome}
            sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
            {uploading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Adicionar ao Repositório'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Modal: Autenticar e-CAC ───────────────────────────────────────────── */}
      <Dialog
        open={autenticarOpen}
        onClose={() => {
          if (!autenticando) {
            pararPoll();
            setAutenticarOpen(false);
            setAutenticarResult('');
            setAutenticarStatus('idle');
          }
        }}
        maxWidth="sm" fullWidth PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, color: T.navy }}>
          <KeyIcon sx={{ mr: 1, color: '#22c55e', verticalAlign: 'middle' }} />
          Autenticar no e-CAC (Gov.BR)
        </DialogTitle>
        <DialogContent dividers>
          {autenticarStatus === 'sucesso' ? (
            <Box textAlign="center" py={3}>
              <CheckCircleIcon sx={{ fontSize: 56, color: '#22c55e' }} />
              <Typography variant="h6" mt={2} fontWeight={600} color="#22c55e">Sessão capturada!</Typography>
              <Typography color="text.secondary" mt={1}>{autenticarResult}</Typography>
            </Box>
          ) : autenticarStatus === 'erro' ? (
            <Stack spacing={2}>
              <Alert severity="error" sx={{ borderRadius: 2, whiteSpace: 'pre-line' }}>
                {cooldownRestante > 0 && (
                  <Typography component="div" fontWeight={600} sx={{ mb: 1 }}>
                    Aguarde <Box component="span" sx={{ fontVariantNumeric: 'tabular-nums', display: 'inline-block', minWidth: 28, textAlign: 'right' }}>{cooldownRestante}</Box>s antes de autenticar outra empresa.
                  </Typography>
                )}
                {autenticarResult}
              </Alert>
              <Button
                variant="outlined"
                onClick={() => { setCooldownEnd(null); setAutenticarStatus('aguardando'); }}
                disabled={cooldownRestante > 0}
                sx={{ alignSelf: 'flex-start' }}
              >
                {cooldownRestante > 0 ? `Tentar novamente em ${cooldownRestante}s` : 'Tentar novamente'}
              </Button>
            </Stack>
          ) : autenticarStatus === 'aguardando' ? (
            serverIsWindows ? (
            <Stack spacing={2}>
              <Alert severity="success" icon={<CheckCircleIcon />} sx={{ borderRadius: 2 }}>
                Certificado instalado. Uma janela do Edge foi aberta em perfil isolado.
              </Alert>
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
                  <li>Na janela do Edge que abriu, clique em <strong>"Usar Certificado Digital"</strong>.</li>
                  <li>O navegador pedirá para selecionar o certificado — escolha o seu.</li>
                  <li>Aguarde carregar o portal do e-CAC (página verde).</li>
                  <li>Volte aqui e clique em <strong>"Sessão concluída — capturar"</strong>.</li>
                </ol>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  Ao capturar, a janela do Edge será fechada automaticamente para liberar os cookies do disco.
                </Typography>
              </Alert>
              {autenticando && (
                <Box display="flex" alignItems="center" gap={1}>
                  <CircularProgress size={20} sx={{ color: T.cyan }} />
                  <Typography variant="body2" color="text.secondary">Capturando cookies do Edge...</Typography>
                </Box>
              )}
            </Stack>
            ) : (
            <Stack spacing={2}>
              <Alert severity="success" icon={<CheckCircleIcon />} sx={{ borderRadius: 2 }}>
                Uma janela do navegador foi aberta já com o seu certificado digital.
              </Alert>
              <Alert severity="info" sx={{ borderRadius: 2 }}>
                <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 2 }}>
                  <li>Na janela que abriu, clique em <strong>"Gov.BR → Seu certificado digital"</strong>.</li>
                  <li>Selecione o certificado quando o navegador solicitar.</li>
                  <li>Aguarde carregar o portal do e-CAC (página verde).</li>
                </ol>
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                  A sessão é capturada automaticamente assim que o login conclui — não precisa voltar aqui. Esta janela atualiza sozinha.
                </Typography>
              </Alert>
              <Box display="flex" alignItems="center" gap={1}>
                <CircularProgress size={20} sx={{ color: T.cyan }} />
                <Typography variant="body2" color="text.secondary">Aguardando login e capturando a sessão automaticamente…</Typography>
              </Box>
            </Stack>
            )
          ) : (
            <Stack spacing={2}>
              <Alert severity="info" icon={<SessionIcon />} sx={{ borderRadius: 2 }}>
                {serverIsWindows ? (
                  <>
                    <strong>Como funciona (sem bot detector):</strong>
                    <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
                      <li>Clique em <strong>"Abrir e-CAC neste browser"</strong> — instala o certificado e abre o Edge em perfil isolado.</li>
                      <li>Faça login: <strong>Gov.BR → Usar Certificado Digital</strong> → selecione o certificado.</li>
                      <li>Volte aqui e clique em <strong>"Sessão concluída — capturar"</strong>.</li>
                      <li>O servidor lê os cookies do Edge e salva a sessão.</li>
                    </ol>
                  </>
                ) : (
                  <>
                    <strong>Como funciona:</strong>
                    <ol style={{ margin: '8px 0 0', paddingLeft: 20, lineHeight: 1.9 }}>
                      <li>Clique em <strong>"Abrir e-CAC neste navegador"</strong> — abre uma janela já com o seu certificado digital carregado.</li>
                      <li>Faça login: <strong>Gov.BR → Seu certificado digital</strong> → selecione o certificado.</li>
                      <li>Pronto: a sessão é capturada <strong>automaticamente</strong> ao concluir o login.</li>
                    </ol>
                  </>
                )}
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
          <Button
            onClick={() => {
              pararPoll();
              setAutenticarOpen(false);
              setAutenticarResult('');
              setAutenticarStatus('idle');
            }}
            disabled={autenticando}>
            {autenticarStatus === 'sucesso' || autenticarStatus === 'erro' ? 'Fechar' : 'Cancelar'}
          </Button>
          {autenticarStatus === 'idle' && (
            <Button variant="outlined" onClick={serverIsWindows ? handleAbrirEcacNoEdge : handleAutenticarPlaywright} disabled={autenticando}
              startIcon={autenticando ? <CircularProgress size={16} /> : <VerifiedIcon />}
              sx={{ borderRadius: '10px' }}>
              {autenticando
                ? (serverIsWindows ? 'Instalando certificado...' : 'Abrindo navegador...')
                : (serverIsWindows ? 'Abrir e-CAC neste browser' : 'Abrir e-CAC neste navegador')}
            </Button>
          )}
          {autenticarStatus === 'aguardando' && serverIsWindows && (
            <>
              <Button variant="outlined" onClick={handleAbrirEcacNoEdge} sx={{ borderRadius: '10px' }}>
                Reabrir e-CAC
              </Button>
              <Button variant="contained" onClick={handleCapturarSessaoEdge} disabled={autenticando}
                startIcon={autenticando ? <CircularProgress size={16} sx={{ color: '#fff' }} /> : <KeyIcon />}
                sx={{ bgcolor: '#22c55e', '&:hover': { bgcolor: '#16a34a' }, borderRadius: '10px' }}>
                Sessão concluída — capturar
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>

      {/* ── Modal: Configurar Senha para RPA ─────────────────────────────────── */}
      <Dialog open={senhaOpen} onClose={() => !savingSenha && setSenhaOpen(false)} maxWidth="xs" fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}>
        <DialogTitle sx={{ fontWeight: 700, color: T.navy }}>
          <LockIcon sx={{ mr: 1, color: '#f59e0b', verticalAlign: 'middle' }} />
          Configurar Senha para RPA
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <Alert severity="info" sx={{ borderRadius: 2, fontSize: '0.85rem' }}>
              A senha será armazenada de forma cifrada (AES-256) e usada <strong>exclusivamente</strong> pelo módulo de automação RPA ao acessar o e-CAC.
            </Alert>
            <TextField label="Senha do Certificado" type="password"
              value={novaSenha} onChange={e => setNovaSenha(e.target.value)}
              fullWidth required InputProps={{ sx: { borderRadius: '10px' } }}
              onKeyDown={e => e.key === 'Enter' && handleAtualizarSenha()} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setSenhaOpen(false)} disabled={savingSenha}>Cancelar</Button>
          <Button variant="contained" onClick={handleAtualizarSenha}
            disabled={savingSenha || !novaSenha}
            sx={{ bgcolor: '#f59e0b', '&:hover': { bgcolor: '#d97706' }, borderRadius: '10px' }}>
            {savingSenha ? <CircularProgress size={20} sx={{ color: '#fff' }} /> : 'Salvar Senha'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
