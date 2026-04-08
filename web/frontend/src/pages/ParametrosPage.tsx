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
  Alert,
  CircularProgress,
  Chip,
  Tooltip
} from '@mui/material';
import {
  Edit as EditIcon,
  Refresh as RefreshIcon
} from '@mui/icons-material';
import { parametrosService, type Parametro } from '../services/parametrosService';
import { logger } from '../utils/logger';

export default function ParametrosPage() {
  const [parametros, setParametros] = useState<Parametro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  
  // Modal de edição
  const [modalAberto, setModalAberto] = useState(false);
  const [parametroSelecionado, setParametroSelecionado] = useState<Parametro | null>(null);
  const [salvando, setSalvando] = useState(false);
  
  // Formulário
  const [formData, setFormData] = useState({
    valor: '',
    descricao: ''
  });

  // Parâmetros críticos do sistema
  const parametrosCriticos = [
    'JWT_SECRET',
    'JWT_EXPIRES_IN',
    'TIMEZONE',
    'BCRYPT_ROUNDS'
  ];

  useEffect(() => {
    carregarParametros();
  }, []);

  const carregarParametros = async () => {
    try {
      setLoading(true);
      setErro('');
      const data = await parametrosService.listar();
      setParametros(data);
    } catch (error: any) {
      setErro(error.response?.data?.message || 'Erro ao carregar parâmetros');
      logger.error('Erro ao carregar parâmetros', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirModalEditar = (parametro: Parametro) => {
    setParametroSelecionado(parametro);
    setFormData({
      valor: parametro.valor,
      descricao: parametro.descricao || ''
    });
    setModalAberto(true);
  };

  const handleSalvar = async () => {
    if (!parametroSelecionado) return;

    try {
      setSalvando(true);
      setErro('');

      if (!formData.valor.trim()) {
        setErro('O valor é obrigatório');
        setSalvando(false);
        return;
      }

      await parametrosService.atualizar(parametroSelecionado.id, {
        valor: formData.valor.trim(),
        descricao: formData.descricao.trim() || undefined
      });

      setSucesso(`Parâmetro "${parametroSelecionado.chave}" atualizado com sucesso`);
      setModalAberto(false);
      carregarParametros();
      setTimeout(() => setSucesso(''), 3000);
    } catch (error: any) {
      logger.error('Erro ao salvar parâmetro', error);
      setErro(error.response?.data?.message || 'Erro ao salvar parâmetro');
    } finally {
      setSalvando(false);
    }
  };

  const isParametroCritico = (chave: string) => {
    return parametrosCriticos.includes(chave);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4">Parâmetros do Sistema</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Gerenciar configurações do sistema
          </Typography>
        </Box>
        
        <Button
          variant="outlined"
          startIcon={<RefreshIcon />}
          onClick={carregarParametros}
          disabled={loading}
        >
          {loading ? <CircularProgress size={20} /> : 'Atualizar'}
        </Button>
      </Box>

      {erro && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setErro('')}>
          {erro}
        </Alert>
      )}

      {sucesso && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSucesso('')}>
          {sucesso}
        </Alert>
      )}

      <Paper>
        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell width="30%">Chave</TableCell>
                <TableCell width="40%">Valor</TableCell>
                <TableCell width="20%">Descrição</TableCell>
                <TableCell width="10%" align="center">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <CircularProgress />
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      Carregando parâmetros...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : parametros.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Nenhum parâmetro encontrado
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                parametros.map((parametro) => (
                  <TableRow key={parametro.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography variant="body2" fontWeight="medium">
                          {parametro.chave}
                        </Typography>
                        {isParametroCritico(parametro.chave) && (
                          <Chip 
                            label="Crítico" 
                            size="small" 
                            color="error" 
                            variant="outlined" 
                          />
                        )}
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace',
                          backgroundColor: '#f5f5f5',
                          padding: '4px 8px',
                          borderRadius: 1,
                          display: 'inline-block',
                          maxWidth: '400px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                        title={parametro.valor}
                      >
                        {parametro.valor}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {parametro.descricao || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Editar parâmetro">
                        <IconButton 
                          size="small" 
                          onClick={() => abrirModalEditar(parametro)}
                          color="primary"
                        >
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Modal de Edição */}
      <Dialog 
        open={modalAberto} 
        onClose={() => setModalAberto(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ textAlign: 'center' }}>
          Editar Parâmetro
        </DialogTitle>
        
        <DialogContent>
          {erro && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {erro}
            </Alert>
          )}

          <Box sx={{ pt: 1 }}>
            <TextField
              fullWidth
              label="Chave"
              value={parametroSelecionado?.chave || ''}
              disabled
              sx={{ mb: 2 }}
              helperText="A chave não pode ser alterada"
            />
            
            <TextField
              fullWidth
              label="Valor"
              value={formData.valor}
              onChange={(e) => setFormData({ ...formData, valor: e.target.value })}
              multiline
              rows={3}
              placeholder="Valor do parâmetro"
              helperText="Conteúdo do parâmetro"
              sx={{ mb: 2 }}
              required
            />
            
            <TextField
              fullWidth
              label="Descrição"
              value={formData.descricao}
              onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
              multiline
              rows={2}
              placeholder="Descrição opcional do parâmetro"
              helperText="Informação adicional sobre o parâmetro"
            />
            
            {parametroSelecionado && isParametroCritico(parametroSelecionado.chave) && (
              <Alert severity="warning" sx={{ mt: 2 }}>
                ⚠️ Este é um parâmetro crítico do sistema. Alterações podem afetar o funcionamento da aplicação.
              </Alert>
            )}
          </Box>
        </DialogContent>
        
        <DialogActions>
          <Button onClick={() => setModalAberto(false)} disabled={salvando}>
            Cancelar
          </Button>
          <Button 
            onClick={handleSalvar} 
            variant="contained"
            disabled={salvando || !formData.valor.trim()}
          >
            {salvando ? <CircularProgress size={24} /> : 'Salvar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
