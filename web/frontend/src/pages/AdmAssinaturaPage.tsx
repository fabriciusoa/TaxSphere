import { useState, useEffect } from 'react';
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, IconButton, Chip, TextField, InputAdornment, Button, Stack, Tooltip,
  Alert, CircularProgress, Dialog, DialogTitle, DialogContent, DialogActions,
  MenuItem, Divider,
} from '@mui/material';
import {
  Edit as EditIcon, Delete as DeleteIcon, Search as SearchIcon,
  Add as AddIcon, Visibility as VisibilityIcon, Close as CloseIcon,
} from '@mui/icons-material';
import admAssinaturaService from '../services/admAssinaturaService';
import type { Assinatura } from '../services/admAssinaturaService';
import admPlanosService, { type Plano } from '../services/admPlanosService';
import { logger } from '../utils/logger';

// Tokens Synchro
const T = {
  cyan:       '#00c8f0',
  cyanDim:    'rgba(0, 200, 240, 0.08)',
  cyanBorder: 'rgba(0, 200, 240, 0.18)',
  cyanGlow:   '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:  '0 6px 22px rgba(0,200,240,0.38)',
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
    '&.Mui-disabled': { backgroundColor: 'rgba(15,30,60,0.03)' },
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

const btnOutlined = {
  height: 40, borderRadius: '10px',
  borderColor: 'rgba(15,30,60,0.18)', color: T.textSecond,
  textTransform: 'none' as const, fontWeight: 600,
  '&:hover': { borderColor: 'rgba(15,30,60,0.35)', backgroundColor: 'rgba(15,30,60,0.03)' },
};

const thCellSx = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.04em', textTransform: 'uppercase' as const,
  borderBottom: `1px solid ${T.border}`, py: 1.5, backgroundColor: '#F8FAFC',
};

const sectionLabel = {
  fontSize: '0.75rem', fontWeight: 600, color: T.textSecond,
  letterSpacing: '0.06em', textTransform: 'uppercase' as const, mb: 1.5,
};

const STATUS_CONFIG: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' | 'info' }> = {
  ATIVO:        { label: 'Ativo',         color: 'success' },
  DEMONSTRACAO: { label: 'Demonstração',  color: 'info'    },
  INADIMPLENTE: { label: 'Inadimplente',  color: 'error'   },
  BLOQUEADO:    { label: 'Bloqueado',     color: 'warning' },
  CANCELADO:    { label: 'Cancelado',     color: 'default' },
};

const EMPTY_FORM: Partial<Assinatura> = {
  nome: '', email: '', cpf: '', id_adm_plano: 0, dt_nascimento: '',
  cep: '', telefone: '', endereco: '', numero: '', complemento: '',
  bairro: '', cidade: '', uf: '', status: 'DEMONSTRACAO',
};

export default function AdmAssinaturaPage() {
  const [assinaturas, setAssinaturas]                   = useState<Assinatura[]>([]);
  const [assinaturasFiltradas, setAssinaturasFiltradas] = useState<Assinatura[]>([]);
  const [planos, setPlanos]                             = useState<Plano[]>([]);
  const [loading, setLoading]                           = useState(true);
  const [error, setError]                               = useState<string | null>(null);
  const [success, setSuccess]                           = useState<string | null>(null);
  const [busca, setBusca]                               = useState('');
  const [openDialog, setOpenDialog]                     = useState(false);
  const [editingAssinatura, setEditingAssinatura]       = useState<Assinatura | null>(null);
  const [viewMode, setViewMode]                         = useState(false);
  const [formData, setFormData]                         = useState<Partial<Assinatura>>(EMPTY_FORM);

  useEffect(() => { carregarDados(); }, []);

  useEffect(() => {
    if (!busca.trim()) { setAssinaturasFiltradas(assinaturas); return; }
    const b = busca.toLowerCase();
    setAssinaturasFiltradas(assinaturas.filter(a =>
      a.nome.toLowerCase().includes(b) || a.email.toLowerCase().includes(b) ||
      a.cpf.includes(busca) || (a.plano_descricao?.toLowerCase().includes(b))
    ));
  }, [busca, assinaturas]);

  const carregarDados = async () => {
    try {
      setLoading(true); setError(null);
      const [a, p] = await Promise.all([admAssinaturaService.listar(), admPlanosService.listar()]);
      setAssinaturas(a); setPlanos(p);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar dados');
      logger.error('Erro ao carregar dados', e);
    } finally { setLoading(false); }
  };

  const handleOpenDialog = (assinatura?: Assinatura, readonly = false) => {
    setViewMode(readonly);
    if (assinatura) {
      setEditingAssinatura(assinatura);
      setFormData({ nome: assinatura.nome, email: assinatura.email, cpf: assinatura.cpf, id_adm_plano: assinatura.id_adm_plano,
        dt_nascimento: assinatura.dt_nascimento, cep: assinatura.cep, telefone: assinatura.telefone,
        endereco: assinatura.endereco, numero: assinatura.numero, complemento: assinatura.complemento || '',
        bairro: assinatura.bairro, cidade: assinatura.cidade, uf: assinatura.uf, status: assinatura.status || 'DEMONSTRACAO' });
    } else {
      setEditingAssinatura(null); setFormData({ ...EMPTY_FORM });
    }
    setOpenDialog(true); setError(null); setSuccess(null);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false); setEditingAssinatura(null); setViewMode(false); setFormData({ ...EMPTY_FORM });
  };

  const handleSubmit = async () => {
    try {
      if (!formData.nome || !formData.email || !formData.cpf || !formData.id_adm_plano) {
        setError('Preencha todos os campos obrigatórios'); return;
      }
      if (editingAssinatura) {
        await admAssinaturaService.atualizar(editingAssinatura.id!, formData as Assinatura);
        setSuccess('Assinatura atualizada com sucesso');
      } else {
        await admAssinaturaService.criar(formData as Assinatura);
        setSuccess('Assinatura criada com sucesso');
      }
      handleCloseDialog(); carregarDados();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.response?.data?.erro || e.message || 'Erro ao salvar assinatura');
    }
  };

  const handleExcluir = async (id: number, nome: string) => {
    if (!confirm(`Deseja realmente excluir a assinatura de ${nome}?`)) return;
    try {
      await admAssinaturaService.excluir(id);
      setSuccess('Assinatura excluída com sucesso');
      carregarDados();
      setTimeout(() => setSuccess(null), 3000);
    } catch (e: any) {
      setError(e.response?.data?.erro || 'Erro ao excluir assinatura');
    }
  };

  const formatarData = (d?: string | null) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const formatarCPF  = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  const formatarTel  = (t: string) => t.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress sx={{ color: T.cyan }} /></Box>;
  }

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Assinaturas
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Gerenciamento de assinantes do sistema
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => handleOpenDialog()} sx={btnPrimary}>
          Nova Assinatura
        </Button>
      </Box>

      {error   && <Alert severity="error"   sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {/* Filtro busca */}
      <Paper elevation={0} sx={{ mb: 2, p: 2, borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
        <TextField fullWidth size="small" placeholder="Buscar por nome, email, CPF ou plano..."
          value={busca} onChange={(e) => setBusca(e.target.value)} sx={inputSx}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon sx={{ color: T.textSecond, fontSize: 18 }} /></InputAdornment> } }} />
      </Paper>

      {/* Tabela */}
      <Paper elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                {['ID','Nome','Email','CPF','Telefone','Plano','Status','Dt. Criação','Dt. Demo','Stripe','Ações'].map((h, i) => (
                  <TableCell key={h} align={i >= 9 ? 'center' : 'left'} sx={thCellSx}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {assinaturasFiltradas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} align="center" sx={{ py: 6, color: T.textSecond, fontSize: '0.875rem' }}>
                    {busca ? 'Nenhuma assinatura encontrada com os critérios de busca' : 'Nenhuma assinatura cadastrada'}
                  </TableCell>
                </TableRow>
              ) : assinaturasFiltradas.map((a) => {
                const cfg = STATUS_CONFIG[a.status || ''] ?? { label: 'N/A', color: 'default' as const };
                return (
                  <TableRow key={a.id} hover sx={{ '&:hover': { backgroundColor: '#F8FAFC' }, '& td': { borderBottom: `1px solid ${T.border}`, py: 1.25 } }}>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{a.id}</TableCell>
                    <TableCell sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, whiteSpace: 'nowrap' }}>{a.nome}</TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{a.email}</TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, fontFamily: 'monospace' }}>{formatarCPF(a.cpf)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, whiteSpace: 'nowrap' }}>{formatarTel(a.telefone)}</TableCell>
                    <TableCell>
                      <Typography sx={{ fontSize: '0.875rem', color: T.textPrimary }}>{a.plano_descricao || '—'}</Typography>
                      {a.plano_valor && <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>R$ {a.plano_valor.toFixed(2)}</Typography>}
                    </TableCell>
                    <TableCell>
                      <Chip label={cfg.label} color={cfg.color} size="small" sx={{ fontSize: '0.75rem', fontWeight: 600, height: 22 }} />
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond, whiteSpace: 'nowrap' }}>{formatarData(a.dt_criacao)}</TableCell>
                    <TableCell sx={{ fontSize: '0.8125rem', color: a.status === 'DEMONSTRACAO' ? '#29B6F6' : T.textSecond }}>
                      {a.status === 'DEMONSTRACAO' ? formatarData(a.dt_demonstracao) : '—'}
                    </TableCell>
                    <TableCell align="center">
                      {a.stripe_customer_id
                        ? <Tooltip title={`Customer: ${a.stripe_customer_id}`}><Chip label="✓" color="success" size="small" sx={{ height: 22 }} /></Tooltip>
                        : <Tooltip title="Aguardando sincronização"><Chip label="⏳" color="warning" size="small" sx={{ height: 22 }} /></Tooltip>}
                    </TableCell>
                    <TableCell align="center">
                      <Stack direction="row" spacing={0.25} justifyContent="center">
                        <Tooltip title="Visualizar">
                          <IconButton size="small" onClick={() => handleOpenDialog(a, true)}
                            sx={{ color: T.textSecond, '&:hover': { color: T.cyan, backgroundColor: T.cyanDim } }}>
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => handleOpenDialog(a, false)}
                            sx={{ color: T.textSecond, '&:hover': { color: '#FFA726', backgroundColor: 'rgba(255,167,38,0.08)' } }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Excluir">
                          <IconButton size="small" onClick={() => handleExcluir(a.id!, a.nome)}
                            sx={{ color: T.textSecond, '&:hover': { color: '#D32F2F', backgroundColor: 'rgba(211,47,47,0.08)' } }}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <Box sx={{ px: 2.5, py: 1.5, borderTop: `1px solid ${T.border}` }}>
          <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
            Total: {assinaturasFiltradas.length} assinatura(s)
            {busca && assinaturasFiltradas.length !== assinaturas.length && ` de ${assinaturas.length}`}
          </Typography>
        </Box>
      </Paper>

      {/* Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth
        slotProps={{ paper: { sx: { borderRadius: '16px', border: `1px solid ${T.border}`, boxShadow: '0 8px 40px rgba(0,0,0,0.12)' } } }}>
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
          <Typography sx={{ fontSize: '1rem', fontWeight: 700, color: T.textPrimary }}>
            {viewMode ? 'Visualizar Assinatura' : editingAssinatura ? 'Editar Assinatura' : 'Nova Assinatura'}
          </Typography>
          <IconButton onClick={handleCloseDialog} size="small" sx={{ color: T.textSecond }}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers sx={{ borderColor: T.border }}>
          {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }}>{error}</Alert>}
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>

            {/* Dados pessoais */}
            <Box>
              <Typography sx={sectionLabel}>Dados Pessoais</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <TextField label="Nome Completo" fullWidth required value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} disabled={viewMode} sx={inputSx} />
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="Email" fullWidth required type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} disabled={viewMode} sx={inputSx} />
                  <TextField label="CPF" fullWidth required value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} disabled={viewMode} placeholder="000.000.000-00" sx={inputSx} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="Data de Nascimento" fullWidth required type="date" slotProps={{ inputLabel: { shrink: true } }} value={formData.dt_nascimento} onChange={(e) => setFormData({ ...formData, dt_nascimento: e.target.value })} disabled={viewMode} sx={inputSx} />
                  <TextField label="Telefone" fullWidth required value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} disabled={viewMode} placeholder="(00) 00000-0000" sx={inputSx} />
                </Stack>
              </Box>
            </Box>

            <Divider sx={{ borderColor: T.border }} />

            {/* Plano e Status */}
            <Box>
              <Typography sx={sectionLabel}>Plano e Status</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <TextField select label="Plano" fullWidth required value={formData.id_adm_plano || ''} onChange={(e) => setFormData({ ...formData, id_adm_plano: Number(e.target.value) })} disabled={viewMode} sx={inputSx}>
                  <MenuItem value="">Selecione...</MenuItem>
                  {planos.filter(p => p.ativo === 'S').map(p => (
                    <MenuItem key={p.id} value={p.id}>{p.descricao} — R$ {p.valor.toFixed(2)}</MenuItem>
                  ))}
                </TextField>
                <TextField select label="Status" fullWidth value={formData.status || 'DEMONSTRACAO'} onChange={(e) => setFormData({ ...formData, status: e.target.value })} disabled={viewMode || !editingAssinatura} sx={inputSx}>
                  {Object.entries(STATUS_CONFIG).map(([v, c]) => <MenuItem key={v} value={v}>{c.label}</MenuItem>)}
                </TextField>
              </Stack>
            </Box>

            <Divider sx={{ borderColor: T.border }} />

            {/* Endereço */}
            <Box>
              <Typography sx={sectionLabel}>Endereço</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="CEP" fullWidth required value={formData.cep} onChange={(e) => setFormData({ ...formData, cep: e.target.value })} disabled={viewMode} placeholder="00000-000" sx={{ maxWidth: { sm: '30%' }, ...inputSx }} />
                  <TextField label="Endereço" fullWidth required value={formData.endereco} onChange={(e) => setFormData({ ...formData, endereco: e.target.value })} disabled={viewMode} sx={inputSx} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="Número" fullWidth required value={formData.numero} onChange={(e) => setFormData({ ...formData, numero: e.target.value })} disabled={viewMode} sx={{ maxWidth: { sm: '25%' }, ...inputSx }} />
                  <TextField label="Complemento" fullWidth value={formData.complemento} onChange={(e) => setFormData({ ...formData, complemento: e.target.value })} disabled={viewMode} sx={{ maxWidth: { sm: '25%' }, ...inputSx }} />
                  <TextField label="Bairro" fullWidth required value={formData.bairro} onChange={(e) => setFormData({ ...formData, bairro: e.target.value })} disabled={viewMode} sx={inputSx} />
                </Stack>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField label="Cidade" fullWidth required value={formData.cidade} onChange={(e) => setFormData({ ...formData, cidade: e.target.value })} disabled={viewMode} sx={inputSx} />
                  <TextField label="UF" fullWidth required value={formData.uf} onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })} disabled={viewMode} inputProps={{ maxLength: 2 }} sx={{ maxWidth: { sm: '20%' }, ...inputSx }} />
                </Stack>
              </Box>
            </Box>

            {/* Informações Stripe (apenas edição) */}
            {editingAssinatura && (
              <>
                <Divider sx={{ borderColor: T.border }} />
                <Box>
                  <Typography sx={sectionLabel}>Informações Stripe</Typography>
                  <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Customer ID" fullWidth value={editingAssinatura.stripe_customer_id || 'Aguardando sincronização'} disabled helperText="ID do cliente no Stripe" sx={inputSx} />
                    {editingAssinatura.stripe_subscription_id && (
                      <TextField label="Subscription ID" fullWidth value={editingAssinatura.stripe_subscription_id} disabled helperText="ID da assinatura no Stripe" sx={inputSx} />
                    )}
                  </Box>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
          <Button onClick={handleCloseDialog} variant="outlined" sx={btnOutlined}>
            {viewMode ? 'Fechar' : 'Cancelar'}
          </Button>
          {!viewMode && (
            <Button variant="contained" onClick={handleSubmit}
              disabled={!formData.nome || !formData.email || !formData.cpf || !formData.id_adm_plano}
              sx={btnPrimary}>
              {editingAssinatura ? 'Atualizar' : 'Criar'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
