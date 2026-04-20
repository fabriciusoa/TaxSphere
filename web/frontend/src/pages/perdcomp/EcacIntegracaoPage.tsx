import { useState, useEffect, useCallback, useRef, type ReactElement } from 'react';
import {
  Box, Typography, Paper, Button, TextField, Alert, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Chip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  FormControl, InputLabel, Select, MenuItem, Stack, LinearProgress,
  Card, CardContent, Tooltip,
} from '@mui/material';
import {
  CloudUpload as UploadIcon,
  Sync as SyncIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
  Schedule as ScheduleIcon,
  Security as SecurityIcon,
  CloudDownload as ImportIcon,
  Verified as VerifiedIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import { ecacService, type CertificadoDigital, type SincronizacaoStatus } from '../../services/ecacService';
import { perdcompService } from '../../services/perdcompService';
import { type Empresas } from '../../types/index';
import { logger } from '../../utils/logger';

const T = {
  navy: '#0a1628',
  cyan: '#00c8f0',
  cyanHover: '#00b0d8',
  textSecond: '#64748b',
};

const formatDate = (d: string) => {
  if (!d) return '—';
  try {
    const date = new Date(d);
    return date.toLocaleDateString('pt-BR');
  } catch { return d; }
};

export default function EcacIntegracaoPage() {
  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [certificados, setCertificados] = useState<CertificadoDigital[]>([]);
  const [historico, setHistorico] = useState<SincronizacaoStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadEmpresa, setUploadEmpresa] = useState<number | ''>('');
  const [uploadSenha, setUploadSenha] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadInfo, setUploadInfo] = useState('');

  const [syncOpen, setSyncOpen] = useState(false);
  const [syncEmpresa, setSyncEmpresa] = useState<number | ''>('');
  const [syncSenha, setSyncSenha] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SincronizacaoStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const carregarDados = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, certRes, histRes] = await Promise.all([
        perdcompService.empresas.listar({ limit: 200 }),
        ecacService.certificados.listar(),
        ecacService.sincronizacao.historico(),
      ]);
      setEmpresas(empRes.data);
      setCertificados(certRes);
      setHistorico(histRes);
    } catch (err: any) {
      logger.error('Erro ao carregar dados eCAC', err);
      setErro('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregarDados(); }, [carregarDados]);

  useEffect(() => {
    if (sucesso) { const t = setTimeout(() => setSucesso(''), 5000); return () => clearTimeout(t); }
  }, [sucesso]);

  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pfx') && !file.name.toLowerCase().endsWith('.p12')) {
        setErro('Selecione um arquivo .pfx ou .p12');
        return;
      }
      setUploadFile(file);
      setUploadInfo('');
    }
  };

  const handleValidar = async () => {
    if (!uploadFile || !uploadSenha) return;
    try {
      setUploading(true);
      const result = await ecacService.certificados.validar(uploadFile, uploadSenha);
      if (result.valid && result.info) {
        const info = result.info;
        setUploadInfo(
          `CN: ${info.cn} | Emissor: ${info.emissor} | Validade: ${formatDate(info.validadeDe)} a ${formatDate(info.validadeAte)} | ${info.diasRestantes} dias restantes`
        );
      } else {
        setErro(result.error || 'Certificado inválido');
      }
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao validar certificado');
    } finally {
      setUploading(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadEmpresa || !uploadSenha) return;
    try {
      setUploading(true);
      await ecacService.certificados.upload(uploadFile, uploadEmpresa as number, uploadSenha);
      setSucesso('Certificado digital cadastrado com sucesso');
      setUploadOpen(false);
      setUploadFile(null);
      setUploadSenha('');
      setUploadEmpresa('');
      setUploadInfo('');
      carregarDados();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao cadastrar certificado');
    } finally {
      setUploading(false);
    }
  };

  const handleExcluirCert = async (id: number) => {
    if (!window.confirm('Deseja excluir este certificado?')) return;
    try {
      await ecacService.certificados.excluir(id);
      setSucesso('Certificado excluído');
      carregarDados();
    } catch (err: any) {
      setErro(err.response?.data?.error || 'Erro ao excluir');
    }
  };

  const handleSincronizar = async () => {
    if (!syncEmpresa || !syncSenha) return;
    try {
      setSyncing(true);
      setSyncStatus(null);
      const result = await ecacService.sincronizacao.iniciar(syncEmpresa as number, syncSenha);
      let pollAttempts = 0;
      const MAX_POLL_ATTEMPTS = 120;
      let consecutiveErrors = 0;

      pollRef.current = setInterval(async () => {
        pollAttempts++;

        if (pollAttempts > MAX_POLL_ATTEMPTS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setSyncing(false);
          setErro('Tempo limite de sincronização atingido. Verifique o histórico para o status atual.');
          carregarDados();
          return;
        }

        try {
          const status = await ecacService.sincronizacao.status(result.sync_id);
          setSyncStatus(status);
          consecutiveErrors = 0;
          if (status.status === 'concluido' || status.status === 'erro' || status.status === 'cancelado') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSyncing(false);
            if (status.status === 'concluido') {
              setSucesso(`Sincronização concluída: ${status.creditos_importados} créditos e ${status.debitos_importados} débitos importados`);
            } else if (status.status === 'erro') {
              setErro(`Erro na sincronização: ${status.erro_mensagem}`);
            }
            carregarDados();
          }
        } catch {
          consecutiveErrors++;
          if (consecutiveErrors >= 5) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setSyncing(false);
            setErro('Falha ao verificar status da sincronização. Tente novamente.');
            carregarDados();
          }
        }
      }, 3000);
    } catch (err: any) {
      setSyncing(false);
      setErro(err.response?.data?.error || 'Erro ao iniciar sincronização');
    }
  };

  const certParaEmpresa = (idEmpresa: number) =>
    certificados.find(c => c.id_empresa === idEmpresa && c.ativo);

  const statusChip = (status: string) => {
    const map: Record<string, { color: 'success' | 'warning' | 'error' | 'info' | 'default'; icon: ReactElement }> = {
      concluido: { color: 'success', icon: <CheckIcon fontSize="small" /> },
      em_andamento: { color: 'info', icon: <ScheduleIcon fontSize="small" /> },
      erro: { color: 'error', icon: <ErrorIcon fontSize="small" /> },
      pendente: { color: 'default', icon: <ScheduleIcon fontSize="small" /> },
      cancelado: { color: 'warning', icon: <WarningIcon fontSize="small" /> },
    };
    const s = map[status] || map.pendente;
    return <Chip icon={s.icon} label={status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ')} color={s.color} size="small" />;
  };

  const certStatusChip = (cert: CertificadoDigital) => {
    if (!cert.validade_ate) return <Chip label="Sem info" size="small" />;
    const exp = new Date(cert.validade_ate);
    const now = new Date();
    const dias = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (dias < 0) return <Chip icon={<ErrorIcon fontSize="small" />} label="Expirado" color="error" size="small" />;
    if (dias < 30) return <Chip icon={<WarningIcon fontSize="small" />} label={`${dias}d restantes`} color="warning" size="small" />;
    return <Chip icon={<VerifiedIcon fontSize="small" />} label={`${dias}d restantes`} color="success" size="small" />;
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" p={4}><CircularProgress sx={{ color: T.cyan }} /></Box>;
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>
            Integração eCAC
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Certificados digitais e importação automática de dados da Receita Federal
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5}>
          <Button variant="outlined" startIcon={<UploadIcon />}
            onClick={() => setUploadOpen(true)}
            sx={{ borderColor: T.cyan, color: T.cyan, borderRadius: '10px', '&:hover': { borderColor: T.cyanHover } }}>
            Certificado
          </Button>
          <Button variant="contained" startIcon={<SyncIcon />}
            onClick={() => setSyncOpen(true)}
            disabled={certificados.filter(c => c.ativo).length === 0}
            sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
            Sincronizar eCAC
          </Button>
        </Stack>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>{sucesso}</Alert>}

      {/* KPIs */}
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} mb={3}>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <SecurityIcon sx={{ fontSize: 36, color: T.cyan, mb: 1 }} />
            <Typography variant="h4" fontWeight={700}>{certificados.filter(c => c.ativo).length}</Typography>
            <Typography variant="body2" color="text.secondary">Certificados Ativos</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <ImportIcon sx={{ fontSize: 36, color: '#22c55e', mb: 1 }} />
            <Typography variant="h4" fontWeight={700}>
              {historico.filter(h => h.status === 'concluido').reduce((a, h) => a + h.creditos_importados + h.debitos_importados, 0)}
            </Typography>
            <Typography variant="body2" color="text.secondary">Registros Importados</Typography>
          </CardContent>
        </Card>
        <Card sx={{ flex: 1, borderRadius: 3 }}>
          <CardContent sx={{ textAlign: 'center' }}>
            <CheckIcon sx={{ fontSize: 36, color: '#8b5cf6', mb: 1 }} />
            <Typography variant="h4" fontWeight={700}>
              {historico.filter(h => h.status === 'concluido').length}
            </Typography>
            <Typography variant="body2" color="text.secondary">Sincronizações</Typography>
          </CardContent>
        </Card>
      </Stack>

      {/* Certificados */}
      <Typography variant="h6" fontWeight={600} mb={1.5} color={T.navy}>Certificados Digitais</Typography>
      <TableContainer component={Paper} sx={{ borderRadius: 3, mb: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Empresa</TableCell>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>CN (Titular)</TableCell>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Emissor</TableCell>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Validade</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Status</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {certificados.length === 0 ? (
              <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: T.textSecond }}>
                Nenhum certificado cadastrado. Clique em "Certificado" para adicionar.
              </TableCell></TableRow>
            ) : certificados.map(cert => (
              <TableRow key={cert.id} hover>
                <TableCell>{cert.razao_social || `Empresa #${cert.id_empresa}`}</TableCell>
                <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{cert.cn || '—'}</TableCell>
                <TableCell>{cert.emissor || '—'}</TableCell>
                <TableCell>{formatDate(cert.validade_de)} a {formatDate(cert.validade_ate)}</TableCell>
                <TableCell align="center">{certStatusChip(cert)}</TableCell>
                <TableCell align="center">
                  <Tooltip title="Excluir certificado">
                    <IconButton size="small" onClick={() => handleExcluirCert(cert.id)} sx={{ color: '#ef4444' }}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Histórico */}
      <Typography variant="h6" fontWeight={600} mb={1.5} color={T.navy}>Histórico de Sincronizações</Typography>
      <TableContainer component={Paper} sx={{ borderRadius: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Empresa</TableCell>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Status</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Créditos</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Débitos</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600, color: T.textSecond }}>Ignorados</TableCell>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Início</TableCell>
              <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Fim</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {historico.length === 0 ? (
              <TableRow><TableCell colSpan={8} align="center" sx={{ py: 4, color: T.textSecond }}>
                Nenhuma sincronização realizada ainda.
              </TableCell></TableRow>
            ) : historico.map(s => (
              <TableRow key={s.id} hover>
                <TableCell>{s.razao_social || '—'}</TableCell>
                <TableCell><Chip label={s.tipo} size="small" variant="outlined" /></TableCell>
                <TableCell align="center">{statusChip(s.status)}</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#22c55e' }}>{s.creditos_importados}</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600, color: '#ef4444' }}>{s.debitos_importados}</TableCell>
                <TableCell align="center" sx={{ color: T.textSecond }}>{s.registros_ignorados}</TableCell>
                <TableCell>{formatDate(s.iniciado_em)}</TableCell>
                <TableCell>{s.concluido_em ? formatDate(s.concluido_em) : '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog Upload */}
      <Dialog open={uploadOpen} onClose={() => !uploading && setUploadOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: T.navy }}>Cadastrar Certificado Digital</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} pt={1}>
            <FormControl fullWidth required>
              <InputLabel>Empresa</InputLabel>
              <Select value={uploadEmpresa} label="Empresa"
                onChange={e => setUploadEmpresa(e.target.value as number)}
                sx={{ borderRadius: '10px' }}>
                {empresas.map(emp => (
                  <MenuItem key={emp.id} value={emp.id}>{emp.razao_social} ({emp.cnpj})</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <input ref={fileInputRef} type="file" accept=".pfx,.p12" onChange={handleFileChange} style={{ display: 'none' }} />
              <Button variant="outlined" fullWidth startIcon={<UploadIcon />}
                onClick={() => fileInputRef.current?.click()}
                sx={{ borderRadius: '10px', py: 1.5, borderStyle: 'dashed' }}>
                {uploadFile ? uploadFile.name : 'Selecionar arquivo .pfx ou .p12'}
              </Button>
            </Box>

            <TextField label="Senha do Certificado" type="password"
              value={uploadSenha} onChange={e => setUploadSenha(e.target.value)}
              fullWidth required InputProps={{ sx: { borderRadius: '10px' } }}
              helperText="Senha definida ao exportar o certificado A1" />

            {uploadFile && uploadSenha && (
              <Button variant="text" onClick={handleValidar} disabled={uploading}
                sx={{ color: T.cyan }}>
                {uploading ? <CircularProgress size={20} /> : 'Validar certificado'}
              </Button>
            )}

            {uploadInfo && (
              <Alert severity="info" sx={{ borderRadius: 2, fontSize: '0.8rem' }}>{uploadInfo}</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setUploadOpen(false)} disabled={uploading}>Cancelar</Button>
          <Button variant="contained" onClick={handleUpload}
            disabled={uploading || !uploadFile || !uploadEmpresa || !uploadSenha}
            sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
            {uploading ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : 'Cadastrar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog Sincronizar */}
      <Dialog open={syncOpen} onClose={() => !syncing && setSyncOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 600, color: T.navy }}>Sincronizar com eCAC</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} pt={1}>
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              O sistema acessará o eCAC da Receita Federal usando o certificado digital da empresa selecionada
              para importar automaticamente créditos e débitos.
            </Alert>

            <FormControl fullWidth required>
              <InputLabel>Empresa</InputLabel>
              <Select value={syncEmpresa} label="Empresa"
                onChange={e => setSyncEmpresa(e.target.value as number)}
                sx={{ borderRadius: '10px' }}>
                {empresas.filter(emp => certParaEmpresa(emp.id)).map(emp => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.razao_social} ({emp.cnpj})
                    {certParaEmpresa(emp.id) && <VerifiedIcon sx={{ ml: 1, fontSize: 16, color: '#22c55e' }} />}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField label="Senha do Certificado" type="password"
              value={syncSenha} onChange={e => setSyncSenha(e.target.value)}
              fullWidth required InputProps={{ sx: { borderRadius: '10px' } }}
              helperText="Necessária para descriptografar o certificado durante a autenticação" />

            {syncing && syncStatus && (
              <Box>
                <Box display="flex" justifyContent="space-between" mb={0.5}>
                  <Typography variant="body2" color="text.secondary">
                    {syncStatus.detalhes?.mensagem || 'Processando...'}
                  </Typography>
                  <Typography variant="body2" fontWeight={600}>
                    {syncStatus.detalhes?.progresso || 0}%
                  </Typography>
                </Box>
                <LinearProgress variant="determinate"
                  value={syncStatus.detalhes?.progresso || 0}
                  sx={{ borderRadius: 5, height: 8, bgcolor: '#e2e8f0',
                    '& .MuiLinearProgress-bar': { bgcolor: T.cyan } }} />
              </Box>
            )}

            {syncStatus?.status === 'concluido' && (
              <Alert severity="success" sx={{ borderRadius: 2 }}>
                <strong>Sincronização concluída!</strong><br />
                {syncStatus.creditos_importados} créditos e {syncStatus.debitos_importados} débitos importados.
                {syncStatus.registros_ignorados > 0 && ` ${syncStatus.registros_ignorados} registros já existentes ignorados.`}
              </Alert>
            )}

            {syncStatus?.status === 'erro' && (
              <Alert severity="error" sx={{ borderRadius: 2 }}>
                {syncStatus.erro_mensagem}
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => { setSyncOpen(false); setSyncStatus(null); setSyncSenha(''); }}
            disabled={syncing}>
            {syncStatus?.status === 'concluido' || syncStatus?.status === 'erro' ? 'Fechar' : 'Cancelar'}
          </Button>
          {(!syncStatus || syncStatus.status === 'erro') && (
            <Button variant="contained" onClick={handleSincronizar}
              disabled={syncing || !syncEmpresa || !syncSenha}
              startIcon={syncing ? <CircularProgress size={18} sx={{ color: '#fff' }} /> : <SyncIcon />}
              sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, borderRadius: '10px' }}>
              {syncing ? 'Sincronizando...' : 'Iniciar Sincronização'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
