import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Switch,
  FormControlLabel,
  Chip,
  Alert,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Tooltip,
  Divider
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Close as CloseIcon
} from '@mui/icons-material';
import admPlanosService, { type Plano, type PlanoItem } from '../services/admPlanosService';
import { logger } from '../utils/logger';

interface PlanoFormData {
  descricao: string;
  valor: number;
  ativo: boolean;
  itens: PlanoItem[];
}

export default function AdmPlanosPage() {
  const [planos, setPlanos] = useState<Plano[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingPlano, setEditingPlano] = useState<Plano | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [formData, setFormData] = useState<PlanoFormData>({
    descricao: '',
    valor: 0,
    ativo: true,
    itens: []
  });

  const [valorInput, setValorInput] = useState('0,00');
  const [novoItem, setNovoItem] = useState('');

  useEffect(() => {
    carregarPlanos();
  }, []);

  const carregarPlanos = async () => {
    try {
      setLoading(true);
      const data = await admPlanosService.listar();
      setPlanos(data);
      setError(null);
    } catch (err: any) {
      setError('Erro ao carregar planos');
      logger.error('Erro ao carregar planos', err);
    } finally {
      setLoading(false);
    }
  };

  const parseValorInput = (valorStr: string): number => {
    const valorNumerico = valorStr.replace(',', '.');
    return parseFloat(valorNumerico) || 0;
  };

  const handleValorChange = (value: string) => {
    // Permite apenas números e uma vírgula
    const regex = /^[0-9]*,?[0-9]*$/;
    if (regex.test(value) || value === '') {
      setValorInput(value);
      const valorNumerico = parseValorInput(value);
      setFormData({ ...formData, valor: valorNumerico });
    }
  };

  const handleOpenDialog = (plano?: Plano) => {
    if (plano) {
      setEditingPlano(plano);
      setFormData({
        descricao: plano.descricao,
        valor: plano.valor,
        ativo: plano.ativo === 'S',
        itens: plano.itens || []
      });
      setValorInput(plano.valor.toFixed(2).replace('.', ','));
    } else {
      setEditingPlano(null);
      setFormData({
        descricao: '',
        valor: 0,
        ativo: true,
        itens: []
      });
      setValorInput('0,00');
    }
    setOpenDialog(true);
    setError(null);
    setSuccess(null);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingPlano(null);
    setFormData({
      descricao: '',
      valor: 0,
      ativo: true,
      itens: []
    });
    setNovoItem('');
  };

  const handleAddItem = () => {
    if (novoItem.trim()) {
      setFormData({
        ...formData,
        itens: [
          ...formData.itens,
          {
            descricao: novoItem.trim(),
            ativo: 'S'
          }
        ]
      });
      setNovoItem('');
    }
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      itens: formData.itens.filter((_, i) => i !== index)
    });
  };

  const handleToggleItemAtivo = (index: number) => {
    const novosItens = [...formData.itens];
    novosItens[index].ativo = novosItens[index].ativo === 'S' ? 'N' : 'S';
    setFormData({
      ...formData,
      itens: novosItens
    });
  };

  const handleSubmit = async () => {
    try {
      if (!formData.descricao.trim()) {
        setError('Descrição é obrigatória');
        return;
      }

      if (formData.valor <= 0) {
        setError('Valor deve ser maior que zero');
        return;
      }

      const planoData: Plano = {
        descricao: formData.descricao,
        valor: formData.valor,
        ativo: formData.ativo ? 'S' : 'N',
        itens: formData.itens
      };

      if (editingPlano) {
        await admPlanosService.atualizar(editingPlano.id!, planoData);
        setSuccess('Plano atualizado com sucesso');
      } else {
        await admPlanosService.criar(planoData);
        setSuccess('Plano criado com sucesso');
      }

      handleCloseDialog();
      carregarPlanos();

      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      logger.error('Erro ao salvar plano', err);
      setError(err.response?.data?.error || 'Erro ao salvar plano');
    }
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Deseja realmente excluir este plano?')) {
      try {
        await admPlanosService.excluir(id);
        setSuccess('Plano excluído com sucesso');
        carregarPlanos();
        setTimeout(() => setSuccess(null), 3000);
      } catch (err: any) {
        logger.error('Erro ao excluir plano', err);
        setError(err.response?.data?.error || 'Erro ao excluir plano');
      }
    }
  };

  const formatarValor = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(valor);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom>
            Planos do Sistema
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Gerenciamento dos planos para assinatura
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Novo Plano
        </Button>
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)} sx={{ mb: 2 }}>
          {success}
        </Alert>
      )}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Descrição</TableCell>
              <TableCell align="right">Valor</TableCell>
              <TableCell align="center">Itens</TableCell>
              <TableCell align="center">Id Stripe Produto</TableCell>
              <TableCell align="center">Id Stripe Preço</TableCell>
              <TableCell align="center">Status</TableCell>
              <TableCell align="center">Ações</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : planos.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  Nenhum plano cadastrado
                </TableCell>
              </TableRow>
            ) : (
              planos.map((plano) => (
                <TableRow key={plano.id} hover>
                  <TableCell>
                    <Typography variant="body1" fontWeight="medium">
                      {plano.descricao}
                    </Typography>
                  </TableCell>
                  <TableCell align="right">
                    <Typography variant="body1" fontWeight="bold" color="primary">
                      {formatarValor(plano.valor)}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={`${plano.itens?.length || 0} itens`}
                      size="small"
                      color="default"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body1">
                      {plano.id_product_stripe}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Typography variant="body1">
                      {plano.id_price_stripe}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Chip
                      label={plano.ativo === 'S' ? 'Ativo' : 'Inativo'}
                      color={plano.ativo === 'S' ? 'success' : 'default'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="center">
                    <Tooltip title="Editar">
                      <IconButton
                        size="small"
                        color="primary"
                        onClick={() => handleOpenDialog(plano)}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="Excluir">
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => handleDelete(plano.id!)}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog de Cadastro/Edição */}
      <Dialog
        open={openDialog}
        onClose={handleCloseDialog}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="h6">
              {editingPlano ? 'Editar Plano' : 'Novo Plano'}
            </Typography>
            <IconButton onClick={handleCloseDialog} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          <Box display="flex" flexDirection="column" gap={3}>
            <TextField
              label="Descrição do Plano"
              fullWidth
              value={formData.descricao}
              onChange={(e) =>
                setFormData({ ...formData, descricao: e.target.value })
              }
              required
              helperText="Ex: Plano Solo, Plano Profissional"
            />

            <TextField
              label="Valor Mensal"
              fullWidth
              value={valorInput}
              onChange={(e) => handleValorChange(e.target.value)}
              required
              placeholder="0,00"
              InputProps={{
                startAdornment: <Typography sx={{ mr: 1 }}>R$</Typography>
              }}
              helperText="Use vírgula para decimais. Ex: 199,90"
            />

            <FormControlLabel
              control={
                <Switch
                  checked={formData.ativo}
                  onChange={(e) =>
                    setFormData({ ...formData, ativo: e.target.checked })
                  }
                />
              }
              label="Plano Ativo"
            />

            <Divider />

            <Box>
              <Typography variant="h6" gutterBottom>
                Itens do Plano
              </Typography>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Adicione os recursos e funcionalidades incluídos neste plano
              </Typography>

              <Box display="flex" gap={1} mt={2} mb={2}>
                <TextField
                  label="Novo item"
                  fullWidth
                  value={novoItem}
                  onChange={(e) => setNovoItem(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                  placeholder="Ex: Pacientes ilimitados"
                />
                <Button
                  variant="contained"
                  onClick={handleAddItem}
                  disabled={!novoItem.trim()}
                >
                  Adicionar
                </Button>
              </Box>

              {formData.itens.length > 0 ? (
                <Paper variant="outlined">
                  <List dense>
                    {formData.itens.map((item, index) => (
                      <ListItem
                        key={index}
                        sx={{
                          opacity: item.ativo === 'S' ? 1 : 0.5,
                          textDecoration: item.ativo === 'N' ? 'line-through' : 'none'
                        }}
                      >
                        <ListItemText
                          primary={`✓ ${item.descricao}`}
                          primaryTypographyProps={{
                            variant: 'body2'
                          }}
                        />
                        <ListItemSecondaryAction>
                          <Tooltip title={item.ativo === 'S' ? 'Desativar' : 'Ativar'}>
                            <Switch
                              edge="end"
                              checked={item.ativo === 'S'}
                              onChange={() => handleToggleItemAtivo(index)}
                              size="small"
                            />
                          </Tooltip>
                          <Tooltip title="Remover">
                            <IconButton
                              edge="end"
                              size="small"
                              onClick={() => handleRemoveItem(index)}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </ListItemSecondaryAction>
                      </ListItem>
                    ))}
                  </List>
                </Paper>
              ) : (
                <Alert severity="info">
                  Nenhum item adicionado. Adicione itens para descrever o que está incluído no plano.
                </Alert>
              )}
            </Box>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={handleSubmit}
            disabled={!formData.descricao.trim()}
          >
            {editingPlano ? 'Atualizar' : 'Criar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
