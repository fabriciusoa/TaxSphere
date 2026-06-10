/**
 * DCTF Web · Agendamento/Atualização
 *
 * Espelha o padrão da página /fiscal/perdcomp/configuracoes:
 *   - Multi-select de empresas (checkbox)
 *   - Fila sequencial com indicador da empresa em execução
 *   - Integração com ActivityContext (trava o menu durante execução)
 *   - Switches por empresa (sync declarações, recibos, gerar DARF, alertar vencimento)
 *   - Configuração GLOBAL (ativo + horário + dias-antes-vencimento)
 */
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, Stack, Switch, FormControlLabel, TextField, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Chip,
  CircularProgress, Alert, Tooltip, InputAdornment, Divider,
  Autocomplete, Checkbox,
} from '@mui/material';
import {
  AccessTime, PlayArrow as PlayIcon,
  CheckCircle as OkIcon, ErrorOutline as ErrIcon,
  Search as SearchIcon, AutoFixHigh as AutoIcon, VpnKey as KeyIcon,
  Stop as StopIcon,
  Description as DocIcon, ReceiptLong as ReceiptIcon, PictureAsPdf as PdfIcon,
  Notifications as BellIcon,
  CheckBoxOutlineBlank as CheckEmptyIcon, CheckBox as CheckIcon,
  RadioButtonUnchecked as PendingIcon,
  Refresh as RenovarIcon, OpenInBrowser as BrowserIcon,
} from '@mui/icons-material';
import { dctfwebService, type DctfwebAutomacaoEmpresa, type DctfwebAutomacaoGlobal } from '../../services/dctfwebService';
import { useEmpresa } from '../../contexts/EmpresaContext';
import { useActivity } from '../../contexts/ActivityContext';
import { ExecutionTracker, type ExecutionStep, type ExecutionEntity } from '../../components/ExecutionTracker';

const T = { navy: '#0a1628', cyan: '#00c8f0', cyanHover: '#00b0d8', textSecond: '#64748b', emerald: '#22c55e', red: '#ef4444' };

type FlagKey = 'sync_declaracoes_ativo' | 'baixar_recibos_ativo' | 'gerar_darf_ativo' | 'alertar_vencimento_ativo';
const FLAG_META: { key: FlagKey; label: string; icon: React.ReactNode }[] = [
  { key: 'sync_declaracoes_ativo', label: 'Declarações', icon: <DocIcon fontSize="small" /> },
  { key: 'baixar_recibos_ativo',   label: 'Recibos',     icon: <ReceiptIcon fontSize="small" /> },
  { key: 'gerar_darf_ativo',       label: 'Gerar DARF',  icon: <PdfIcon fontSize="small" /> },
  { key: 'alertar_vencimento_ativo', label: 'Alertar venc.', icon: <BellIcon fontSize="small" /> },
];

// Definição das etapas para o ExecutionTracker — mesma identidade visual do perdcomp.
// As chaves correspondem aos prefixos da `ultima_execucao_msg` que o runner produz
// ("sync_decl: OK | recibos: nada pendente | darfs: OK | alertas: 0 vencendo").
// Pesos: declarações e DARFs (consulta e-CAC) são pesados; recibos médio; alertas leve.
const DCTFWEB_STEPS: ExecutionStep<DctfwebAutomacaoEmpresa>[] = [
  { chave: 'sync_decl', label: 'Declarações DCTFweb', icon: <DocIcon fontSize="small" />,     flag: 'sync_declaracoes_ativo',   peso: 40 },
  { chave: 'recibos',   label: 'Recibos PDF',          icon: <ReceiptIcon fontSize="small" />, flag: 'baixar_recibos_ativo',     peso: 30 },
  { chave: 'darfs',     label: 'DARFs',                icon: <PdfIcon fontSize="small" />,     flag: 'gerar_darf_ativo',         peso: 25 },
  { chave: 'alertas',   label: 'Alertas vencimento',   icon: <BellIcon fontSize="small" />,    flag: 'alertar_vencimento_ativo', peso: 5  },
];

export default function AgendamentoPage() {
  const { empresaId: empresaSelecionadaId } = useEmpresa();
  const [loading, setLoading] = useState(true);
  const [global, setGlobal] = useState<DctfwebAutomacaoGlobal | null>(null);
  const [empresas, setEmpresas] = useState<DctfwebAutomacaoEmpresa[]>([]);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [busca, setBusca] = useState('');

  const [empresasSelecionadasIds, setEmpresasSelecionadasIds] = useState<number[]>([]);
  useEffect(() => {
    if (empresaSelecionadaId) setEmpresasSelecionadasIds([Number(empresaSelecionadaId)]);
    else setEmpresasSelecionadasIds([]);
  }, [empresaSelecionadaId]);

  type FilaStatus = 'idle' | 'em_curso' | 'cancelando';
  const [filaStatus, setFilaStatus] = useState<FilaStatus>('idle');
  const [filaIds, setFilaIds] = useState<number[]>([]);
  const [filaPosAtual, setFilaPosAtual] = useState<number>(-1);
  const filaCancelRef = useRef<boolean>(false);
  const [resumoFila, setResumoFila] = useState<Record<number, 'pendente' | 'em_execucao' | 'concluido' | 'erro'>>({});

  // Atividade global → trava o drawer aberto
  const { setActive } = useActivity();
  useEffect(() => {
    if (filaStatus === 'em_curso') {
      const total = filaIds.length;
      const pos = filaPosAtual >= 0 ? filaPosAtual + 1 : 0;
      setActive('dctfweb-fila-agendamento', true, `DCTFweb: atualizando ${pos}/${total} empresa(s)`);
    } else {
      setActive('dctfweb-fila-agendamento', false);
    }
  }, [filaStatus, filaPosAtual, filaIds.length, setActive]);
  useEffect(() => () => setActive('dctfweb-fila-agendamento', false), [setActive]);

  const pollRef = useRef<number | null>(null);
  const [renovando, setRenovando] = useState<Set<number>>(new Set());
  const [renovarMsg, setRenovarMsg] = useState<{ tipo: 'sucesso' | 'erro'; texto: string } | null>(null);

  /** Helper: detecta msg que exige renovar sessão (captcha do gov.br ou cookies expirados). */
  const ehBloqueioCaptcha = (msg?: string | null): boolean =>
    !!msg && /captcha|hcaptcha|bloqueou.*sess[aã]o|sess[aã]o.*expirada|reautent/i.test(msg);

  /** Abre o navegador real (no servidor) para o usuário resolver hCaptcha + login.
   *  Persiste cookies em certificados_digitais.sessao_cookies. */
  const handleRenovarSessao = async (idEmpresa: number) => {
    setRenovando(s => new Set(s).add(idEmpresa));
    setRenovarMsg(null);
    try {
      const r = await dctfwebService.renovarSessao(idEmpresa);
      setRenovarMsg({ tipo: 'sucesso', texto: `Sessão renovada — ${r.cookies_count} cookie(s) capturado(s). Pode disparar a atualização novamente.` });
      await carregar();
    } catch (e: any) {
      setRenovarMsg({ tipo: 'erro', texto: e.response?.data?.error || e.message || 'Falha ao renovar sessão' });
    } finally {
      setRenovando(s => { const n = new Set(s); n.delete(idEmpresa); return n; });
    }
  };

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setErro('');
    try {
      const data = await dctfwebService.obterConfig();
      setGlobal(data.global);
      setEmpresas(data.empresas);
    } catch (e: any) {
      if (!silencioso) setErro(e.response?.data?.error || 'Erro ao carregar configurações');
    } finally { if (!silencioso) setLoading(false); }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  // Polling enquanto houver empresa em_andamento
  const temEmAndamento = empresas.some(e => e.ultima_execucao_status === 'em_andamento');
  useEffect(() => {
    if (!temEmAndamento) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(() => carregar(true), 1500);
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, [temEmAndamento, carregar]);

  const handleToggleFlag = async (idEmpresa: number, field: FlagKey, value: boolean) => {
    const novaLista = empresas.map(e => e.id === idEmpresa ? { ...e, [field]: value } : e);
    setEmpresas(novaLista);
    const emp = novaLista.find(e => e.id === idEmpresa);
    if (!emp) return;
    try {
      await dctfwebService.atualizarEmpresa(idEmpresa, {
        sync_declaracoes_ativo:   emp.sync_declaracoes_ativo,
        baixar_recibos_ativo:     emp.baixar_recibos_ativo,
        gerar_darf_ativo:         emp.gerar_darf_ativo,
        alertar_vencimento_ativo: emp.alertar_vencimento_ativo,
      });
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Falha ao salvar — recarregando');
      carregar();
    }
  };

  // Auto-save do global
  const debounceTimer = useRef<number | null>(null);
  const ultimaConfigSalvaRef = useRef<{ ativo: boolean; horario_diario: string; dias_antes_vencimento_alertar: number } | null>(null);
  useEffect(() => {
    if (!global) return;
    if (ultimaConfigSalvaRef.current === null) {
      ultimaConfigSalvaRef.current = { ativo: global.ativo, horario_diario: global.horario_diario, dias_antes_vencimento_alertar: global.dias_antes_vencimento_alertar };
      return;
    }
    const last = ultimaConfigSalvaRef.current;
    if (last.ativo === global.ativo && last.horario_diario === global.horario_diario && last.dias_antes_vencimento_alertar === global.dias_antes_vencimento_alertar) return;
    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(async () => {
      try {
        await dctfwebService.atualizarGlobal({
          ativo: global.ativo, horario_diario: global.horario_diario,
          dias_antes_vencimento_alertar: global.dias_antes_vencimento_alertar,
        });
        ultimaConfigSalvaRef.current = { ativo: global.ativo, horario_diario: global.horario_diario, dias_antes_vencimento_alertar: global.dias_antes_vencimento_alertar };
      } catch (e: any) { setErro(e.response?.data?.error || 'Falha ao salvar config global'); }
    }, 500);
  }, [global]);

  const empresasEscopo = useMemo(() => {
    if (empresasSelecionadasIds.length === 0) return empresas;
    const set = new Set(empresasSelecionadasIds);
    return empresas.filter(e => set.has(e.id));
  }, [empresas, empresasSelecionadasIds]);

  const empresasFiltradas = busca.trim()
    ? empresasEscopo.filter(e => {
        const q = busca.toLowerCase();
        return e.razao_social.toLowerCase().includes(q) || e.cnpj.includes(q);
      })
    : empresasEscopo;

  const iniciarFila = useCallback(async () => {
    const ids = empresasEscopo
      .filter(e => e.tem_certificado_ativo && (
        e.sync_declaracoes_ativo || e.baixar_recibos_ativo ||
        e.gerar_darf_ativo || e.alertar_vencimento_ativo
      ))
      .map(e => e.id);
    if (ids.length === 0) {
      setErro('Nenhuma empresa selecionada com flag ativa e certificado válido.');
      return;
    }
    setErro(''); setSucesso('');
    filaCancelRef.current = false;
    setFilaIds(ids);
    setFilaPosAtual(0);
    setFilaStatus('em_curso');
    const inicial: typeof resumoFila = {};
    ids.forEach(id => { inicial[id] = 'pendente'; });
    setResumoFila(inicial);

    for (let i = 0; i < ids.length; i++) {
      if (filaCancelRef.current) { setFilaStatus('idle'); setSucesso('Fila cancelada.'); break; }
      const id = ids[i];
      setFilaPosAtual(i);
      setResumoFila(prev => ({ ...prev, [id]: 'em_execucao' }));
      try {
        await dctfwebService.executarAgora(id);
        while (true) {
          if (filaCancelRef.current) break;
          await new Promise(r => setTimeout(r, 1500));
          const data = await dctfwebService.obterConfig();
          setGlobal(data.global);
          setEmpresas(data.empresas);
          const atual = data.empresas.find(e => e.id === id);
          const st = atual?.ultima_execucao_status;
          if (st === 'concluido' || st === 'erro') {
            setResumoFila(prev => ({ ...prev, [id]: st === 'erro' ? 'erro' : 'concluido' }));
            break;
          }
        }
      } catch (e: any) {
        setResumoFila(prev => ({ ...prev, [id]: 'erro' }));
      }
    }
    setFilaPosAtual(-1);
    setFilaStatus('idle');
    setSucesso((s) => s || 'Fila concluída.');
  }, [empresasEscopo]);

  const cancelarFila = useCallback(() => {
    filaCancelRef.current = true;
    setFilaStatus('cancelando');
  }, []);

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>DCTF Web · Agendamento/Atualização</Typography>
        <Typography variant="body2" sx={{ color: T.textSecond }}>
          Defina o agendamento por empresa e dispare atualizações sob demanda. A fila processa cada empresa sequencialmente.
        </Typography>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>{sucesso}</Alert>}
      {renovarMsg && (
        <Alert severity={renovarMsg.tipo === 'sucesso' ? 'success' : 'error'} onClose={() => setRenovarMsg(null)} sx={{ mb: 2 }}>
          {renovarMsg.texto}
        </Alert>
      )}

      {/* Tracker visual de execução: % de progresso, etapa atual e pipeline com status por etapa.
          Passa controls para o usuário poder pausar / retomar / cancelar a execução em curso —
          o backend tem dctfwebControl in-memory que o runner verifica entre etapas. */}
      <ExecutionTracker
        productLabel="DCTFweb"
        productExpectationText="A consulta no e-CAC envolve autenticação + navegação + leitura das tabelas. Normalmente leva 1-3 minutos."
        steps={DCTFWEB_STEPS}
        entities={empresas.map(e => ({
          ...e,
          label: e.razao_social,
        })) as Array<ExecutionEntity & DctfwebAutomacaoEmpresa>}
        controls={{
          onPause:  async (id) => { try { await dctfwebService.pausar(id); }   catch (e: any) { setErro(e.response?.data?.error || 'Falha ao pausar'); } },
          onResume: async (id) => { try { await dctfwebService.retomar(id); }  catch (e: any) { setErro(e.response?.data?.error || 'Falha ao retomar'); } },
          onCancel: async (id) => { try { await dctfwebService.cancelar(id); } catch (e: any) { setErro(e.response?.data?.error || 'Falha ao cancelar'); } },
        }}
      />

      {/* Seletor multi-empresa + botão Atualizar */}
      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3, border: `1px solid ${T.cyan}33` }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ xs: 'stretch', md: 'flex-end' }}>
          <Autocomplete
            multiple disableCloseOnSelect
            sx={{ flex: 1, minWidth: 320 }}
            options={empresas}
            value={empresas.filter(e => empresasSelecionadasIds.includes(e.id))}
            onChange={(_, val) => setEmpresasSelecionadasIds(val.map(v => v.id))}
            getOptionLabel={(o) => `${o.razao_social} — ${o.cnpj}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderOption={(props, option, { selected }) => (
              <li {...props} key={option.id}>
                <Checkbox icon={<CheckEmptyIcon fontSize="small" />} checkedIcon={<CheckIcon fontSize="small" />} style={{ marginRight: 8 }} checked={selected} />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{option.razao_social}</Typography>
                  <Typography variant="caption" sx={{ color: T.textSecond }}>{option.cnpj}</Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} size="small" placeholder="Buscar empresa..."
                label={empresasSelecionadasIds.length === 0 ? 'Todas as empresas (clique para selecionar)' : `${empresasSelecionadasIds.length} empresa(s) selecionada(s)`}
              />
            )}
          />
          <Stack direction="row" gap={1}>
            <Button size="small" variant="outlined" onClick={() => setEmpresasSelecionadasIds(empresas.map(e => e.id))} disabled={empresas.length === 0} sx={{ textTransform: 'none', borderRadius: '8px' }}>Marcar todas</Button>
            <Button size="small" variant="outlined" onClick={() => setEmpresasSelecionadasIds([])} disabled={empresasSelecionadasIds.length === 0} sx={{ textTransform: 'none', borderRadius: '8px' }}>Limpar</Button>
          </Stack>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
          {filaStatus === 'idle' ? (
            <Button variant="contained" startIcon={<PlayIcon />} onClick={iniciarFila} disabled={empresasEscopo.length === 0}
              sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, textTransform: 'none', fontWeight: 600, borderRadius: '10px', minWidth: 200 }}>
              Atualizar {empresasSelecionadasIds.length === 0 ? 'todas' : `${empresasEscopo.length} empresa(s)`}
            </Button>
          ) : (
            <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={cancelarFila} disabled={filaStatus === 'cancelando'}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px', minWidth: 200 }}>
              {filaStatus === 'cancelando' ? 'Cancelando…' : 'Cancelar fila'}
            </Button>
          )}
        </Stack>
      </Paper>

      {/* Fila visual */}
      {filaIds.length > 0 && (
        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3, border: `1px solid ${T.cyan}33` }}>
          <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Fila de execução</Typography>
            <Chip size="small" label={`${filaPosAtual >= 0 ? filaPosAtual + 1 : filaIds.length}/${filaIds.length}`} sx={{ bgcolor: T.cyan + '22', color: T.cyan, fontWeight: 700 }} />
            <Box sx={{ flex: 1 }} />
            {filaStatus === 'em_curso' && <Chip size="small" label="EM CURSO" sx={{ bgcolor: T.cyan + '22', color: T.cyan, fontWeight: 700 }} icon={<CircularProgress size={10} sx={{ color: T.cyan }} />} />}
          </Stack>
          <Stack gap={1}>
            {filaIds.map((id, idx) => {
              const emp = empresas.find(e => e.id === id);
              const status = resumoFila[id] || 'pendente';
              const isAtual = idx === filaPosAtual && filaStatus === 'em_curso';
              const corBorda = status === 'em_execucao' ? T.cyan : status === 'concluido' ? T.emerald : status === 'erro' ? T.red : '#e2e8f0';
              const icone = status === 'em_execucao' ? <CircularProgress size={16} sx={{ color: T.cyan }} />
                          : status === 'concluido' ? <OkIcon sx={{ color: T.emerald, fontSize: 18 }} />
                          : status === 'erro' ? <ErrIcon sx={{ color: T.red, fontSize: 18 }} />
                          : <PendingIcon sx={{ color: '#94a3b8', fontSize: 18 }} />;
              return (
                <Paper key={id} variant="outlined" sx={{ p: 1.5, borderRadius: 2, borderColor: corBorda, borderWidth: isAtual ? 2 : 1, bgcolor: isAtual ? T.cyan + '08' : 'white' }}>
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    <Box sx={{ minWidth: 24, textAlign: 'center' }}>{icone}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: T.navy }}>#{idx + 1} · {emp?.razao_social || `Empresa ${id}`}</Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{emp?.cnpj}</Typography>
                      </Stack>
                      {status === 'em_execucao' && emp?.ultima_execucao_msg && (
                        <Typography variant="caption" sx={{ display: 'block', color: T.cyan, fontFamily: 'monospace', mt: 0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={emp.ultima_execucao_msg}>
                          ▸ {emp.ultima_execucao_msg}
                        </Typography>
                      )}
                      {status === 'erro' && emp?.ultima_execucao_msg && (
                        <Box>
                          <Typography variant="caption" sx={{ display: 'block', color: T.red, mt: 0.5 }}>✗ {emp.ultima_execucao_msg.slice(0, 200)}</Typography>
                          {ehBloqueioCaptcha(emp.ultima_execucao_msg) && (
                            <Button size="small" variant="contained"
                              startIcon={renovando.has(id) ? <CircularProgress size={14} sx={{ color: 'white' }} /> : <BrowserIcon fontSize="small" />}
                              onClick={() => handleRenovarSessao(id)}
                              disabled={renovando.has(id)}
                              sx={{ mt: 1, bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, fontWeight: 700, textTransform: 'none' }}>
                              {renovando.has(id) ? 'Aguardando login (5 min)…' : 'Renovar sessão e-CAC'}
                            </Button>
                          )}
                        </Box>
                      )}
                      {status === 'concluido' && <Typography variant="caption" sx={{ display: 'block', color: T.emerald, mt: 0.5 }}>✓ Atualização concluída</Typography>}
                      {status === 'pendente' && <Typography variant="caption" sx={{ display: 'block', color: T.textSecond, mt: 0.5 }}>aguardando na fila…</Typography>}
                    </Box>
                    {isAtual && <Chip size="small" label="EXECUTANDO" sx={{ bgcolor: T.cyan, color: 'white', fontWeight: 700, fontSize: 10 }} />}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Paper>
      )}

      {loading || !global ? (
        <Box display="flex" justifyContent="center" py={8}><CircularProgress sx={{ color: T.cyan }} /></Box>
      ) : (
        <>
          {/* Configuração global */}
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <AutoIcon sx={{ color: T.cyan }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>Configuração geral do agendamento</Typography>
                <Typography variant="caption" sx={{ color: T.textSecond }}>Define se a automação está ativa e em qual horário diário rodar.</Typography>
              </Box>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} gap={3} alignItems={{ xs: 'stretch', sm: 'center' }} flexWrap="wrap">
              <FormControlLabel
                control={<Switch checked={global.ativo} onChange={(e) => setGlobal({ ...global, ativo: e.target.checked })}
                  sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.emerald }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.emerald } }} />}
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>Automação {global.ativo ? 'ATIVA' : 'desativada'}</Typography>
                    <Typography variant="caption" sx={{ color: T.textSecond }}>{global.ativo ? 'Rodará todo dia no horário configurado' : 'Nenhuma execução automática'}</Typography>
                  </Box>
                }
              />
              <TextField label="Horário diário" type="time" size="small" value={global.horario_diario}
                onChange={(e) => setGlobal({ ...global, horario_diario: e.target.value })}
                InputProps={{ startAdornment: <InputAdornment position="start"><AccessTime fontSize="small" /></InputAdornment> }}
                sx={{ width: 180 }} inputProps={{ step: 300 }} />
              <TextField label="Alertar X dias antes do vencimento" size="small" type="number" value={global.dias_antes_vencimento_alertar}
                onChange={(e) => setGlobal({ ...global, dias_antes_vencimento_alertar: Number(e.target.value || 0) })}
                inputProps={{ min: 0, max: 60 }} sx={{ width: 260 }} />
              <Box sx={{ flex: 1 }} />
              <Typography variant="caption" sx={{ color: T.textSecond, fontStyle: 'italic' }}>✓ Salva automaticamente</Typography>
            </Stack>
          </Paper>

          {/* Tabela de empresas + flags */}
          <Paper sx={{ p: 3, borderRadius: 3 }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy, flex: 1 }}>Empresas e fluxos automáticos</Typography>
              <TextField size="small" placeholder="Filtrar..." value={busca} onChange={(e) => setBusca(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                sx={{ width: 240 }} />
            </Stack>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: '#f8fafc' }}>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Empresa</TableCell>
                    {FLAG_META.map(f =>
                      <TableCell key={f.key} align="center" sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        <Stack direction="row" alignItems="center" gap={0.5} justifyContent="center">{f.icon}{f.label}</Stack>
                      </TableCell>
                    )}
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 }}>Última execução</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {empresasFiltradas.map(emp => (
                    <TableRow key={emp.id} hover>
                      <TableCell>
                        <Stack direction="row" alignItems="center" gap={1}>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>{emp.razao_social}</Typography>
                            <Typography variant="caption" sx={{ color: T.textSecond }}>{emp.cnpj}</Typography>
                          </Box>
                          {!emp.tem_certificado_ativo && (
                            <Tooltip title="Sem certificado ativo — empresa será pulada">
                              <KeyIcon sx={{ color: T.red, fontSize: 16 }} />
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                      {FLAG_META.map(f => (
                        <TableCell key={f.key} align="center">
                          <Switch size="small" checked={emp[f.key]}
                            disabled={!emp.tem_certificado_ativo || filaStatus === 'em_curso' || emp.ultima_execucao_status === 'em_andamento'}
                            onChange={(e) => handleToggleFlag(emp.id, f.key, e.target.checked)}
                            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: T.cyan }, '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.cyan } }} />
                        </TableCell>
                      ))}
                      <TableCell>
                        {emp.ultima_execucao ? (() => {
                          const minutosDecorridos = (Date.now() - new Date(emp.ultima_execucao).getTime()) / 60_000;
                          const travado = emp.ultima_execucao_status === 'em_andamento' && minutosDecorridos > 5;
                          return (
                            <Stack direction="row" alignItems="center" gap={0.5}>
                              <Chip size="small"
                                label={travado ? 'TRAVADO' : emp.ultima_execucao_status === 'concluido' ? 'OK' : emp.ultima_execucao_status === 'erro' ? 'ERRO' : 'EM ANDAMENTO'}
                                sx={{
                                  bgcolor: travado ? `${T.red}22`
                                          : emp.ultima_execucao_status === 'concluido' ? `${T.emerald}22`
                                          : emp.ultima_execucao_status === 'erro' ? `${T.red}22`
                                          : `${T.cyan}22`,
                                  color: travado ? T.red
                                        : emp.ultima_execucao_status === 'concluido' ? T.emerald
                                        : emp.ultima_execucao_status === 'erro' ? T.red
                                        : T.cyan,
                                  fontWeight: 700, fontSize: 10,
                                }}
                                icon={emp.ultima_execucao_status === 'em_andamento' && !travado ? <CircularProgress size={10} sx={{ color: T.cyan }} /> : undefined}
                              />
                              <Typography variant="caption" sx={{ color: T.textSecond }}>
                                {new Date(emp.ultima_execucao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </Typography>
                              {travado && (
                                <Tooltip title={`Pipeline preso há ${Math.floor(minutosDecorridos)} min. Clique para destravar (não interrompe execução real).`}>
                                  <Button size="small" variant="outlined" color="error"
                                    onClick={async () => {
                                      try {
                                        await dctfwebService.destravarPipeline(emp.id);
                                        setSucesso(`Pipeline destravado para ${emp.razao_social}.`);
                                        carregar(true);
                                      } catch (e: any) {
                                        setErro(e.response?.data?.error || 'Falha ao destravar');
                                      }
                                    }}
                                    sx={{ ml: 1, textTransform: 'none', fontSize: 10, minWidth: 0, py: 0.25, px: 1, borderRadius: '6px' }}>
                                    Destravar
                                  </Button>
                                </Tooltip>
                              )}
                              {ehBloqueioCaptcha(emp.ultima_execucao_msg) && (
                                <Tooltip title="Abre o navegador real com o certificado para você resolver o hCaptcha do gov.br. Após login, cookies são salvos por horas.">
                                  <Button size="small" variant="contained"
                                    startIcon={renovando.has(emp.id) ? <CircularProgress size={12} sx={{ color: 'white' }} /> : <RenovarIcon fontSize="small" />}
                                    onClick={() => handleRenovarSessao(emp.id)}
                                    disabled={renovando.has(emp.id)}
                                    sx={{ ml: 1, bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, textTransform: 'none', fontSize: 10, minWidth: 0, py: 0.25, px: 1, borderRadius: '6px', fontWeight: 700 }}>
                                    {renovando.has(emp.id) ? 'Aguardando…' : 'Renovar sessão'}
                                  </Button>
                                </Tooltip>
                              )}
                            </Stack>
                          );
                        })() : (
                          <Typography variant="caption" sx={{ color: T.textSecond }}>—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {empresasFiltradas.length === 0 && (
                    <TableRow><TableCell colSpan={6} align="center"><Typography variant="caption" sx={{ color: T.textSecond }}>Nenhuma empresa.</Typography></TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
}
