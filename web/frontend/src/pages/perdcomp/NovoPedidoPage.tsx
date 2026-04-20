import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Typography, Button, Card, CardContent, CardActionArea, TextField,
  MenuItem, Stepper, Step, StepLabel, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, CircularProgress, Alert,
  Divider,
} from '@mui/material';
import {
  ArrowBack as BackIcon,
  ArrowForward as NextIcon,
  AccountBalance as RestituicaoIcon,
  SwapHoriz as RessarcimentoIcon,
  Replay as ReembolsoIcon,
  CompareArrows as CompensacaoIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import type { PerdcompCredito, PerdcompDebito, TipoPedido} from '../../types/perdcomp';
import { empresasService } from '../../services/empresasService';
import { type Empresas } from '../../types/index';
import { logger } from '../../utils/logger';

const T = {
  navy: '#0a1628',
  cyan: '#00c8f0',
  textPrimary: '#1a2332',
  textSecond: '#64748b',
  border: 'rgba(15, 30, 60, 0.09)',
  surface: '#FFFFFF',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const STEP_LABELS = ['Empresa', 'Tipo de Pedido', 'Créditos', 'Débitos', 'Revisão'];

interface CreditoSelecionado {
  credito: PerdcompCredito;
  valor: number;
}

interface DebitoSelecionado {
  debito: PerdcompDebito;
  valor: number;
}

const tipoCards: { tipo: TipoPedido; icon: React.ReactNode; desc: string }[] = [
  { tipo: 'Restituição', icon: <RestituicaoIcon sx={{ fontSize: 40 }} />, desc: 'Solicitar devolução de tributo pago indevidamente ou a maior.' },
  { tipo: 'Ressarcimento', icon: <RessarcimentoIcon sx={{ fontSize: 40 }} />, desc: 'Recuperar créditos acumulados de tributos não cumulativos.' },
  { tipo: 'Reembolso', icon: <ReembolsoIcon sx={{ fontSize: 40 }} />, desc: 'Solicitar reembolso de contribuições previdenciárias.' },
  { tipo: 'Compensação', icon: <CompensacaoIcon sx={{ fontSize: 40 }} />, desc: 'Utilizar créditos para abater débitos tributários.' },
];

export default function NovoPedidoPage() {
  const navigate = useNavigate();

  const [activeStep, setActiveStep] = useState(0);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  const [empresas, setEmpresas] = useState<Empresas[]>([]);
  const [empresasLoading, setEmpresasLoading] = useState(true);
  const [selectedEmpresa, setSelectedEmpresa] = useState<Empresas | null>(null);

  const [tipoPedido, setTipoPedido] = useState<TipoPedido | null>(null);

  const [creditos, setCreditos] = useState<PerdcompCredito[]>([]);
  const [creditosLoading, setCreditosLoading] = useState(false);
  const [creditosSelecionados, setCreditosSelecionados] = useState<Map<number, CreditoSelecionado>>(new Map());

  const [debitos, setDebitos] = useState<PerdcompDebito[]>([]);
  const [debitosLoading, setDebitosLoading] = useState(false);
  const [debitosSelecionados, setDebitosSelecionados] = useState<Map<number, DebitoSelecionado>>(new Map());

  const shouldShowDebitos = tipoPedido === 'Compensação';
  const effectiveSteps = shouldShowDebitos ? STEP_LABELS : STEP_LABELS.filter((_, i) => i !== 3);

  useEffect(() => {
    setEmpresasLoading(true);
    empresasService.listar({ limit: 200, ativo: 'true' })
      .then(r => setEmpresas(r.data))
      .catch(err => { logger.error('Erro ao carregar empresas', err); setError('Erro ao carregar empresas.'); })
      .finally(() => setEmpresasLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedEmpresa) return;
    let cancelled = false;

    setCreditosLoading(true);
    setDebitosLoading(true);
    setCreditosSelecionados(new Map());
    setDebitosSelecionados(new Map());

    Promise.all([
      perdcompService.creditos.listar({ id_empresa: selectedEmpresa.id, status: 'Disponível', limit: 200 }),
      perdcompService.debitos.listar({ id_empresa: selectedEmpresa.id, status: 'Pendente', limit: 200 }),
    ]).then(([credRes, debRes]) => {
      if (cancelled) return;
      setCreditos(credRes.data);
      setDebitos(debRes.data);
    }).catch(err => {
      if (cancelled) return;
      logger.error('Erro ao carregar créditos/débitos', err);
      setError('Erro ao carregar créditos ou débitos.');
    }).finally(() => {
      if (cancelled) return;
      setCreditosLoading(false);
      setDebitosLoading(false);
    });

    return () => { cancelled = true; };
  }, [selectedEmpresa]);

  const totalCreditos = useMemo(
    () => Array.from(creditosSelecionados.values()).reduce((s, c) => s + c.valor, 0),
    [creditosSelecionados],
  );

  const totalDebitos = useMemo(
    () => Array.from(debitosSelecionados.values()).reduce((s, d) => s + d.valor, 0),
    [debitosSelecionados],
  );

  const toggleCredito = (c: PerdcompCredito) => {
    setCreditosSelecionados(prev => {
      const next = new Map(prev);
      if (next.has(c.id)) {
        next.delete(c.id);
      } else {
        next.set(c.id, { credito: c, valor: c.saldo_disponivel });
      }
      return next;
    });
  };

  const updateCreditoValor = (id: number, valor: number) => {
    setCreditosSelecionados(prev => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, valor: Math.min(Math.max(0, valor), entry.credito.saldo_disponivel) });
      }
      return next;
    });
  };

  const toggleDebito = (d: PerdcompDebito) => {
    setDebitosSelecionados(prev => {
      const next = new Map(prev);
      if (next.has(d.id)) {
        next.delete(d.id);
      } else {
        next.set(d.id, { debito: d, valor: d.saldo_devedor });
      }
      return next;
    });
  };

  const updateDebitoValor = (id: number, valor: number) => {
    setDebitosSelecionados(prev => {
      const next = new Map(prev);
      const entry = next.get(id);
      if (entry) {
        next.set(id, { ...entry, valor: Math.min(Math.max(0, valor), entry.debito.saldo_devedor) });
      }
      return next;
    });
  };

  const mapStepToReal = (step: number): number => {
    if (shouldShowDebitos) return step;
    return step >= 3 ? step + 1 : step;
  };

  const canAdvance = (): boolean => {
    const realStep = mapStepToReal(activeStep);
    switch (realStep) {
      case 0: return !!selectedEmpresa;
      case 1: return !!tipoPedido;
      case 2: return creditosSelecionados.size > 0 && totalCreditos > 0;
      case 3: return debitosSelecionados.size > 0 && totalDebitos > 0;
      case 4: return true;
      default: return false;
    }
  };

  const handleNext = () => {
    if (!canAdvance()) return;
    setActiveStep(prev => Math.min(prev + 1, effectiveSteps.length - 1));
  };

  const handleBack = () => {
    setActiveStep(prev => Math.max(prev - 1, 0));
  };

  const handleCriar = async () => {
    if (!selectedEmpresa || !tipoPedido) return;
    try {
      setCreating(true);
      setError('');
      const itens: any[] = [];
      creditosSelecionados.forEach(({ credito, valor }) => {
        itens.push({ id_credito: credito.id, tipo_item: 'credito', valor_utilizado: valor });
      });
      debitosSelecionados.forEach(({ debito, valor }) => {
        itens.push({ id_debito: debito.id, tipo_item: 'debito', valor_utilizado: valor });
      });
      await perdcompService.pedidos.criar({
        id_empresa: selectedEmpresa.id,
        tipo_pedido: tipoPedido,
        itens,
      });
      navigate('/fiscal/perdcomp/pedidos', { state: { success: 'Pedido criado com sucesso!' } });
    } catch (err: any) {
      logger.error('Erro ao criar pedido', err);
      setError(err?.response?.data?.error || 'Erro ao criar pedido. Tente novamente.');
    } finally {
      setCreating(false);
    }
  };

  const renderRealStep = () => {
    const realStep = mapStepToReal(activeStep);

    if (realStep === 0) {
      return (
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: T.textPrimary, mb: 2 }}>
            Selecione a empresa
          </Typography>
          {empresasLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress sx={{ color: T.cyan }} />
            </Box>
          ) : (
            <>
              <TextField
                select fullWidth size="small" label="Empresa"
                value={selectedEmpresa?.id || ''}
                onChange={e => {
                  const emp = empresas.find(x => x.id === Number(e.target.value));
                  setSelectedEmpresa(emp || null);
                  setCreditosSelecionados(new Map());
                  setDebitosSelecionados(new Map());
                }}
                sx={{ mb: 3 }}
              >
                <MenuItem value="" disabled>Selecione...</MenuItem>
                {empresas.map(emp => (
                  <MenuItem key={emp.id} value={emp.id}>
                    {emp.razao_social} — {emp.cnpj}
                  </MenuItem>
                ))}
              </TextField>
              {selectedEmpresa && (
                <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow }}>
                  <CardContent>
                    <Typography sx={{ fontWeight: 700, color: T.textPrimary, mb: 1 }}>
                      {selectedEmpresa.razao_social}
                    </Typography>
                    <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mb: 2 }}>
                      CNPJ: {selectedEmpresa.cnpj} &bull; {selectedEmpresa.regime_tributario}
                      {selectedEmpresa.uf && ` &bull; ${selectedEmpresa.uf}`}
                    </Typography>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </Box>
      );
    }

    if (realStep === 1) {
      return (
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: T.textPrimary, mb: 2 }}>
            Selecione o tipo de pedido
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
            {tipoCards.map(tc => (
              <Card
                key={tc.tipo}
                elevation={0}
                sx={{
                  borderRadius: '12px',
                  border: `2px solid ${tipoPedido === tc.tipo ? T.cyan : T.border}`,
                  boxShadow: tipoPedido === tc.tipo ? `0 0 0 1px ${T.cyan}` : T.cardShadow,
                  transition: 'all 0.2s ease',
                }}
              >
                <CardActionArea
                  onClick={() => setTipoPedido(tc.tipo)}
                  sx={{ p: 3 }}
                >
                  <Box sx={{ color: tipoPedido === tc.tipo ? T.cyan : T.textSecond, mb: 1.5 }}>
                    {tc.icon}
                  </Box>
                  <Typography sx={{ fontWeight: 700, color: T.textPrimary, mb: 0.5 }}>
                    {tc.tipo}
                  </Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                    {tc.desc}
                  </Typography>
                </CardActionArea>
              </Card>
            ))}
          </Box>
        </Box>
      );
    }

    if (realStep === 2) {
      return (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: T.textPrimary }}>
              Selecione os créditos a utilizar
            </Typography>
            <Typography sx={{ fontWeight: 700, color: T.cyan, fontSize: '1rem' }}>
              Total: {brl(totalCreditos)}
            </Typography>
          </Box>
          {creditosLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress sx={{ color: T.cyan }} />
            </Box>
          ) : creditos.length === 0 ? (
            <Alert severity="warning" sx={{ borderRadius: '10px' }}>
              Nenhum crédito disponível para esta empresa.
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Origem</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Período</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }} align="right">Saldo Disponível</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }} align="right">Valor a Utilizar</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {creditos.map(c => {
                    const selected = creditosSelecionados.has(c.id);
                    const entry = creditosSelecionados.get(c.id);
                    return (
                      <TableRow key={c.id} hover selected={selected}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selected}
                            onChange={() => toggleCredito(c)}
                            sx={{ '&.Mui-checked': { color: T.cyan } }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{c.tipo_credito}</TableCell>
                        <TableCell>{c.origem_credito}</TableCell>
                        <TableCell>{c.periodo_apuracao}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{brl(c.saldo_disponivel)}</TableCell>
                        <TableCell align="right" sx={{ width: 160 }}>
                          {selected && (
                            <TextField
                              size="small" type="number"
                              value={entry?.valor || 0}
                              onChange={e => updateCreditoValor(c.id, parseFloat(e.target.value) || 0)}
                              inputProps={{ min: 0, max: c.saldo_disponivel, step: 0.01 }}
                              sx={{ width: 140 }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      );
    }

    if (realStep === 3) {
      return (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
            <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: T.textPrimary }}>
              Vincule os débitos a compensar
            </Typography>
            <Typography sx={{ fontWeight: 700, color: '#d32f2f', fontSize: '1rem' }}>
              Total: {brl(totalDebitos)}
            </Typography>
          </Box>
          {debitosLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress sx={{ color: T.cyan }} />
            </Box>
          ) : debitos.length === 0 ? (
            <Alert severity="warning" sx={{ borderRadius: '10px' }}>
              Nenhum débito pendente para esta empresa.
            </Alert>
          ) : (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell padding="checkbox" />
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tributo</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Período</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Vencimento</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }} align="right">Saldo Devedor</TableCell>
                    <TableCell sx={{ fontWeight: 600, color: T.textSecond }} align="right">Valor a Compensar</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {debitos.map(d => {
                    const selected = debitosSelecionados.has(d.id);
                    const entry = debitosSelecionados.get(d.id);
                    return (
                      <TableRow key={d.id} hover selected={selected}>
                        <TableCell padding="checkbox">
                          <Checkbox
                            checked={selected}
                            onChange={() => toggleDebito(d)}
                            sx={{ '&.Mui-checked': { color: T.cyan } }}
                          />
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{d.tipo_tributo}</TableCell>
                        <TableCell>{d.periodo_apuracao}</TableCell>
                        <TableCell>{new Date(d.dt_vencimento).toLocaleDateString('pt-BR')}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{brl(d.saldo_devedor)}</TableCell>
                        <TableCell align="right" sx={{ width: 160 }}>
                          {selected && (
                            <TextField
                              size="small" type="number"
                              value={entry?.valor || 0}
                              onChange={e => updateDebitoValor(d.id, parseFloat(e.target.value) || 0)}
                              inputProps={{ min: 0, max: d.saldo_devedor, step: 0.01 }}
                              sx={{ width: 140 }}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      );
    }

    if (realStep === 4) {
      const creditosArr = Array.from(creditosSelecionados.values());
      const debitosArr = Array.from(debitosSelecionados.values());
      const warnings: string[] = [];
      if (shouldShowDebitos && totalCreditos < totalDebitos) {
        warnings.push('O total de créditos é inferior ao total de débitos selecionados.');
      }
      if (creditosArr.some(c => c.valor <= 0)) {
        warnings.push('Existem créditos selecionados com valor zero.');
      }
      if (shouldShowDebitos && debitosArr.some(d => d.valor <= 0)) {
        warnings.push('Existem débitos selecionados com valor zero.');
      }

      return (
        <Box>
          <Typography sx={{ fontWeight: 600, fontSize: '1rem', color: T.textPrimary, mb: 2 }}>
            Revisão do Pedido
          </Typography>

          {warnings.map((w, i) => (
            <Alert key={i} severity="warning" sx={{ mb: 1, borderRadius: '10px' }}>{w}</Alert>
          ))}

          <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, mb: 3 }}>
            <CardContent>
              <Box sx={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Empresa</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{selectedEmpresa?.razao_social}</Typography>
                  <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond }}>{selectedEmpresa?.cnpj}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Tipo de Pedido</Typography>
                  <Typography sx={{ fontWeight: 600 }}>{tipoPedido}</Typography>
                </Box>
                <Box>
                  <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Total Créditos</Typography>
                  <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: '#2e7d32' }}>{brl(totalCreditos)}</Typography>
                </Box>
                {shouldShowDebitos && (
                  <Box>
                    <Typography sx={{ fontSize: '0.75rem', color: T.textSecond }}>Total Débitos</Typography>
                    <Typography sx={{ fontWeight: 700, fontSize: '1.125rem', color: '#d32f2f' }}>{brl(totalDebitos)}</Typography>
                  </Box>
                )}
              </Box>
            </CardContent>
          </Card>

          <Typography sx={{ fontWeight: 600, color: T.textPrimary, mb: 1 }}>Créditos Selecionados</Typography>
          <TableContainer sx={{ mb: 3 }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tipo</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Origem</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Período</TableCell>
                  <TableCell sx={{ fontWeight: 600, color: T.textSecond }} align="right">Valor a Utilizar</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {creditosArr.map(({ credito, valor }) => (
                  <TableRow key={credito.id}>
                    <TableCell sx={{ fontWeight: 600 }}>{credito.tipo_credito}</TableCell>
                    <TableCell>{credito.origem_credito}</TableCell>
                    <TableCell>{credito.periodo_apuracao}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{brl(valor)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>

          {shouldShowDebitos && debitosArr.length > 0 && (
            <>
              <Typography sx={{ fontWeight: 600, color: T.textPrimary, mb: 1 }}>Débitos Selecionados</Typography>
              <TableContainer sx={{ mb: 3 }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Tributo</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: T.textSecond }}>Período</TableCell>
                      <TableCell sx={{ fontWeight: 600, color: T.textSecond }} align="right">Valor a Compensar</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {debitosArr.map(({ debito, valor }) => (
                      <TableRow key={debito.id}>
                        <TableCell sx={{ fontWeight: 600 }}>{debito.tipo_tributo}</TableCell>
                        <TableCell>{debito.periodo_apuracao}</TableCell>
                        <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums' }}>{brl(valor)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </>
          )}
        </Box>
      );
    }

    return null;
  };

  const isLastStep = activeStep === effectiveSteps.length - 1;

  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2, borderRadius: '10px' }} onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <Button
          startIcon={<BackIcon />}
          onClick={() => navigate('/fiscal/perdcomp/pedidos')}
          sx={{ textTransform: 'none', color: T.textSecond }}
        >
          Voltar
        </Button>
        <Box>
          <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
            Novo Pedido PER/DComp
          </Typography>
          <Typography sx={{ fontSize: '0.875rem', color: T.textSecond, mt: 0.25 }}>
            Preencha as etapas abaixo para criar um novo pedido.
          </Typography>
        </Box>
      </Box>

      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 4 }}>
        {effectiveSteps.map(label => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      <Card elevation={0} sx={{ borderRadius: '12px', border: `1px solid ${T.border}`, boxShadow: T.cardShadow, mb: 3 }}>
        <CardContent sx={{ p: 3 }}>
          {renderRealStep()}
        </CardContent>
      </Card>

      <Divider sx={{ mb: 2 }} />

      <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button
          disabled={activeStep === 0}
          onClick={handleBack}
          startIcon={<BackIcon />}
          sx={{ textTransform: 'none', color: T.textSecond }}
        >
          Anterior
        </Button>
        {isLastStep ? (
          <Button
            variant="contained"
            onClick={handleCriar}
            disabled={creating || !canAdvance()}
            sx={{
              bgcolor: T.cyan, color: T.navy, fontWeight: 600,
              textTransform: 'none', borderRadius: '10px', px: 4,
              '&:hover': { bgcolor: '#00b5d8' },
            }}
          >
            {creating ? <CircularProgress size={22} sx={{ color: T.navy }} /> : 'Criar Pedido'}
          </Button>
        ) : (
          <Button
            variant="contained"
            onClick={handleNext}
            disabled={!canAdvance()}
            endIcon={<NextIcon />}
            sx={{
              bgcolor: T.cyan, color: T.navy, fontWeight: 600,
              textTransform: 'none', borderRadius: '10px', px: 4,
              '&:hover': { bgcolor: '#00b5d8' },
            }}
          >
            Próximo
          </Button>
        )}
      </Box>
    </Box>
  );
}
