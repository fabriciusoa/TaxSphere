import { useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Grid, Button, TextField, MenuItem,
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
  Checkbox, CircularProgress, Alert,
} from '@mui/material';
import { PlayArrow as SimularIcon, ArrowForward as ArrowIcon } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { perdcompService } from '../../services/perdcompService';
import type { PerdcompCredito, PerdcompDebito, SimulacaoResultado } from '../../types/perdcomp';
import { type Empresas } from '../../types/index';
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

const formatBRL = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

interface CreditoSelecionado {
  id: number;
  selecionado: boolean;
  valorUtilizar: number;
}

interface DebitoSelecionado {
  id: number;
  selecionado: boolean;
  valorCompensar: number;
}

export default function SimuladorPage() {
  const navigate = useNavigate();

  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [empresaId, setEmpresaId] = useState<number | ''>('');
  const [creditos, setCreditos] = useState<PerdcompCredito[]>([]);
  const [debitos, setDebitos] = useState<PerdcompDebito[]>([]);
  const [creditosSel, setCreditosSel] = useState<CreditoSelecionado[]>([]);
  const [debitosSel, setDebitosSel] = useState<DebitoSelecionado[]>([]);
  const [resultado, setResultado] = useState<SimulacaoResultado | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    empresasService.listar({ ativo: 'true', limit: 200 })
      .then(res => setEmpresas(res.data))
      .catch(err => {
        logger.error('Erro ao carregar empresas', err);
        setError('Erro ao carregar empresas');
      });
  }, []);

  useEffect(() => {
    if (!empresaId) {
      setCreditos([]);
      setDebitos([]);
      setCreditosSel([]);
      setDebitosSel([]);
      setResultado(null);
      return;
    }

    const carregar = async () => {
      try {
        setLoadingData(true);
        setError('');
        setResultado(null);
        const [creds, debs] = await Promise.all([
          perdcompService.creditos.listar({ id_empresa: empresaId, status: 'Disponível', limit: 200 }),
          perdcompService.debitos.listar({ id_empresa: empresaId, status: 'Pendente', limit: 200 }),
        ]);
        setCreditos(creds.data);
        setDebitos(debs.data);
        setCreditosSel(creds.data.map(c => ({ id: c.id, selecionado: false, valorUtilizar: 0 })));
        setDebitosSel(debs.data.map(d => ({ id: d.id, selecionado: false, valorCompensar: 0 })));
      } catch (err: any) {
        logger.error('Erro ao carregar créditos/débitos', err);
        setError('Erro ao carregar créditos e débitos da empresa');
      } finally {
        setLoadingData(false);
      }
    };
    carregar();
  }, [empresaId]);

  const toggleCredito = (id: number) => {
    setCreditosSel(prev => prev.map(c => {
      if (c.id !== id) return c;
      const credito = creditos.find(cr => cr.id === id)!;
      return {
        ...c,
        selecionado: !c.selecionado,
        valorUtilizar: !c.selecionado ? credito.saldo_disponivel : 0,
      };
    }));
  };

  const toggleDebito = (id: number) => {
    setDebitosSel(prev => prev.map(d => {
      if (d.id !== id) return d;
      const debito = debitos.find(db => db.id === id)!;
      return {
        ...d,
        selecionado: !d.selecionado,
        valorCompensar: !d.selecionado ? debito.saldo_devedor : 0,
      };
    }));
  };

  const handleSimular = async () => {
    const creditosFiltrados = creditosSel.filter(c => c.selecionado && c.valorUtilizar > 0);
    const debitosFiltrados = debitosSel.filter(d => d.selecionado && d.valorCompensar > 0);

    if (creditosFiltrados.length === 0 || debitosFiltrados.length === 0) {
      setError('Selecione ao menos um crédito e um débito para simular');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const res = await perdcompService.simular({
        id_empresa: empresaId,
        creditos: creditosFiltrados.map(c => ({ id_credito: c.id, valor: c.valorUtilizar })),
        debitos: debitosFiltrados.map(d => ({ id_debito: d.id, valor: d.valorCompensar })),
      });
      setResultado(res);
      setSuccess('Simulação concluída com sucesso');
    } catch (err: any) {
      logger.error('Erro na simulação', err);
      setError(err.response?.data?.error || 'Erro ao executar simulação');
    } finally {
      setLoading(false);
    }
  };

  const handleConverterPedido = () => {
    navigate('/fiscal/perdcomp/pedidos/novo', {
      state: {
        id_empresa: empresaId,
        creditos: resultado!.creditos_selecionados,
        debitos: resultado!.debitos_compensados,
      },
    });
  };

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <Typography sx={{
        fontSize: '1.375rem', fontWeight: 700,
        color: T.textPrimary, letterSpacing: '-0.02em', mb: 0.5,
      }}>
        Simulador de Compensação
      </Typography>
      <Typography sx={{ fontSize: '0.875rem', color: T.slate, mb: 3 }}>
        Simule a compensação de créditos tributários contra débitos pendentes.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setSuccess('')}>{success}</Alert>}

      <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 2 }}>
            1. Selecione a Empresa
          </Typography>
          <TextField
            select
            fullWidth
            size="small"
            value={empresaId}
            onChange={e => setEmpresaId(Number(e.target.value))}
            placeholder="Selecione uma empresa"
            sx={{ maxWidth: 500 }}
          >
            <MenuItem value="" disabled>Selecione uma empresa</MenuItem>
            {empresas.map(emp => (
              <MenuItem key={emp.id} value={emp.id}>
                {emp.razao_social} — {emp.cnpj}
              </MenuItem>
            ))}
          </TextField>
        </CardContent>
      </Card>

      {empresaId && (
        <>
          <Typography sx={{ fontSize: '0.875rem', fontWeight: 600, color: T.textPrimary, mb: 2 }}>
            2. Selecione Créditos e Débitos
          </Typography>

          {loadingData ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
              <CircularProgress sx={{ color: T.cyan }} />
            </Box>
          ) : (
            <Grid container spacing={3} sx={{ mb: 3 }}>
              <Grid size={{ xs: 12, md: 6 }}>
                <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, height: '100%' }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: T.cyan, mb: 2 }}>
                      Créditos Disponíveis
                    </Typography>
                    {creditos.length === 0 ? (
                      <Typography sx={{ color: T.slate, fontSize: '0.875rem', textAlign: 'center', py: 4 }}>
                        Nenhum crédito disponível para esta empresa.
                      </Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell padding="checkbox" />
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>Tipo</TableCell>
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>Período</TableCell>
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Saldo</TableCell>
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Valor a Utilizar</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {creditos.map((cred, idx) => {
                              const sel = creditosSel[idx];
                              return (
                                <TableRow key={cred.id} hover>
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={sel?.selecionado ?? false}
                                      onChange={() => toggleCredito(cred.id)}
                                      sx={{ '&.Mui-checked': { color: T.cyan } }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ fontSize: '0.8125rem' }}>{cred.tipo_credito}</TableCell>
                                  <TableCell sx={{ fontSize: '0.8125rem' }}>{cred.periodo_apuracao}</TableCell>
                                  <TableCell align="right" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatBRL(cred.saldo_disponivel)}
                                  </TableCell>
                                  <TableCell align="right">
                                    <TextField
                                      type="number"
                                      size="small"
                                      disabled={!sel?.selecionado}
                                      value={sel?.valorUtilizar ?? 0}
                                      onChange={e => {
                                        const val = Math.min(Math.max(0, Number(e.target.value)), cred.saldo_disponivel);
                                        setCreditosSel(prev => prev.map(c => c.id === cred.id ? { ...c, valorUtilizar: val } : c));
                                      }}
                                      inputProps={{ min: 0, max: cred.saldo_disponivel, step: 0.01 }}
                                      sx={{ width: 130, '& input': { textAlign: 'right', fontSize: '0.8125rem' } }}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </Card>
              </Grid>

              <Grid size={{ xs: 12, md: 6 }}>
                <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, height: '100%' }}>
                  <CardContent sx={{ p: 2.5 }}>
                    <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: '#f59e0b', mb: 2 }}>
                      Débitos a Compensar
                    </Typography>
                    {debitos.length === 0 ? (
                      <Typography sx={{ color: T.slate, fontSize: '0.875rem', textAlign: 'center', py: 4 }}>
                        Nenhum débito pendente para esta empresa.
                      </Typography>
                    ) : (
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell padding="checkbox" />
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>Tributo</TableCell>
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>Vencimento</TableCell>
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Saldo</TableCell>
                              <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Valor a Compensar</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {debitos.map((deb, idx) => {
                              const sel = debitosSel[idx];
                              return (
                                <TableRow key={deb.id} hover>
                                  <TableCell padding="checkbox">
                                    <Checkbox
                                      checked={sel?.selecionado ?? false}
                                      onChange={() => toggleDebito(deb.id)}
                                      sx={{ '&.Mui-checked': { color: T.cyan } }}
                                    />
                                  </TableCell>
                                  <TableCell sx={{ fontSize: '0.8125rem' }}>{deb.tipo_tributo}</TableCell>
                                  <TableCell sx={{ fontSize: '0.8125rem' }}>{deb.dt_vencimento}</TableCell>
                                  <TableCell align="right" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                                    {formatBRL(deb.saldo_devedor)}
                                  </TableCell>
                                  <TableCell align="right">
                                    <TextField
                                      type="number"
                                      size="small"
                                      disabled={!sel?.selecionado}
                                      value={sel?.valorCompensar ?? 0}
                                      onChange={e => {
                                        const val = Math.min(Math.max(0, Number(e.target.value)), deb.saldo_devedor);
                                        setDebitosSel(prev => prev.map(d => d.id === deb.id ? { ...d, valorCompensar: val } : d));
                                      }}
                                      inputProps={{ min: 0, max: deb.saldo_devedor, step: 0.01 }}
                                      sx={{ width: 130, '& input': { textAlign: 'right', fontSize: '0.8125rem' } }}
                                    />
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          )}

          <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
            <Button
              variant="contained"
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SimularIcon />}
              disabled={loading}
              onClick={handleSimular}
              sx={{
                px: 5, py: 1.25,
                backgroundColor: T.cyan,
                fontWeight: 600,
                borderRadius: '10px',
                textTransform: 'none',
                fontSize: '0.9375rem',
                '&:hover': { backgroundColor: '#00b0d8' },
              }}
            >
              {loading ? 'Simulando...' : 'Simular Compensação'}
            </Button>
          </Box>
        </>
      )}

      {resultado && (
        <Box>
          <Typography sx={{ fontSize: '1.125rem', fontWeight: 700, color: T.textPrimary, mb: 2 }}>
            Resultado da Simulação
          </Typography>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: T.slate, fontWeight: 500, mb: 0.5 }}>
                    Total Crédito Utilizado
                  </Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: T.cyan, fontVariantNumeric: 'tabular-nums' }}>
                    {formatBRL(resultado.total_credito_utilizado)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: T.slate, fontWeight: 500, mb: 0.5 }}>
                    Total Débito Compensado
                  </Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
                    {formatBRL(resultado.total_debito_compensado)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, backgroundColor: '#f0fdf4' }}>
                <CardContent sx={{ textAlign: 'center', py: 2.5 }}>
                  <Typography sx={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 500, mb: 0.5 }}>
                    Economia Estimada
                  </Typography>
                  <Typography sx={{ fontSize: '1.25rem', fontWeight: 700, color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>
                    {formatBRL(resultado.economia_estimada)}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          {resultado.alertas.length > 0 && (
            <Box sx={{ mb: 3 }}>
              {resultado.alertas.map((alerta, i) => (
                <Alert key={i} severity="warning" sx={{ mb: 1, borderRadius: '10px' }}>{alerta}</Alert>
              ))}
            </Box>
          )}

          <Grid container spacing={3} sx={{ mb: 3 }}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: T.textPrimary, mb: 2 }}>
                    Créditos Utilizados
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>ID</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>Tipo</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Valor Utilizado</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Saldo Restante</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {resultado.creditos_selecionados.map(c => (
                          <TableRow key={c.id}>
                            <TableCell sx={{ fontSize: '0.8125rem' }}>{c.id}</TableCell>
                            <TableCell sx={{ fontSize: '0.8125rem' }}>{c.tipo}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', color: T.cyan, fontWeight: 600 }}>
                              {formatBRL(c.valor_utilizado)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                              {formatBRL(c.saldo_restante)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
                <CardContent sx={{ p: 2.5 }}>
                  <Typography sx={{ fontSize: '0.9375rem', fontWeight: 700, color: T.textPrimary, mb: 2 }}>
                    Débitos Compensados
                  </Typography>
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>ID</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }}>Tipo</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Valor Compensado</TableCell>
                          <TableCell sx={{ fontWeight: 600, fontSize: '0.75rem', color: T.slate }} align="right">Saldo Restante</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {resultado.debitos_compensados.map(d => (
                          <TableRow key={d.id}>
                            <TableCell sx={{ fontSize: '0.8125rem' }}>{d.id}</TableCell>
                            <TableCell sx={{ fontSize: '0.8125rem' }}>{d.tipo}</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums', color: '#f59e0b', fontWeight: 600 }}>
                              {formatBRL(d.valor_compensado)}
                            </TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.8125rem', fontVariantNumeric: 'tabular-nums' }}>
                              {formatBRL(d.saldo_restante)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </CardContent>
              </Card>
            </Grid>
          </Grid>

          <Box sx={{ display: 'flex', justifyContent: 'center' }}>
            <Button
              variant="contained"
              endIcon={<ArrowIcon />}
              onClick={handleConverterPedido}
              sx={{
                px: 4, py: 1.25,
                backgroundColor: T.navy,
                fontWeight: 600,
                borderRadius: '10px',
                textTransform: 'none',
                fontSize: '0.9375rem',
                '&:hover': { backgroundColor: '#132040' },
              }}
            >
              Converter em Pedido
            </Button>
          </Box>
        </Box>
      )}
    </Box>
  );
}
