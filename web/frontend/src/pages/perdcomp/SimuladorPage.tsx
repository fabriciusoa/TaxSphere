import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box, Paper, Typography, Tabs, Tab, Button, TextField, MenuItem,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, TableSortLabel,
  IconButton, Chip, Alert, CircularProgress, Stack, RadioGroup, FormControlLabel, Radio,
  Tooltip, Checkbox,
} from '@mui/material';
import {
  PlayArrow as SimularIcon, Add as AddIcon, Delete as DeleteIcon,
  AutoFixHigh as AutoIcon, ArrowForward as ArrowIcon, Refresh as RefreshIcon,
  Article as ReceiptIcon,
} from '@mui/icons-material';
import { perdcompService } from '../../services/perdcompService';
import { useEmpresa } from '../../contexts/EmpresaContext';
import { logger } from '../../utils/logger';

const T = { navy: '#0a1628', cyan: '#00c8f0', textSecond: '#64748b', success: '#22c55e', warn: '#f59e0b', err: '#ef4444' };

const TRIBUTOS = ['PIS/PASEP', 'COFINS', 'IRPJ', 'CSLL', 'IPI', 'IRRF', 'INSS', 'IOF', 'CIDE', 'OUTROS'];

const TIPOS_CREDITO = [
  'Saldo Negativo de IRPJ',
  'Saldo Negativo de CSLL',
  'Pagamento Indevido',
  'Crédito Presumido IPI',
  'Outros',
];

const ESTRATEGIAS: { value: 'FIFO_PRESCRICAO' | 'FIFO_COMPATIBILIDADE' | 'MAXIMIZAR_SELIC'; label: string; desc: string }[] = [
  { value: 'FIFO_PRESCRICAO',     label: 'FIFO por prescrição',     desc: 'Usa primeiro os créditos mais próximos de prescrever (boa prática padrão)' },
  { value: 'FIFO_COMPATIBILIDADE', label: 'FIFO + Compatibilidade', desc: 'Mesma lógica + respeita regras (INSS só compensa INSS, etc.)' },
  { value: 'MAXIMIZAR_SELIC',     label: 'Maximizar SELIC',        desc: 'Prioriza créditos com mais correção SELIC acumulada' },
];

const METODOS: { value: 'tributo_valor' | 'historico' | 'periodo_tipo' | 'texto_livre'; label: string; desc: string }[] = [
  { value: 'tributo_valor', label: 'Tributo + Valor agregado',  desc: 'Eu digito quais tributos e quanto quero compensar' },
  { value: 'historico',     label: 'Sugestão pelo histórico',    desc: 'Sistema sugere com base nos últimos 12 meses de DCOMPs' },
  { value: 'periodo_tipo',  label: 'Por tipo de crédito',        desc: 'Sistema escolhe tributos típicos do tipo de crédito selecionado' },
  { value: 'texto_livre',   label: 'Texto livre (IA)',           desc: 'Digite em linguagem natural: "PIS 5.000 e COFINS 25.000"' },
];

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);

// ─── Helpers para tabela de débitos ──────────────────────────────────────────
interface DebitoLinha { tributo: string; valor: string }

function ListaDebitos({ linhas, onChange }: {
  linhas: DebitoLinha[];
  onChange: (linhas: DebitoLinha[]) => void;
}) {
  const adicionar = () => onChange([...linhas, { tributo: 'COFINS', valor: '' }]);
  const remover = (i: number) => onChange(linhas.filter((_, idx) => idx !== i));
  const editar = (i: number, campo: keyof DebitoLinha, v: string) => {
    const novas = [...linhas];
    novas[i] = { ...novas[i], [campo]: v };
    onChange(novas);
  };
  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
        <Typography variant="subtitle2" sx={{ color: T.navy, fontWeight: 600 }}>Débitos a compensar</Typography>
        <Button size="small" startIcon={<AddIcon />} onClick={adicionar} sx={{ textTransform: 'none' }}>
          Adicionar tributo
        </Button>
      </Stack>
      {linhas.length === 0 ? (
        <Typography variant="caption" sx={{ color: T.textSecond }}>
          Clique em "Adicionar tributo" para informar o que quer compensar
        </Typography>
      ) : (
        <Stack spacing={1}>
          {linhas.map((d, i) => (
            <Stack direction="row" spacing={1} key={i} alignItems="center">
              <TextField select size="small" value={d.tributo}
                onChange={(e) => editar(i, 'tributo', e.target.value)}
                sx={{ width: 180 }}>
                {TRIBUTOS.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
              </TextField>
              <TextField size="small" placeholder="Valor (R$)" type="number" value={d.valor}
                onChange={(e) => editar(i, 'valor', e.target.value)}
                sx={{ flex: 1, maxWidth: 200 }} />
              <IconButton size="small" onClick={() => remover(i)} sx={{ color: T.err }}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
        </Stack>
      )}
    </Box>
  );
}

// ─── Resultado da simulação ──────────────────────────────────────────────────
function ResultadoSimulacao({ resultado, onGerarPerdcomp }: { resultado: any; onGerarPerdcomp?: () => void }) {
  if (!resultado) return null;
  const cobertura = resultado.total_debito_compensado > 0
    ? (resultado.total_credito_utilizado / resultado.total_debito_compensado) * 100 : 100;
  return (
    <Stack spacing={2} mt={3}>
      {/* KPIs */}
      <Stack direction="row" spacing={2} flexWrap="wrap">
        <Paper sx={{ p: 2, flex: 1, minWidth: 200, borderRadius: 2 }}>
          <Typography variant="caption" sx={{ color: T.textSecond }}>Crédito utilizado</Typography>
          <Typography variant="h6" sx={{ color: T.success, fontWeight: 700 }}>
            {fmtBRL(resultado.total_credito_utilizado)}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 200, borderRadius: 2 }}>
          <Typography variant="caption" sx={{ color: T.textSecond }}>Débito compensado</Typography>
          <Typography variant="h6" sx={{ color: T.navy, fontWeight: 700 }}>
            {fmtBRL(resultado.total_debito_compensado)}
          </Typography>
        </Paper>
        <Paper sx={{ p: 2, flex: 1, minWidth: 200, borderRadius: 2 }}>
          <Typography variant="caption" sx={{ color: T.textSecond }}>Cobertura</Typography>
          <Typography variant="h6" sx={{ color: cobertura >= 100 ? T.success : T.warn, fontWeight: 700 }}>
            {cobertura.toFixed(0)}%
          </Typography>
        </Paper>
      </Stack>

      {resultado.alertas?.length > 0 && (
        <Stack spacing={1}>
          {resultado.alertas.map((a: string, i: number) => (
            <Alert key={i} severity={a.includes('insuficient') || a.includes('prescrit') ? 'error' : 'warning'}>{a}</Alert>
          ))}
        </Stack>
      )}

      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: T.navy }}>Créditos selecionados</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>PER/DCOMP origem</TableCell>
                <TableCell>Tipo</TableCell>
                <TableCell align="right">Saldo antes</TableCell>
                <TableCell align="right">Utilizado</TableCell>
                <TableCell align="right">Saldo após</TableCell>
                <TableCell>Prescrição</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(!resultado.creditos_selecionados || resultado.creditos_selecionados.length === 0) ? (
                <TableRow><TableCell colSpan={6} align="center" sx={{ color: T.textSecond, py: 3 }}>
                  Nenhum crédito alocado
                </TableCell></TableRow>
              ) : resultado.creditos_selecionados.map((c: any) => (
                <TableRow key={c.id} hover>
                  <TableCell sx={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>{c.numero_perdcomp_origem || '—'}</TableCell>
                  <TableCell><Chip label={c.tipo} size="small" /></TableCell>
                  <TableCell align="right">{fmtBRL(c.saldo_anterior)}</TableCell>
                  <TableCell align="right" sx={{ color: T.success, fontWeight: 600 }}>{fmtBRL(c.valor_utilizado)}</TableCell>
                  <TableCell align="right">{fmtBRL(c.saldo_restante)}</TableCell>
                  <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                    {c.data_prescricao ? new Date(c.data_prescricao).toLocaleDateString('pt-BR') : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 2, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, color: T.navy }}>Débitos compensados (por tributo)</Typography>
        </Box>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Tributo</TableCell>
                <TableCell align="right">Solicitado</TableCell>
                <TableCell align="right">Compensado</TableCell>
                <TableCell align="right">Restante</TableCell>
                <TableCell>Cobertura</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {resultado.debitos_compensados.map((d: any, i: number) => {
                const cob = d.valor_solicitado > 0 ? (d.valor_compensado / d.valor_solicitado) * 100 : 100;
                return (
                  <TableRow key={i} hover>
                    <TableCell><Chip label={d.tributo} size="small" variant="outlined" /></TableCell>
                    <TableCell align="right">{fmtBRL(d.valor_solicitado)}</TableCell>
                    <TableCell align="right" sx={{ color: T.success, fontWeight: 600 }}>{fmtBRL(d.valor_compensado)}</TableCell>
                    <TableCell align="right" sx={{ color: d.saldo_restante > 0 ? T.err : T.textSecond }}>{fmtBRL(d.saldo_restante)}</TableCell>
                    <TableCell>
                      <Chip size="small" label={`${cob.toFixed(0)}%`}
                        color={cob >= 100 ? 'success' : cob >= 50 ? 'warning' : 'error'} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {onGerarPerdcomp && resultado.total_credito_utilizado > 0 && (
        <Box>
          <Button variant="contained" color="primary" endIcon={<ArrowIcon />}
            onClick={onGerarPerdcomp}
            sx={{ textTransform: 'none', fontWeight: 600 }}>
            Gerar PER/DCOMP a partir desta simulação
          </Button>
        </Box>
      )}
    </Stack>
  );
}

// ─── Página principal ────────────────────────────────────────────────────────
export default function SimuladorPage() {
  const navigate = useNavigate();
  const { empresaId } = useEmpresa();
  const [tab, setTab] = useState<0 | 1>(1); // automatico por padrão
  const [erro, setErro] = useState('');
  const [simulando, setSimulando] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  // Manual state
  const [creditosDisp, setCreditosDisp] = useState<any[]>([]);
  const [loadingCreds, setLoadingCreds] = useState(false);
  const [creditosSel, setCreditosSel] = useState<Record<number, string>>({});
  const [debitosManual, setDebitosManual] = useState<DebitoLinha[]>([]);
  // Ordenação da tabela de créditos (manual): coluna + direção
  type SortKey = 'numero_perdcomp_origem' | 'tipo_credito' | 'saldo_disponivel' | 'dt_vencimento_prescricao';
  const [sortCol, setSortCol] = useState<SortKey>('dt_vencimento_prescricao');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const handleSort = (col: SortKey) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const creditosOrdenados = [...creditosDisp].sort((a, b) => {
    const va = a[sortCol]; const vb = b[sortCol];
    if (sortCol === 'saldo_disponivel') {
      return sortDir === 'asc' ? Number(va) - Number(vb) : Number(vb) - Number(va);
    }
    if (sortCol === 'dt_vencimento_prescricao') {
      const da = va ? new Date(va).getTime() : Infinity;
      const db = vb ? new Date(vb).getTime() : Infinity;
      return sortDir === 'asc' ? da - db : db - da;
    }
    const sa = String(va || ''); const sb = String(vb || '');
    return sortDir === 'asc' ? sa.localeCompare(sb) : sb.localeCompare(sa);
  });

  // Automatico state
  const [estrategia, setEstrategia] = useState<'FIFO_PRESCRICAO' | 'FIFO_COMPATIBILIDADE' | 'MAXIMIZAR_SELIC'>('FIFO_PRESCRICAO');
  const [metodo, setMetodo] = useState<'tributo_valor' | 'historico' | 'periodo_tipo' | 'texto_livre'>('tributo_valor');
  const [debitosAuto, setDebitosAuto] = useState<DebitoLinha[]>([]);
  const [tipoCreditoSel, setTipoCreditoSel] = useState(TIPOS_CREDITO[0]);
  const [textoLivre, setTextoLivre] = useState('');
  const [sugestoesHistorico, setSugestoesHistorico] = useState<any[]>([]);
  const [loadingSug, setLoadingSug] = useState(false);
  const [sugSelecionadas, setSugSelecionadas] = useState<Record<number, boolean>>({});

  const carregarCreditos = useCallback(async () => {
    if (!empresaId) return;
    setLoadingCreds(true);
    try {
      const res = await perdcompService.creditos.listar({ id_empresa: empresaId as number, status: 'Disponível', limit: 200 });
      setCreditosDisp(res.data);
      // Sugestão: pré-seleciona o crédito mais próximo de prescrever (FIFO).
      if (res.data.length > 0) {
        const ordenadoFifo = [...res.data].sort((a, b) => {
          const da = a.dt_vencimento_prescricao ? new Date(a.dt_vencimento_prescricao).getTime() : Infinity;
          const db = b.dt_vencimento_prescricao ? new Date(b.dt_vencimento_prescricao).getTime() : Infinity;
          return da - db;
        });
        const melhor = ordenadoFifo[0];
        if (melhor && Number(melhor.saldo_disponivel) > 0) {
          setCreditosSel(prev => Object.keys(prev).length === 0
            ? { [melhor.id]: String(melhor.saldo_disponivel) }
            : prev);
        }
      }
    } catch (e: any) {
      logger.error('Erro ao carregar créditos:', e);
      setErro('Erro ao carregar créditos disponíveis');
    } finally {
      setLoadingCreds(false);
    }
  }, [empresaId]);

  // Indica se a sugestão por histórico encontrou dados — controla o banner
  const [historicoVazio, setHistoricoVazio] = useState(false);

  // Carrega débitos sugeridos pelo histórico e pré-preenche a lista do Manual.
  const carregarDebitosSugeridos = useCallback(async () => {
    if (!empresaId) return;
    try {
      const res = await perdcompService.sugerirHistorico(empresaId as number);
      const sug = (res.sugestoes || []).filter(s => Number(s.media_mensal) > 0);
      if (sug.length > 0) {
        setHistoricoVazio(false);
        setDebitosManual(prev => prev.length === 0
          ? sug.slice(0, 5).map(s => ({ tributo: s.tributo, valor: String(Number(s.media_mensal).toFixed(2)) }))
          : prev);
      } else {
        setHistoricoVazio(true);
      }
    } catch (e: any) {
      logger.error('Erro ao sugerir débitos:', e);
      setHistoricoVazio(true);
    }
  }, [empresaId]);

  const carregarSugestoes = useCallback(async () => {
    if (!empresaId) return;
    setLoadingSug(true);
    try {
      const res = await perdcompService.sugerirHistorico(empresaId as number);
      setSugestoesHistorico(res.sugestoes || []);
      const sel: Record<number, boolean> = {};
      (res.sugestoes || []).forEach((_, i) => { sel[i] = true; });
      setSugSelecionadas(sel);
    } catch (e: any) {
      logger.error('Erro ao sugerir histórico:', e);
    } finally {
      setLoadingSug(false);
    }
  }, [empresaId]);

  useEffect(() => {
    if (tab === 0) { carregarCreditos(); carregarDebitosSugeridos(); }
    if (tab === 1 && metodo === 'historico') carregarSugestoes();
  }, [tab, metodo, carregarCreditos, carregarDebitosSugeridos, carregarSugestoes]);

  const toggleCredito = (id: number, saldo: number) => {
    setCreditosSel(prev => {
      const novo = { ...prev };
      if (novo[id] !== undefined) delete novo[id];
      else novo[id] = String(saldo);
      return novo;
    });
  };

  const submitManual = async () => {
    if (!empresaId) { setErro('Selecione uma empresa'); return; }
    const credsPayload = Object.entries(creditosSel)
      .map(([id, v]) => ({ id: Number(id), valor_utilizar: parseFloat(String(v).replace(',', '.')) || 0 }))
      .filter(c => c.valor_utilizar > 0);
    const debsPayload = debitosManual
      .map(d => ({ tributo: d.tributo, valor_compensar: parseFloat(String(d.valor).replace(',', '.')) || 0 }))
      .filter(d => d.valor_compensar > 0);
    if (credsPayload.length === 0) { setErro('Selecione ao menos um crédito e informe o valor a utilizar'); return; }
    if (debitosManual.length === 0) {
      setErro('Adicione ao menos um tributo a compensar (botão "Adicionar tributo")');
      return;
    }
    if (debsPayload.length === 0) {
      const tributos = debitosManual.map(d => d.tributo).join(', ');
      setErro(`Preencha o valor (R$) dos tributos selecionados: ${tributos}`);
      return;
    }
    setErro(''); setSimulando(true); setResultado(null);
    try {
      const res = await perdcompService.simular({
        id_empresa: empresaId as number, creditos: credsPayload, debitos: debsPayload
      });
      setResultado(res);
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Erro ao simular');
    } finally {
      setSimulando(false);
    }
  };

  const submitAuto = async () => {
    if (!empresaId) { setErro('Selecione uma empresa'); return; }
    setErro(''); setSimulando(true); setResultado(null);
    const payload: any = { id_empresa: empresaId, estrategia, metodo };
    try {
      if (metodo === 'tributo_valor') {
        const debs = debitosAuto
          .map(d => ({ tributo: d.tributo, valor: parseFloat(d.valor.replace(',', '.')) || 0 }))
          .filter(d => d.valor > 0);
        if (debs.length === 0) throw new Error('Informe ao menos um tributo com valor');
        payload.debitos = debs;
      } else if (metodo === 'historico') {
        const debs = sugestoesHistorico
          .filter((_, i) => sugSelecionadas[i])
          .map(s => ({ tributo: s.tributo, valor: Number(s.media_mensal) }));
        if (debs.length === 0) throw new Error('Selecione ao menos uma sugestão de tributo');
        payload.metodo = 'tributo_valor';
        payload.debitos = debs;
      } else if (metodo === 'periodo_tipo') {
        payload.tipo_credito = tipoCreditoSel;
      } else if (metodo === 'texto_livre') {
        if (!textoLivre.trim()) throw new Error('Digite o texto a ser interpretado');
        payload.texto = textoLivre;
      }
      const res = await perdcompService.simularAutomatico(payload);
      setResultado(res);
    } catch (e: any) {
      setErro(e.message || e.response?.data?.error || 'Erro ao simular');
    } finally {
      setSimulando(false);
    }
  };

  const handleGerarPerdcomp = () => {
    if (!resultado) return;
    sessionStorage.setItem('simulacao_resultado', JSON.stringify(resultado));
    navigate('/fiscal/perdcomp/documentos/novo?from=simulador');
  };

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>Simulador PER/DCOMP</Typography>
          <Typography variant="body2" sx={{ color: T.textSecond }}>
            Simule manualmente ou deixe o sistema sugerir a melhor compensação
          </Typography>
        </Box>
      </Stack>

      <Paper sx={{ borderRadius: 3, p: 3, mb: 2 }}>
        <Tabs value={tab} onChange={(_, v) => { setTab(v); setResultado(null); setErro(''); }} sx={{ mb: 3 }}>
          <Tab label="Manual" />
          <Tab label="Automático" icon={<AutoIcon fontSize="small" />} iconPosition="start" />
        </Tabs>

        {!empresaId && (
          <Alert severity="info" sx={{ mb: 2 }}>Selecione uma empresa no filtro acima para começar.</Alert>
        )}
        {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}

        {/* MANUAL */}
        {tab === 0 && empresaId && (
          <Stack spacing={3}>
            <Box>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={1}>
                <Typography variant="subtitle2" sx={{ color: T.navy, fontWeight: 600 }}>
                  1. Selecione os créditos a usar
                </Typography>
                <Button size="small" startIcon={<RefreshIcon />} onClick={carregarCreditos} sx={{ textTransform: 'none' }}>
                  Recarregar
                </Button>
              </Stack>
              {loadingCreds ? <CircularProgress size={24} /> : (
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell padding="checkbox"></TableCell>
                        <TableCell>
                          <TableSortLabel active={sortCol === 'numero_perdcomp_origem'}
                            direction={sortCol === 'numero_perdcomp_origem' ? sortDir : 'asc'}
                            onClick={() => handleSort('numero_perdcomp_origem')}>
                            PER/DCOMP origem
                          </TableSortLabel>
                        </TableCell>
                        <TableCell>
                          <TableSortLabel active={sortCol === 'tipo_credito'}
                            direction={sortCol === 'tipo_credito' ? sortDir : 'asc'}
                            onClick={() => handleSort('tipo_credito')}>
                            Tipo
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">
                          <TableSortLabel active={sortCol === 'saldo_disponivel'}
                            direction={sortCol === 'saldo_disponivel' ? sortDir : 'asc'}
                            onClick={() => handleSort('saldo_disponivel')}>
                            Saldo disponível
                          </TableSortLabel>
                        </TableCell>
                        <TableCell align="right">Valor a usar (R$)</TableCell>
                        <TableCell>
                          <TableSortLabel active={sortCol === 'dt_vencimento_prescricao'}
                            direction={sortCol === 'dt_vencimento_prescricao' ? sortDir : 'asc'}
                            onClick={() => handleSort('dt_vencimento_prescricao')}>
                            Prescrição
                          </TableSortLabel>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {creditosOrdenados.length === 0 ? (
                        <TableRow><TableCell colSpan={6} align="center" sx={{ color: T.textSecond, py: 3 }}>
                          Nenhum crédito disponível
                        </TableCell></TableRow>
                      ) : creditosOrdenados.map((c: any) => {
                        const selecionado = creditosSel[c.id] !== undefined;
                        return (
                          <TableRow key={c.id} hover selected={selecionado}>
                            <TableCell padding="checkbox">
                              <Checkbox size="small" checked={selecionado}
                                onChange={() => toggleCredito(c.id, c.saldo_disponivel)} />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8125rem', fontFamily: 'monospace' }}>
                              {(c as any).numero_perdcomp_origem || '—'}
                            </TableCell>
                            <TableCell><Chip label={c.tipo_credito} size="small" /></TableCell>
                            <TableCell align="right" sx={{ color: T.success, fontWeight: 600 }}>
                              {fmtBRL(c.saldo_disponivel)}
                            </TableCell>
                            <TableCell align="right">
                              <TextField size="small" type="number"
                                value={creditosSel[c.id] ?? ''}
                                disabled={!selecionado}
                                onChange={(e) => setCreditosSel(p => ({ ...p, [c.id]: e.target.value }))}
                                sx={{ width: 140 }}
                                inputProps={{ style: { textAlign: 'right' } }} />
                            </TableCell>
                            <TableCell sx={{ fontSize: '0.8125rem', color: T.textSecond }}>
                              {c.dt_vencimento_prescricao ? new Date(c.dt_vencimento_prescricao).toLocaleDateString('pt-BR') : '—'}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              )}
            </Box>

            <Box>
              <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="subtitle2" sx={{ color: T.navy, fontWeight: 600 }}>
                  2. Quais tributos quer compensar (valor agregado)
                </Typography>
                {!historicoVazio && (
                  <Tooltip title="Pré-preenchido com sugestões da média mensal dos últimos 12 meses de DCOMPs. Edite/remova como preferir.">
                    <Chip size="small" label="Sugerido pelo histórico" color="info" variant="outlined" />
                  </Tooltip>
                )}
              </Stack>
              {historicoVazio && (
                <Alert severity="warning" sx={{ mb: 2 }}>
                  Não encontrei DCOMPs nos últimos 12 meses para esta empresa para sugerir valores.
                  Adicione manualmente os tributos e preencha os valores que deseja compensar.
                </Alert>
              )}
              <ListaDebitos linhas={debitosManual} onChange={setDebitosManual} />
            </Box>

            <Box>
              <Button variant="contained" startIcon={simulando ? <CircularProgress size={16} color="inherit" /> : <SimularIcon />}
                onClick={submitManual} disabled={simulando}
                sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: '#00b0d8' }, textTransform: 'none', fontWeight: 600 }}>
                {simulando ? 'Simulando...' : 'Simular Compensação'}
              </Button>
            </Box>
          </Stack>
        )}

        {/* AUTOMÁTICO */}
        {tab === 1 && empresaId && (
          <Stack spacing={3}>
            <Box>
              <Typography variant="subtitle2" sx={{ color: T.navy, fontWeight: 600, mb: 1 }}>
                1. Estratégia de alocação de créditos
              </Typography>
              <RadioGroup value={estrategia} onChange={(e) => setEstrategia(e.target.value as any)}>
                {ESTRATEGIAS.map(s => (
                  <FormControlLabel key={s.value} value={s.value} control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{s.label}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{s.desc}</Typography>
                      </Box>
                    } />
                ))}
              </RadioGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ color: T.navy, fontWeight: 600, mb: 1 }}>
                2. Como descrever os débitos a compensar
              </Typography>
              <RadioGroup value={metodo} onChange={(e) => { setMetodo(e.target.value as any); setResultado(null); }}>
                {METODOS.map(m => (
                  <FormControlLabel key={m.value} value={m.value} control={<Radio size="small" />}
                    label={
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.label}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{m.desc}</Typography>
                      </Box>
                    } />
                ))}
              </RadioGroup>
            </Box>

            <Box>
              <Typography variant="subtitle2" sx={{ color: T.navy, fontWeight: 600, mb: 1 }}>
                3. Entradas
              </Typography>
              {metodo === 'tributo_valor' && (
                <ListaDebitos linhas={debitosAuto} onChange={setDebitosAuto} />
              )}
              {metodo === 'historico' && (
                <Box>
                  {loadingSug ? <CircularProgress size={24} /> : sugestoesHistorico.length === 0 ? (
                    <Alert severity="warning">
                      Sem histórico de DCOMPs nos últimos 12 meses para esta empresa. Use outro método.
                    </Alert>
                  ) : (
                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell padding="checkbox"></TableCell>
                            <TableCell>Tributo</TableCell>
                            <TableCell align="right">Ocorrências (12m)</TableCell>
                            <TableCell align="right">Valor médio</TableCell>
                            <TableCell align="right">Total no período</TableCell>
                            <TableCell align="right">Média mensal (sugerido)</TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {sugestoesHistorico.map((s: any, i: number) => (
                            <TableRow key={i} hover selected={!!sugSelecionadas[i]}>
                              <TableCell padding="checkbox">
                                <Checkbox size="small" checked={!!sugSelecionadas[i]}
                                  onChange={(e) => setSugSelecionadas(p => ({ ...p, [i]: e.target.checked }))} />
                              </TableCell>
                              <TableCell><Chip label={s.tributo} size="small" /></TableCell>
                              <TableCell align="right">{s.ocorrencias}</TableCell>
                              <TableCell align="right">{fmtBRL(s.valor_medio)}</TableCell>
                              <TableCell align="right">{fmtBRL(s.valor_total)}</TableCell>
                              <TableCell align="right" sx={{ color: T.success, fontWeight: 600 }}>
                                {fmtBRL(s.media_mensal)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  )}
                </Box>
              )}
              {metodo === 'periodo_tipo' && (
                <TextField select fullWidth label="Tipo de crédito de origem" value={tipoCreditoSel}
                  onChange={(e) => setTipoCreditoSel(e.target.value)} size="small">
                  {TIPOS_CREDITO.map(t => <MenuItem key={t} value={t}>{t}</MenuItem>)}
                </TextField>
              )}
              {metodo === 'texto_livre' && (
                <Box>
                  <TextField multiline rows={3} fullWidth size="small"
                    placeholder='Exemplo: "Quero compensar PIS R$ 5.000,00 e COFINS 25.000"'
                    value={textoLivre} onChange={(e) => setTextoLivre(e.target.value)} />
                  <Typography variant="caption" sx={{ color: T.textSecond, mt: 0.5, display: 'block' }}>
                    <Tooltip title="Por ora usa parser regex local. Para LLM real, configure ANTHROPIC_API_KEY no backend.">
                      <span>ℹ Parser local — formato livre, mas precisa ter tributo + valor por linha/frase</span>
                    </Tooltip>
                  </Typography>
                </Box>
              )}
            </Box>

            <Box>
              <Button variant="contained" startIcon={simulando ? <CircularProgress size={16} color="inherit" /> : <AutoIcon />}
                onClick={submitAuto} disabled={simulando}
                sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: '#00b0d8' }, textTransform: 'none', fontWeight: 600 }}>
                {simulando ? 'Simulando...' : 'Simular Automaticamente'}
              </Button>
            </Box>
          </Stack>
        )}
      </Paper>

      {resultado && (
        <Paper sx={{ borderRadius: 3, p: 3 }}>
          <Stack direction="row" alignItems="center" gap={1} mb={2}>
            <ReceiptIcon sx={{ color: T.cyan }} />
            <Typography variant="h6" sx={{ color: T.navy, fontWeight: 700 }}>Resultado da simulação</Typography>
          </Stack>
          <ResultadoSimulacao resultado={resultado} onGerarPerdcomp={handleGerarPerdcomp} />
        </Paper>
      )}
    </Box>
  );
}
