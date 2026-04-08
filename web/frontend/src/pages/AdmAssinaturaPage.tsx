import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Chip,
  TextField,
  InputAdornment,
  Button,
  Stack,
  Tooltip,
  Alert,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  Divider
} from '@mui/material';
import {
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Add as AddIcon,
  Visibility as VisibilityIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import admAssinaturaService from '../services/admAssinaturaService';
import type { Assinatura } from '../services/admAssinaturaService';
import admPlanosService, { type Plano } from '../services/admPlanosService';
import { logger } from '../utils/logger';

export default function AdmAssinaturaPage() {
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([]);
  const [assinaturasFiltradas, setAssinaturasFiltradas] = useState<Assinatura[]>([]);
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [openDialog, setOpenDialog] = useState(false);
  const [editingAssinatura, setEditingAssinatura] = useState<Assinatura | null>(null);
  const [viewMode, setViewMode] = useState(false);

  const [formData, setFormData] = useState<Partial<Assinatura>>({
    nome: '',
    email: '',
    cpf: '',
    id_adm_plano: 0,
    dt_nascimento: '',
    cep: '',
    telefone: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    uf: '',
    status: 'DEMONSTRACAO'
  });

  useEffect(() => {
    carregarDados();
  }, []);

  useEffect(() => {
    filtrarAssinaturas();
  }, [busca, assinaturas]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      setError(null);
      const [assinaturasData, planosData] = await Promise.all([
        admAssinaturaService.listar(),
        admPlanosService.listar()
      ]);
      setAssinaturas(assinaturasData);
      setPlanos(planosData);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados');
      logger.error('Erro ao carregar dados', err);
    } finally {
      setLoading(false);
    }
  };

  const filtrarAssinaturas = () => {
    if (!busca.trim()) {
      setAssinaturasFiltradas(assinaturas);
      return;
    }

    const buscaLower = busca.toLowerCase();
    const filtradas = assinaturas.filter(
      (a) =>
        a.nome.toLowerCase().includes(buscaLower) ||
        a.email.toLowerCase().includes(buscaLower) ||
        a.cpf.includes(busca) ||
        (a.plano_descricao && a.plano_descricao.toLowerCase().includes(buscaLower))
    );
    setAssinaturasFiltradas(filtradas);
  };

  const handleOpenDialog = (assinatura?: Assinatura, readonly: boolean = false) => {
    setViewMode(readonly);
    if (assinatura) {
      setEditingAssinatura(assinatura);
      setFormData({
        nome: assinatura.nome,
        email: assinatura.email,
        cpf: assinatura.cpf,
        id_adm_plano: assinatura.id_adm_plano,
        dt_nascimento: assinatura.dt_nascimento,
        cep: assinatura.cep,
        telefone: assinatura.telefone,
        endereco: assinatura.endereco,
        numero: assinatura.numero,
        complemento: assinatura.complemento || '',
        bairro: assinatura.bairro,
        cidade: assinatura.cidade,
        uf: assinatura.uf,
        status: assinatura.status || 'DEMONSTRACAO'
      });
    } else {
      setEditingAssinatura(null);
      setFormData({
        nome: '',
        email: '',
        cpf: '',
        id_adm_plano: 0,
        dt_nascimento: '',
        cep: '',
        telefone: '',
        endereco: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        uf: '',
        status: 'DEMONSTRACAO'
      });
    }
    setOpenDialog(true);
    setError(null);
    setSuccess(null);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingAssinatura(null);
    setViewMode(false);
    setFormData({
      nome: '',
      email: '',
      cpf: '',
      id_adm_plano: 0,
      dt_nascimento: '',
      cep: '',
      telefone: '',
      endereco: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      uf: '',
      status: 'DEMONSTRACAO'
    });
  };

  const handleSubmit = async () => {
    try {
      if (!formData.nome || !formData.email || !formData.cpf || !formData.id_adm_plano) {
        setError('Preencha todos os campos obrigatórios');
        return;
      }

      if (editingAssinatura) {
        await admAssinaturaService.atualizar(editingAssinatura.id!, formData as Assinatura);
        setSuccess('Assinatura atualizada com sucesso');
      } else {
        await admAssinaturaService.criar(formData as Assinatura);
        setSuccess('Assinatura criada com sucesso');
      }

      handleCloseDialog();
      carregarDados();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.erro || err.message || 'Erro ao salvar assinatura');
    }
  };

  const handleExcluir = async (id: number, nome: string) => {
    if (!confirm(`Deseja realmente excluir a assinatura de ${nome}?`)) {
      return;
    }

    try {
      await admAssinaturaService.excluir(id);
      setSuccess('Assinatura excluída com sucesso');
      carregarDados();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.response?.data?.erro || 'Erro ao excluir assinatura');
    }
  };

  const getStatusChip = (status?: string) => {
    const statusConfig: Record<string, { label: string; color: 'success' | 'warning' | 'error' | 'default' | 'info' }> = {
      ATIVO: { label: 'Ativo', color: 'success' },
      DEMONSTRACAO: { label: 'Demonstração', color: 'info' },
      INADIMPLENTE: { label: 'Inadimplente', color: 'error' },
      BLOQUEADO: { label: 'Bloqueado', color: 'warning' },
      CANCELADO: { label: 'Cancelado', color: 'default' }
    };

    const config = status ? statusConfig[status] : { label: 'N/A', color: 'default' as const };
    return <Chip label={config.label} color={config.color} size="small" />;
  };

  const formatarData = (data?: string | null) => {
    if (!data) return '-';
    const d = new Date(data);
    return d.toLocaleDateString('pt-BR');
  };

  const formatarCPF = (cpf: string) => {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  };

  const formatarTelefone = (telefone: string) => {
    return telefone.replace(/(\d{2})(\d{4,5})(\d{4})/, '($1) $2-$3');
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Assinaturas
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Gerenciamento de assinantes do sistema
          </Typography>
        </Box>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Nova Assinatura
        </Button>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      <Paper sx={{ mb: 2, p: 2 }}>
        <TextField
          fullWidth
          placeholder="Buscar por nome, email, CPF ou plano..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon />
              </InputAdornment>
            ),
          }}
        />
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>ID</TableCell>
              <TableCell>Nome</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>CPF</TableCell>
              <TableCell>Telefone</TableCell>
              <TableCell>Plano</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Dt. Criação</TableCell>
              <TableCell>Dt. Demonstração</TableCell>
              <TableCell align="center">Stripe</TableCell>
              <TableCell align="center">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {assinaturasFiltradas.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} align="center">
                  <Typography variant="body2" color="text.secondary" py={3}>
                    {busca ? 'Nenhuma assinatura encontrada com os critérios de busca' : 'Nenhuma assinatura cadastrada'}
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              assinaturasFiltradas.map((assinatura) => (
                <TableRow key={assinatura.id} hover>
                  <TableCell>{assinatura.id}</TableCell>
                  <TableCell>
                    <Typography variant="body2" fontWeight="medium">
                      {assinatura.nome}
                    </Typography>
                  </TableCell>
                  <TableCell>{assinatura.email}</TableCell>
                  <TableCell>{formatarCPF(assinatura.cpf)}</TableCell>
                  <TableCell>{formatarTelefone(assinatura.telefone)}</TableCell>
                  <TableCell>
                    <Typography variant="body2">{assinatura.plano_descricao || '-'}</Typography>
                    {assinatura.plano_valor && (
                      <Typography variant="caption" color="text.secondary">
                        R$ {assinatura.plano_valor.toFixed(2)}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>{getStatusChip(assinatura.status)}</TableCell>
                  <TableCell>{formatarData(assinatura.dt_criacao)}</TableCell>
                  <TableCell>
                    {assinatura.status === 'DEMONSTRACAO' ? (
                      <Tooltip title="Período de demonstração">
                        <Typography variant="body2" color="info.main">
                          {formatarData(assinatura.dt_demonstracao)}
                        </Typography>
                      </Tooltip>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                  <TableCell align="center">
                    {assinatura.stripe_customer_id ? (
                      <Tooltip title={`Customer: ${assinatura.stripe_customer_id}`}>
                        <Chip label="✓" color="success" size="small" />
                      </Tooltip>
                    ) : (
                      <Tooltip title="Aguardando sincronização">
                        <Chip label="⏳" color="warning" size="small" />
                      </Tooltip>
                    )}
                  </TableCell>
                  <TableCell align="center">
                    <Stack direction="row" spacing={0.5} justifyContent="center">
                      <Tooltip title="Visualizar">
                        <IconButton
                          size="small"
                          color="info"
                          onClick={() => handleOpenDialog(assinatura, true)}
                        >
                          <VisibilityIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Editar">
                        <IconButton
                          size="small"
                          color="primary"
                          onClick={() => handleOpenDialog(assinatura, false)}
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Excluir">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => handleExcluir(assinatura.id!, assinatura.nome)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Box mt={2}>
        <Typography variant="body2" color="text.secondary">
          Total: {assinaturasFiltradas.length} assinatura(s)
          {busca && assinaturasFiltradas.length !== assinaturas.length && 
            ` de ${assinaturas.length}`}
        </Typography>
      </Box>

      {/* Dialog de Cadastro/Edição/Visualização */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {viewMode ? 'Visualizar Assinatura' : editingAssinatura ? 'Editar Assinatura' : 'Nova Assinatura'}
            </Typography>
            <IconButton onClick={handleCloseDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={3}>
            {/* Dados Pessoais */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Dados Pessoais
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <TextField
                  label="Nome Completo"
                  fullWidth
                  required
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  disabled={viewMode}
                />
                <Box display="flex" gap={2}>
                  <TextField
                    label="Email"
                    fullWidth
                    required
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={viewMode}
                  />
                  <TextField
                    label="CPF"
                    fullWidth
                    required
                    value={formData.cpf}
                    onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                    disabled={viewMode}
                    placeholder="000.000.000-00"
                  />
                </Box>
                <Box display="flex" gap={2}>
                  <TextField
                    label="Data de Nascimento"
                    fullWidth
                    required
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    value={formData.dt_nascimento}
                    onChange={(e) => setFormData({ ...formData, dt_nascimento: e.target.value })}
                    disabled={viewMode}
                  />
                  <TextField
                    label="Telefone"
                    fullWidth
                    required
                    value={formData.telefone}
                    onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                    disabled={viewMode}
                    placeholder="(00) 00000-0000"
                  />
                </Box>
              </Box>
            </Box>

            <Divider />

            {/* Plano e Status */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Plano e Status
              </Typography>
              <Box display="flex" gap={2}>
                <TextField
                  select
                  label="Plano"
                  fullWidth
                  required
                  value={formData.id_adm_plano || ''}
                  onChange={(e) => setFormData({ ...formData, id_adm_plano: Number(e.target.value) })}
                  disabled={viewMode}
                >
                  <MenuItem value="">Selecione...</MenuItem>
                  {planos.filter(p => p.ativo === 'S').map((plano) => (
                    <MenuItem key={plano.id} value={plano.id}>
                      {plano.descricao} - R$ {plano.valor.toFixed(2)}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  label="Status"
                  fullWidth
                  value={formData.status || 'DEMONSTRACAO'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  disabled={viewMode || !editingAssinatura}
                >
                  <MenuItem value="DEMONSTRACAO">Demonstração</MenuItem>
                  <MenuItem value="ATIVO">Ativo</MenuItem>
                  <MenuItem value="INADIMPLENTE">Inadimplente</MenuItem>
                  <MenuItem value="BLOQUEADO">Bloqueado</MenuItem>
                  <MenuItem value="CANCELADO">Cancelado</MenuItem>
                </TextField>
              </Box>
            </Box>

            <Divider />

            {/* Endereço */}
            <Box>
              <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                Endereço
              </Typography>
              <Box display="flex" flexDirection="column" gap={2}>
                <Box display="flex" gap={2}>
                  <TextField
                    label="CEP"
                    fullWidth
                    required
                    value={formData.cep}
                    onChange={(e) => setFormData({ ...formData, cep: e.target.value })}
                    disabled={viewMode}
                    placeholder="00000-000"
                    sx={{ maxWidth: '30%' }}
                  />
                  <TextField
                    label="Endereço"
                    fullWidth
                    required
                    value={formData.endereco}
                    onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                    disabled={viewMode}
                  />
                </Box>
                <Box display="flex" gap={2}>
                  <TextField
                    label="Número"
                    fullWidth
                    required
                    value={formData.numero}
                    onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                    disabled={viewMode}
                    sx={{ maxWidth: '25%' }}
                  />
                  <TextField
                    label="Complemento"
                    fullWidth
                    value={formData.complemento}
                    onChange={(e) => setFormData({ ...formData, complemento: e.target.value })}
                    disabled={viewMode}
                    sx={{ maxWidth: '25%' }}
                  />
                  <TextField
                    label="Bairro"
                    fullWidth
                    required
                    value={formData.bairro}
                    onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                    disabled={viewMode}
                  />
                </Box>
                <Box display="flex" gap={2}>
                  <TextField
                    label="Cidade"
                    fullWidth
                    required
                    value={formData.cidade}
                    onChange={(e) => setFormData({ ...formData, cidade: e.target.value })}
                    disabled={viewMode}
                  />
                  <TextField
                    label="UF"
                    fullWidth
                    required
                    value={formData.uf}
                    onChange={(e) => setFormData({ ...formData, uf: e.target.value.toUpperCase() })}
                    disabled={viewMode}
                    inputProps={{ maxLength: 2 }}
                    placeholder="SP"
                    sx={{ maxWidth: '20%' }}
                  />
                </Box>
              </Box>
            </Box>

            {editingAssinatura && (
              <>
                <Divider />
                <Box>
                  <Typography variant="subtitle1" fontWeight="bold" gutterBottom>
                    Informações Stripe
                  </Typography>
                  <Box display="flex" flexDirection="column" gap={2}>
                    <TextField
                      label="Customer ID"
                      fullWidth
                      value={editingAssinatura.stripe_customer_id || 'Aguardando sincronização'}
                      disabled
                      helperText="ID do cliente no Stripe"
                    />
                    {editingAssinatura.stripe_subscription_id && (
                      <TextField
                        label="Subscription ID"
                        fullWidth
                        value={editingAssinatura.stripe_subscription_id}
                        disabled
                        helperText="ID da assinatura no Stripe"
                      />
                    )}
                  </Box>
                </Box>
              </>
            )}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>
            {viewMode ? 'Fechar' : 'Cancelar'}
          </Button>
          {!viewMode && (
            <Button
              variant="contained"
              onClick={handleSubmit}
              disabled={!formData.nome || !formData.email || !formData.cpf || !formData.id_adm_plano}
            >
              {editingAssinatura ? 'Atualizar' : 'Criar'}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}
