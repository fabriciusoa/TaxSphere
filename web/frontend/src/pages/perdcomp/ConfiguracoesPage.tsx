import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  Box, Paper, Typography, Stack, Switch, FormControlLabel, TextField, Button,
  Table, TableHead, TableBody, TableRow, TableCell, TableContainer, Chip,
  CircularProgress, Alert, Tooltip, IconButton, InputAdornment, Divider, LinearProgress,
  Autocomplete, Checkbox,
} from '@mui/material';
import {
  AccessTime, PlayArrow as PlayIcon, Refresh,
  CheckCircle as OkIcon, ErrorOutline as ErrIcon, HourglassTop as RunIcon,
  Search as SearchIcon, AutoFixHigh as AutoIcon, VpnKey as KeyIcon,
  Cancel as CancelIcon, ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
  Description as DocIcon, ReceiptLong as ReceiptIcon, PictureAsPdf as PdfIcon,
  AccountBalanceWallet as WalletIcon, Pause as PauseIcon, Stop as StopIcon,
  CheckBoxOutlineBlank as CheckEmptyIcon, CheckBox as CheckIcon,
  RadioButtonUnchecked as PendingIcon,
} from '@mui/icons-material';
import {
  perdcompAutomacaoService,
  type AutomacaoConfigGlobal, type AutomacaoConfigEmpresa,
} from '../../services/perdcompAutomacaoService';
import { useEmpresa } from '../../contexts/EmpresaContext';
import { useActivity } from '../../contexts/ActivityContext';
import { Business as BusinessIcon } from '@mui/icons-material';

const T = { navy: '#0a1628', cyan: '#00c8f0', cyanHover: '#00b0d8', textSecond: '#64748b', emerald: '#22c55e' };

interface FlagsCellProps {
  emp: AutomacaoConfigEmpresa;
  field: keyof Pick<AutomacaoConfigEmpresa,
    'sync_documentos_ativo' | 'baixar_recibos_ativo' | 'baixar_documentos_ativo' | 'sync_saldos_ativo'>;
  disabled?: boolean;
  onChange: (id: number, field: any, value: boolean) => void;
}

function FlagCell({ emp, field, disabled, onChange }: FlagsCellProps) {
  return (
    <Switch
      size="small"
      checked={emp[field]}
      disabled={disabled}
      onChange={(e) => onChange(emp.id, field, e.target.checked)}
      sx={{
        '& .MuiSwitch-switchBase.Mui-checked': { color: T.cyan },
        '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.cyan },
      }}
    />
  );
}

function StatusUltimaExecucao({ emp }: { emp: AutomacaoConfigEmpresa }) {
  if (!emp.ultima_execucao) {
    return <Typography variant="caption" color="text.secondary">—</Typography>;
  }
  const data = new Date(emp.ultima_execucao).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const status = emp.ultima_execucao_status;
  const cfg = status === 'concluido' ? { icon: <OkIcon sx={{ fontSize: 14 }} />, color: T.emerald, label: 'OK' }
    : status === 'erro' ? { icon: <ErrIcon sx={{ fontSize: 14 }} />, color: '#ef4444', label: 'Erro' }
    : status === 'em_andamento' ? { icon: <RunIcon sx={{ fontSize: 14 }} />, color: '#f59e0b', label: 'Em curso' }
    : { icon: null, color: T.textSecond, label: '—' };

  return (
    <Tooltip title={emp.ultima_execucao_msg || ''} arrow>
      <Stack direction="row" alignItems="center" spacing={0.5}>
        <Chip
          size="small"
          icon={cfg.icon as any}
          label={cfg.label}
          sx={{
            bgcolor: `${cfg.color}20`, color: cfg.color, fontWeight: 600, fontSize: '0.7rem', height: 20,
            ...(status === 'em_andamento' && {
              animation: 'chipPulse 1.4s ease-in-out infinite',
              '@keyframes chipPulse': {
                '0%, 100%': { opacity: 1, transform: 'scale(1)' },
                '50%': { opacity: 0.65, transform: 'scale(1.03)' },
              },
            }),
          }}
        />
        <Typography variant="caption" color="text.secondary">{data}</Typography>
      </Stack>
    </Tooltip>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ExecutionTracker — banner inteligente que mostra:
//   • Durante execução: anel animado + timer + etapa atual + barra global
//   • Após conclusão: resumo expansível com cada etapa (sucesso/erro/skip)
//   • Persiste até o usuário fechar (não some sozinho)
// Parser de etapas: extrai "key: value" da `ultima_execucao_msg` (formato do runner).
// ════════════════════════════════════════════════════════════════════════════
interface Etapa {
  chave: string;     // 'sync_docs', 'recibos', 'documentos', 'saldos'
  label: string;     // texto amigável
  status: 'ok' | 'erro' | 'skip' | 'parcial';
  detalhe: string;
  icon: React.ReactNode;
}

function parseEtapas(msg: string | null): Etapa[] {
  if (!msg) return [];
  const meta: Record<string, { label: string; icon: React.ReactNode }> = {
    sync_docs:  { label: 'Lista de PER/DCOMPs', icon: <DocIcon fontSize="small" /> },
    recibos:    { label: 'Recibos PDF',          icon: <ReceiptIcon fontSize="small" /> },
    documentos: { label: 'Documentos completos', icon: <PdfIcon fontSize="small" /> },
    saldos:     { label: 'Saldos consolidados',  icon: <WalletIcon fontSize="small" /> },
  };
  const partes = msg.split(' | ').map(p => p.trim()).filter(Boolean);
  const out: Etapa[] = [];
  for (const p of partes) {
    const m = p.match(/^([\w_]+):\s*(.*)$/);
    if (!m) continue;
    const chave = m[1];
    const detalhe = m[2];
    const upper = detalhe.toUpperCase();
    let status: Etapa['status'];
    if (upper.startsWith('OK') || /^\d+ criados|^\d+\/\d+ baixados/.test(detalhe)) {
      // "OK", "X/Y baixados" — se X>0 → ok, se X=0 mas Y>0 → erro silencioso
      if (/^0\/\d+/.test(detalhe) || /^0 criados, 0/.test(detalhe)) {
        status = 'parcial';
      } else {
        status = 'ok';
      }
    } else if (upper.startsWith('ERRO') || upper.startsWith('EXCEPTION')) {
      status = 'erro';
    } else if (detalhe.toLowerCase().includes('nada pendente') || upper.startsWith('SKIP')) {
      status = 'skip';
    } else {
      status = 'ok';
    }
    out.push({
      chave,
      label: meta[chave]?.label || chave,
      icon: meta[chave]?.icon || <DocIcon fontSize="small" />,
      status,
      detalhe,
    });
  }
  return out;
}

function ExecutionTracker({ empresas }: { empresas: AutomacaoConfigEmpresa[] }) {
  const T = { navy: '#0a1628', cyan: '#00c8f0', textSecond: '#64748b', emerald: '#22c55e' };
  const emExec = empresas.filter(e => e.ultima_execucao_status === 'em_andamento');
  // Últimas execuções concluídas/com erro nas últimas 2h — para o "post-mortem"
  const duasHorasAtras = Date.now() - 2 * 60 * 60 * 1000;
  const recentes = empresas.filter(e =>
    e.ultima_execucao_status &&
    e.ultima_execucao_status !== 'em_andamento' &&
    e.ultima_execucao && new Date(e.ultima_execucao).getTime() > duasHorasAtras
  );

  // Live timer enquanto há execução
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (emExec.length === 0) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [emExec.length]);
  void tick; // só pra forçar re-render

  const [expandedRecent, setExpandedRecent] = useState<Record<number, boolean>>({});
  const [dismissedRecent, setDismissedRecent] = useState<Set<number>>(new Set());

  // Banner de execução ATIVA
  if (emExec.length > 0) {
    const emp = emExec[0]; // mostra detalhes da primeira (geralmente única)
    // Clamp pra zero — se DB e cliente têm timezone descasados, evita timer negativo
    const elapsed = emp.ultima_execucao
      ? Math.max(0, Math.floor((Date.now() - new Date(emp.ultima_execucao).getTime()) / 1000))
      : 0;
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    const elapsedStr = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;

    // ── Planeja as etapas conforme as flags da empresa + parseia o que já foi feito ──
    interface EtapaPlano {
      chave: string; label: string; icon: React.ReactNode; ativa: boolean;
      status: 'pendente' | 'em_curso' | 'ok' | 'erro' | 'skip' | 'parcial';
      detalhe?: string;
    }
    const etapasPlanejadas: EtapaPlano[] = [
      { chave: 'sync_docs',  label: 'Lista de PER/DCOMPs',  icon: <DocIcon fontSize="small" />,     ativa: emp.sync_documentos_ativo,   status: 'pendente' },
      { chave: 'recibos',    label: 'Recibos PDF',           icon: <ReceiptIcon fontSize="small" />,  ativa: emp.baixar_recibos_ativo,    status: 'pendente' },
      { chave: 'documentos', label: 'Documentos completos',  icon: <PdfIcon fontSize="small" />,      ativa: emp.baixar_documentos_ativo, status: 'pendente' },
      { chave: 'saldos',     label: 'Saldos consolidados',   icon: <WalletIcon fontSize="small" />,   ativa: emp.sync_saldos_ativo,       status: 'pendente' },
    ];

    // Parse da mensagem atual: o backend agrega "key: detalhe | key: detalhe | ..." conforme conclui cada etapa.
    const parsed = parseEtapas(emp.ultima_execucao_msg);
    const concluidasMap = new Map(parsed.map(p => [p.chave, p]));

    // Identifica próxima etapa ativa que ainda não foi reportada → essa é a "em_curso"
    let achouEmCurso = false;
    for (const ep of etapasPlanejadas) {
      if (!ep.ativa) { ep.status = 'skip'; continue; }
      const c = concluidasMap.get(ep.chave);
      if (c) {
        ep.status = c.status === 'ok' ? 'ok'
          : c.status === 'erro' ? 'erro'
          : c.status === 'parcial' ? 'parcial'
          : c.status === 'skip' ? 'skip'
          : 'ok';
        ep.detalhe = c.detalhe;
      } else if (!achouEmCurso) {
        ep.status = 'em_curso';
        achouEmCurso = true;
      }
    }

    const totalAtivas = etapasPlanejadas.filter(e => e.ativa).length;
    const concluidas = etapasPlanejadas.filter(e => e.ativa && ['ok', 'erro', 'parcial', 'skip'].includes(e.status)).length;
    // Pesos por etapa proporcionais ao trabalho típico (sync/saldos rápidos, recibos/docs pesados).
    // Pesos só contam para etapas ativas — somatório é renormalizado abaixo.
    const PESOS: Record<string, number> = { sync_docs: 10, recibos: 40, documentos: 40, saldos: 10 };
    const somaPesosAtivos = etapasPlanejadas.reduce((acc, ep) => acc + (ep.ativa ? (PESOS[ep.chave] || 1) : 0), 0) || 1;
    // Progresso fracionário da etapa em curso: extrai N/M ou N% da última parte da msg
    let fracAtual = 0;
    const msgAtual = emp.ultima_execucao_msg || '';
    const ultimaParte = msgAtual.split(' | ').pop() || '';
    const mPct = ultimaParte.match(/\((\d+)%\)/);
    const mFrac = ultimaParte.match(/(\d+)\s*\/\s*(\d+)/);
    if (mPct) {
      fracAtual = Math.min(1, Number(mPct[1]) / 100);
    } else if (mFrac) {
      const num = Number(mFrac[1]); const den = Number(mFrac[2]);
      if (den > 0) fracAtual = Math.min(1, num / den);
    }
    // Soma pesos das etapas finalizadas + peso fracionário da em_curso
    let pesoFeito = 0;
    for (const ep of etapasPlanejadas) {
      if (!ep.ativa) continue;
      const w = PESOS[ep.chave] || 1;
      if (['ok', 'erro', 'parcial', 'skip'].includes(ep.status)) pesoFeito += w;
      else if (ep.status === 'em_curso') pesoFeito += w * fracAtual;
    }
    const pctRaw = (pesoFeito / somaPesosAtivos) * 100;
    const pct = Math.round(pctRaw);

    return (
      <Paper
        sx={{
          position: 'sticky', top: 8, zIndex: 5,
          mb: 2, borderRadius: 3, overflow: 'hidden',
          background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 50%, #0a1628 100%)',
          backgroundSize: '200% 200%',
          animation: 'gradShift 6s ease infinite',
          '@keyframes gradShift': {
            '0%, 100%': { backgroundPosition: '0% 50%' },
            '50%': { backgroundPosition: '100% 50%' },
          },
          color: 'white',
          boxShadow: '0 4px 24px rgba(0,200,240,0.4), 0 0 0 1px rgba(0,200,240,0.3)',
        }}
      >
        {/* Barra superior com porcentagem real do progresso */}
        <LinearProgress
          variant="determinate"
          value={pct}
          sx={{
            height: 4, bgcolor: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': {
              background: 'linear-gradient(90deg, #00c8f0 0%, #22c55e 100%)',
              transition: 'transform 0.6s ease-out',
            },
          }}
        />

        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          {/* Anel com PORCENTAGEM dentro */}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, flexShrink: 0 }}>
            {/* Halo pulsante externo */}
            <Box sx={{
              position: 'absolute', inset: -8, borderRadius: '50%',
              border: '2px solid rgba(0,200,240,0.5)',
              animation: 'haloPulse 2s ease-out infinite',
              '@keyframes haloPulse': {
                '0%': { opacity: 0.7, transform: 'scale(0.85)' },
                '100%': { opacity: 0, transform: 'scale(1.4)' },
              },
            }} />
            {/* Trilho de fundo (cinza claro) */}
            <CircularProgress size={72} thickness={4} variant="determinate" value={100}
              sx={{ color: 'rgba(255,255,255,0.1)', position: 'absolute' }} />
            {/* Progresso determinado (cyan, animado) */}
            <CircularProgress size={72} thickness={4} variant="determinate" value={pct}
              sx={{
                color: T.cyan, position: 'absolute',
                transform: 'rotate(-90deg)!important',
                '& circle': { transition: 'stroke-dashoffset 0.6s ease-out' },
              }} />
            {/* Porcentagem central */}
            <Box sx={{ textAlign: 'center', zIndex: 1, lineHeight: 1 }}>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>
                {pct}%
              </Typography>
              <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {concluidas}/{totalAtivas}
              </Typography>
            </Box>
          </Box>

          {/* Texto principal */}
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <Chip
                label="EM EXECUÇÃO"
                size="small"
                sx={{
                  bgcolor: T.cyan, color: T.navy, fontWeight: 700, fontSize: '0.65rem', height: 18,
                  animation: 'breathe 1.5s ease-in-out infinite',
                  '@keyframes breathe': {
                    '0%, 100%': { transform: 'scale(1)' },
                    '50%': { transform: 'scale(1.05)' },
                  },
                }}
              />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                ⏱ {elapsedStr}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>
                Etapa {Math.min(concluidas + 1, totalAtivas)} de {totalAtivas}
              </Typography>
              {/* Botões pausar / retomar / cancelar */}
              <Box sx={{ flex: 1 }} />
              <Stack direction="row" spacing={0.5}>
                {emp.ultima_execucao_msg?.toLowerCase().includes('pausado') ? (
                  <Tooltip title="Retomar">
                    <IconButton size="small" sx={{ color: '#22c55e', bgcolor: 'rgba(34,197,94,0.15)', '&:hover': { bgcolor: 'rgba(34,197,94,0.3)' } }}
                      onClick={async () => {
                        try { await perdcompAutomacaoService.retomar(emp.id); }
                        catch { /* ignore */ }
                      }}>
                      <PlayIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ) : (
                  <Tooltip title="Pausar (suspende ao fim da etapa atual)">
                    <IconButton size="small" sx={{ color: '#fbbf24', bgcolor: 'rgba(251,191,36,0.15)', '&:hover': { bgcolor: 'rgba(251,191,36,0.3)' } }}
                      onClick={async () => {
                        try { await perdcompAutomacaoService.pausar(emp.id); }
                        catch { /* ignore */ }
                      }}>
                      <PauseIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
                <Tooltip title="Cancelar execução">
                  <IconButton size="small" sx={{ color: '#f87171', bgcolor: 'rgba(248,113,113,0.15)', '&:hover': { bgcolor: 'rgba(248,113,113,0.3)' } }}
                    onClick={async () => {
                      if (!window.confirm('Cancelar a execução em andamento? A etapa atual termina, e as próximas serão ignoradas.')) return;
                      try { await perdcompAutomacaoService.cancelar(emp.id); }
                      catch { /* ignore */ }
                    }}>
                    <StopIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Stack>
            </Stack>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: 'white' }}>
              {emp.razao_social}
            </Typography>
            <Typography variant="caption" sx={{ color: '#00c8f0', fontStyle: 'italic', display: 'block', mt: 0.5, fontWeight: 600 }}>
              ➤ {emp.ultima_execucao_msg || 'Iniciando pipeline…'}
            </Typography>
            {/* Dica: 1ª etapa (Playwright/e-CAC) leva 1-3 min normalmente */}
            {etapasPlanejadas[0]?.status === 'em_curso' && elapsed < 180 && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', display: 'block', mt: 0.5 }}>
                ⓘ A consulta no e-CAC envolve autenticação + navegação + leitura das páginas. Normalmente leva 1-3 minutos.
              </Typography>
            )}
          </Box>

          {/* Contagem se múltiplas empresas */}
          {emExec.length > 1 && (
            <Box sx={{ textAlign: 'center', px: 2, borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>
                Em fila
              </Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, color: T.cyan, lineHeight: 1 }}>
                +{emExec.length - 1}
              </Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                empresa(s)
              </Typography>
            </Box>
          )}
        </Box>

        {/* ═══ Pipeline visual: cada etapa com status individual ═══════════ */}
        <Box sx={{
          px: 2.5, pb: 2,
          display: 'flex', alignItems: 'stretch', gap: 1, flexWrap: 'wrap',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          mt: 0.5, pt: 1.5,
        }}>
          {etapasPlanejadas.map((ep, idx) => {
            const isLast = idx === etapasPlanejadas.length - 1;
            const cor =
              ep.status === 'ok' ? '#22c55e' :
              ep.status === 'erro' ? '#ef4444' :
              ep.status === 'parcial' ? '#f59e0b' :
              ep.status === 'em_curso' ? T.cyan :
              ep.status === 'skip' && !ep.ativa ? 'rgba(255,255,255,0.2)' :
              'rgba(255,255,255,0.35)';
            const label =
              ep.status === 'ok' ? 'OK' :
              ep.status === 'erro' ? 'ERRO' :
              ep.status === 'parcial' ? 'PARCIAL' :
              ep.status === 'em_curso' ? 'EXECUTANDO' :
              ep.status === 'skip' && !ep.ativa ? 'DESLIGADO' :
              'AGUARDA';
            return (
              <Box key={ep.chave} sx={{ display: 'flex', alignItems: 'center', flex: '1 1 200px', minWidth: 0 }}>
                <Box sx={{
                  flex: 1, p: 1, borderRadius: 2, minWidth: 0,
                  bgcolor: ep.status === 'em_curso' ? 'rgba(0,200,240,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${ep.status === 'em_curso' ? 'rgba(0,200,240,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  ...(ep.status === 'em_curso' && {
                    animation: 'stageRun 1.6s ease-in-out infinite',
                    '@keyframes stageRun': {
                      '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,200,240,0.6)' },
                      '50%': { boxShadow: '0 0 0 4px rgba(0,200,240,0.1)' },
                    },
                  }),
                }}>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Box sx={{ color: cor, display: 'flex' }}>
                      {ep.status === 'em_curso'
                        ? <CircularProgress size={14} thickness={5} sx={{ color: T.cyan }} />
                        : ep.status === 'ok' ? <OkIcon sx={{ fontSize: 16, color: cor }} />
                        : ep.status === 'erro' ? <ErrIcon sx={{ fontSize: 16, color: cor }} />
                        : ep.icon}
                    </Box>
                    <Box flex={1} minWidth={0}>
                      <Typography variant="caption" sx={{
                        color: 'white', fontWeight: 600, fontSize: '0.7rem',
                        display: 'block', lineHeight: 1.1,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {ep.label}
                      </Typography>
                      <Typography variant="caption" sx={{
                        color: cor, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.5,
                      }}>
                        {label}
                      </Typography>
                    </Box>
                  </Stack>
                  {ep.detalhe && (ep.status === 'ok' || ep.status === 'parcial' || ep.status === 'erro') && (
                    <Typography variant="caption" sx={{
                      display: 'block', mt: 0.25, color: 'rgba(255,255,255,0.6)',
                      fontFamily: 'monospace', fontSize: '0.6rem',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ep.detalhe.substring(0, 50)}{ep.detalhe.length > 50 ? '…' : ''}
                    </Typography>
                  )}
                </Box>
                {!isLast && (
                  <Box sx={{
                    width: 12, height: 1, mx: 0.25,
                    bgcolor: ['ok','erro','parcial','skip'].includes(ep.status) ? T.cyan : 'rgba(255,255,255,0.15)',
                    transition: 'background-color 0.4s',
                  }} />
                )}
              </Box>
            );
          })}
        </Box>
      </Paper>
    );
  }

  // Banners de execuções RECENTES (concluído/erro nas últimas 2h, não dispensadas)
  const recentesNaoDispensados = recentes.filter(e => !dismissedRecent.has(e.id));
  if (recentesNaoDispensados.length === 0) return null;

  return (
    <>
      {recentesNaoDispensados.map(emp => {
        const status = emp.ultima_execucao_status;
        const etapas = parseEtapas(emp.ultima_execucao_msg);
        const algumErro = etapas.some(e => e.status === 'erro');
        const tudoOk = etapas.length > 0 && etapas.every(e => e.status === 'ok' || e.status === 'skip');
        const sev = status === 'erro' || algumErro ? 'error' : tudoOk ? 'success' : 'warning';
        const expanded = !!expandedRecent[emp.id];
        const tempo = emp.ultima_execucao
          ? new Date(emp.ultima_execucao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
          : '';

        const corBorda = sev === 'success' ? T.emerald : sev === 'error' ? '#ef4444' : '#f59e0b';

        return (
          <Paper key={emp.id} sx={{
            mb: 2, borderRadius: 3, overflow: 'hidden',
            border: '1px solid', borderColor: `${corBorda}40`,
            borderLeft: `4px solid ${corBorda}`,
          }}>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{
                width: 36, height: 36, borderRadius: '50%',
                bgcolor: `${corBorda}15`, color: corBorda,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                {sev === 'success' ? <OkIcon /> : sev === 'error' ? <ErrIcon /> : <ErrIcon />}
              </Box>
              <Box flex={1}>
                <Typography variant="caption" sx={{ color: T.textSecond }}>
                  Última execução · {tempo}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy, lineHeight: 1.2 }}>
                  {emp.razao_social}{' '}
                  <Typography component="span" variant="caption" sx={{ color: corBorda, fontWeight: 700, ml: 0.5 }}>
                    · {sev === 'success' ? 'CONCLUÍDA COM SUCESSO' : sev === 'error' ? 'TERMINOU COM ERROS' : 'CONCLUÍDA COM AVISOS'}
                  </Typography>
                </Typography>
              </Box>

              {/* Chips compactos das etapas */}
              <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ maxWidth: 360 }}>
                {etapas.map((et, i) => {
                  const c = et.status === 'ok' ? T.emerald
                    : et.status === 'erro' ? '#ef4444'
                    : et.status === 'parcial' ? '#f59e0b'
                    : '#94a3b8';
                  return (
                    <Tooltip key={i} title={`${et.label}: ${et.detalhe}`}>
                      <Chip
                        size="small"
                        icon={et.icon as any}
                        label={et.chave}
                        sx={{
                          bgcolor: `${c}15`, color: c, fontWeight: 600, height: 22,
                          '& .MuiChip-icon': { color: c, fontSize: 14 },
                        }}
                      />
                    </Tooltip>
                  );
                })}
              </Stack>

              <IconButton size="small" onClick={() => setExpandedRecent(p => ({ ...p, [emp.id]: !expanded }))}>
                {expanded ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
              <IconButton size="small" onClick={() => setDismissedRecent(p => { const n = new Set(p); n.add(emp.id); return n; })}>
                <CancelIcon fontSize="small" sx={{ color: T.textSecond }} />
              </IconButton>
            </Box>

            {/* Detalhes expandidos */}
            {expanded && (
              <Box sx={{ px: 2, pb: 2, bgcolor: '#f8fafc' }}>
                <Stack spacing={1}>
                  {etapas.map((et, i) => {
                    const c = et.status === 'ok' ? T.emerald
                      : et.status === 'erro' ? '#ef4444'
                      : et.status === 'parcial' ? '#f59e0b'
                      : '#94a3b8';
                    return (
                      <Stack key={i} direction="row" alignItems="center" gap={1.5}>
                        <Box sx={{ color: c }}>{et.icon}</Box>
                        <Box flex={1}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>
                            {et.label}
                          </Typography>
                          <Typography variant="caption" sx={{ color: T.textSecond, fontFamily: 'monospace' }}>
                            {et.detalhe}
                          </Typography>
                        </Box>
                        <Chip size="small" label={et.status.toUpperCase()}
                          sx={{ bgcolor: `${c}20`, color: c, fontWeight: 700, fontSize: '0.65rem', height: 18 }} />
                      </Stack>
                    );
                  })}
                </Stack>
              </Box>
            )}
          </Paper>
        );
      })}
    </>
  );
}

export default function ConfiguracoesPage() {
  const { empresaId: empresaSelecionadaId } = useEmpresa();
  const [loading, setLoading] = useState(true);
  const [global, setGlobal] = useState<AutomacaoConfigGlobal | null>(null);
  const [empresas, setEmpresas] = useState<AutomacaoConfigEmpresa[]>([]);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [busca, setBusca] = useState('');
  const [executandoGlobal, setExecutandoGlobal] = useState(false);
  const [executandoEmpresaId, setExecutandoEmpresaId] = useState<number | null>(null);

  // Seleção MULTI-empresa local (substitui o filtro único do context global).
  // Inicialmente segue a empresa selecionada na LOV global; user pode trocar/expandir.
  // Vazio = "todas" (modo coletivo). Lista = só as escolhidas.
  const [empresasSelecionadasIds, setEmpresasSelecionadasIds] = useState<number[]>([]);
  // Hidrata quando o context global carrega ou muda
  useEffect(() => {
    if (empresaSelecionadaId) setEmpresasSelecionadasIds([Number(empresaSelecionadaId)]);
    else setEmpresasSelecionadasIds([]);
  }, [empresaSelecionadaId]);

  // Fila de execução: ordem dos IDs a processar + ID atualmente em execução.
  // status: 'idle' | 'em_curso' (cancelable a qualquer momento)
  type FilaStatus = 'idle' | 'em_curso' | 'cancelando';
  const [filaStatus, setFilaStatus] = useState<FilaStatus>('idle');
  const [filaIds, setFilaIds] = useState<number[]>([]);
  const [filaPosAtual, setFilaPosAtual] = useState<number>(-1);
  const filaCancelRef = useRef<boolean>(false);
  const [resumoFila, setResumoFila] = useState<Record<number, 'pendente' | 'em_execucao' | 'concluido' | 'erro'>>({});

  // Registra atividade global enquanto a fila roda — o MainLayout consulta isso
  // para travar o drawer aberto e mostrar o badge "EM EXECUÇÃO".
  const { setActive } = useActivity();
  useEffect(() => {
    if (filaStatus === 'em_curso') {
      const total = filaIds.length;
      const pos = filaPosAtual >= 0 ? filaPosAtual + 1 : 0;
      setActive('perdcomp-fila-agendamento', true, `Atualizando ${pos}/${total} empresa(s)`);
    } else {
      setActive('perdcomp-fila-agendamento', false);
    }
  }, [filaStatus, filaPosAtual, filaIds.length, setActive]);
  // Cleanup ao desmontar
  useEffect(() => () => setActive('perdcomp-fila-agendamento', false), [setActive]);

  // Ref para o intervalo de polling, gerenciado nos efeitos.
  const pollRef = useRef<number | null>(null);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true);
    setErro('');
    try {
      const data = await perdcompAutomacaoService.obterConfig();
      setGlobal(data.global);
      setEmpresas(data.empresas);
    } catch (e: any) {
      if (!silencioso) setErro(e.response?.data?.error || 'Erro ao carregar configurações');
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // Polling enquanto houver empresas com status "em_andamento" — recarrega config a cada 1.5s
  // para captar evolução rápida (pipelines podem terminar em poucos segundos quando há erro).
  const temEmAndamento = empresas.some(e => e.ultima_execucao_status === 'em_andamento');
  useEffect(() => {
    if (!temEmAndamento) {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    pollRef.current = window.setInterval(() => { carregar(true); }, 1500);
    return () => { if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; } };
  }, [temEmAndamento, carregar]);

  // "Ping" polling após executar agora: faz 6 chamadas rápidas (cada 800ms) para garantir
  // que detectamos o estado em_andamento mesmo se o pipeline for muito rápido.
  // Resolve o problema de "cliquei mas não vejo nada acontecendo".
  const pingPolling = useCallback(async () => {
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 800));
      await carregar(true);
    }
  }, [carregar]);

  // Atualização otimista da flag — atualiza UI e persiste em background
  const handleToggleFlag = async (idEmpresa: number, field: keyof AutomacaoConfigEmpresa, value: boolean) => {
    const novaLista = empresas.map(e => e.id === idEmpresa ? { ...e, [field]: value } : e);
    setEmpresas(novaLista);
    const emp = novaLista.find(e => e.id === idEmpresa);
    if (!emp) return;
    try {
      await perdcompAutomacaoService.atualizarEmpresa(idEmpresa, {
        sync_documentos_ativo: emp.sync_documentos_ativo,
        baixar_recibos_ativo: emp.baixar_recibos_ativo,
        baixar_documentos_ativo: emp.baixar_documentos_ativo,
        sync_saldos_ativo: emp.sync_saldos_ativo,
      });
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Falha ao salvar — recarregando');
      // Rollback: recarrega do servidor
      carregar();
    }
  };

  // Auto-save da config global: persiste no backend (e reagenda o cron) sempre que
  // o usuário muda o switch ativo ou o horário. Debounce para o horário (evita salvar
  // a cada keystroke do TimePicker) e atualização imediata para o switch.
  const debounceTimer = useRef<number | null>(null);
  const ultimaConfigSalvaRef = useRef<{ ativo: boolean; horario_diario: string } | null>(null);
  useEffect(() => {
    if (!global) return;
    // Snapshot inicial (não dispara save no primeiro carregamento)
    if (ultimaConfigSalvaRef.current === null) {
      ultimaConfigSalvaRef.current = { ativo: global.ativo, horario_diario: global.horario_diario };
      return;
    }
    const last = ultimaConfigSalvaRef.current;
    if (last.ativo === global.ativo && last.horario_diario === global.horario_diario) return;

    if (debounceTimer.current) window.clearTimeout(debounceTimer.current);
    debounceTimer.current = window.setTimeout(async () => {
      try {
        await perdcompAutomacaoService.atualizarGlobal({
          ativo: global.ativo,
          horario_diario: global.horario_diario,
        });
        ultimaConfigSalvaRef.current = { ativo: global.ativo, horario_diario: global.horario_diario };
        setSucesso(global.ativo
          ? `✓ Agendamento ativo — executará diariamente às ${global.horario_diario}`
          : '✓ Agendamento desativado');
      } catch (e: any) {
        setErro(e.response?.data?.error || 'Falha ao salvar configuração global');
      }
    }, 600);
    return () => { if (debounceTimer.current) window.clearTimeout(debounceTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [global?.ativo, global?.horario_diario]);

  const handleExecutarAgoraEmpresa = async (idEmpresa: number) => {
    setExecutandoEmpresaId(idEmpresa);
    setErro(''); setSucesso('');
    // Marca OTIMISTICAMENTE antes da chamada — usuário vê o banner imediatamente
    setEmpresas(prev => prev.map(e => e.id === idEmpresa
      ? { ...e, ultima_execucao_status: 'em_andamento' as any, ultima_execucao: new Date().toISOString(), ultima_execucao_msg: 'Disparando…' }
      : e));
    try {
      const r = await perdcompAutomacaoService.executarAgora(idEmpresa);
      setSucesso(r.message);
      // Polling rápido para captar o real estado do backend
      pingPolling();
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Falha ao disparar execução');
      // Rollback do estado otimista
      carregar(true);
    } finally {
      setExecutandoEmpresaId(null);
    }
  };

  const handleExecutarAgoraTodas = async () => {
    setExecutandoGlobal(true);
    setErro(''); setSucesso('');
    // Quando há uma empresa selecionada na LOV global, o escopo da página é dela.
    // Nesse caso só executamos ESSA empresa — sem isso, o backend rodaria todas
    // as empresas com flags ativas, gerando cross-processing visual ("selecionei A,
    // mas processou B também").
    const idAlvo: number | null = empresaSelecionadaId ? Number(empresaSelecionadaId) : null;

    // Marca otimisticamente como "em_andamento" só as que serão executadas
    setEmpresas(prev => prev.map(e => {
      if (idAlvo != null && e.id !== idAlvo) return e;
      const algumaAtiva = e.sync_documentos_ativo || e.baixar_recibos_ativo
        || e.baixar_documentos_ativo || e.sync_saldos_ativo;
      if (!algumaAtiva || !e.tem_certificado_ativo) return e;
      return {
        ...e,
        ultima_execucao_status: 'em_andamento' as any,
        ultima_execucao: new Date().toISOString(),
        ultima_execucao_msg: 'Disparando…',
      };
    }));
    try {
      const r = await perdcompAutomacaoService.executarAgora(idAlvo);
      setSucesso(r.message);
      pingPolling();
    } catch (e: any) {
      setErro(e.response?.data?.error || 'Falha ao disparar execução');
      carregar(true);
    } finally {
      setExecutandoGlobal(false);
    }
  };

  // ESCOPO da página: vem do multi-select LOCAL (checkbox).
  //   - lista vazia = todas as empresas (modo coletivo, igual ao botão "Executar todas")
  //   - lista com IDs = só essas empresas
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

  // ── Fila de execução ────────────────────────────────────────────────────────
  // Dispara executarAgora(id) sequencialmente para cada empresa selecionada.
  // Sequencial (não paralelo) porque:
  //   - O e-CAC tem rate limiting agressivo; várias auths simultâneas detonam o WAF.
  //   - O guard `empresasEmExecucao` no backend rejeita duplicatas para a MESMA empresa,
  //     mas múltiplas empresas em paralelo competiriam pelo browser/Playwright e pool DB.
  const iniciarFila = useCallback(async () => {
    const ids = empresasEscopo
      .filter(e => e.tem_certificado_ativo && (
        e.sync_documentos_ativo || e.baixar_recibos_ativo ||
        e.baixar_documentos_ativo || e.sync_saldos_ativo
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
        await perdcompAutomacaoService.executarAgora(id);
        // Espera o backend reportar conclusão (ou erro) antes de seguir
        // — polling a cada 1.5s, bate o config e checa ultima_execucao_status.
        while (true) {
          if (filaCancelRef.current) break;
          await new Promise(r => setTimeout(r, 1500));
          const data = await perdcompAutomacaoService.obterConfig();
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
    setFilaStatus(prev => prev === 'cancelando' ? 'idle' : 'idle');
    setSucesso((s) => s || 'Fila concluída.');
  }, [empresasEscopo]);

  const cancelarFila = useCallback(() => {
    filaCancelRef.current = true;
    setFilaStatus('cancelando');
  }, []);

  // Resumo: total de empresas com pelo menos uma flag ativa (dentro do escopo selecionado)
  const empresasComFlag = empresasEscopo.filter(e =>
    e.sync_documentos_ativo || e.baixar_recibos_ativo || e.baixar_documentos_ativo || e.sync_saldos_ativo
  ).length;

  return (
    <Box>
      <Box mb={3}>
        <Typography variant="h4" sx={{ fontWeight: 700, color: T.navy }}>
          Agendamento/Atualização
        </Typography>
        <Typography variant="body2" sx={{ color: T.textSecond }}>
          Defina o agendamento por empresa e dispare atualizações sob demanda. Use o seletor abaixo para escolher
          uma, várias ou todas as empresas; a fila processa cada uma sequencialmente.
        </Typography>
      </Box>

      {erro && <Alert severity="error" onClose={() => setErro('')} sx={{ mb: 2 }}>{erro}</Alert>}
      {sucesso && <Alert severity="success" onClose={() => setSucesso('')} sx={{ mb: 2 }}>{sucesso}</Alert>}

      <ExecutionTracker empresas={empresasEscopo} />

      {/* Alerta especial quando há empresa com sessão e-CAC expirada — destaca a ação concreta */}
      {empresasEscopo.some(e => e.ultima_execucao_status === 'erro' && /[Ss]ess[aã]o.*(expirada|inv[aá]lida)/i.test(e.ultima_execucao_msg || '')) && (
        <Alert
          severity="warning"
          icon={<KeyIcon />}
          action={
            <Button color="warning" variant="contained" size="small"
              onClick={() => window.open('/configuracoes/certificados', '_blank')}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '8px', whiteSpace: 'nowrap' }}>
              Ir para Certificados →
            </Button>
          }
          sx={{ mb: 2, borderRadius: 3, alignItems: 'center' }}
        >
          <strong>Sessão e-CAC expirada</strong> para{' '}
          {empresasEscopo
            .filter(e => e.ultima_execucao_status === 'erro' && /[Ss]ess[aã]o.*(expirada|inv[aá]lida)/i.test(e.ultima_execucao_msg || ''))
            .map(e => e.razao_social.split(' ').slice(0, 3).join(' '))
            .join(', ')}
          . Re-autentique o certificado digital para a automação voltar a funcionar.
        </Alert>
      )}

      {/* ═══ Seletor multi-empresa (checkbox) + Fila ═══════════════════════════ */}
      <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3, border: `1px solid ${T.cyan}33` }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ xs: 'stretch', md: 'flex-end' }}>
          <Autocomplete
            multiple
            disableCloseOnSelect
            sx={{ flex: 1, minWidth: 320 }}
            options={empresas}
            value={empresas.filter(e => empresasSelecionadasIds.includes(e.id))}
            onChange={(_, val) => setEmpresasSelecionadasIds(val.map(v => v.id))}
            getOptionLabel={(o) => `${o.razao_social} — ${o.cnpj}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderOption={(props, option, { selected }) => (
              <li {...props} key={option.id}>
                <Checkbox
                  icon={<CheckEmptyIcon fontSize="small" />}
                  checkedIcon={<CheckIcon fontSize="small" />}
                  style={{ marginRight: 8 }}
                  checked={selected}
                />
                <Box>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>{option.razao_social}</Typography>
                  <Typography variant="caption" sx={{ color: T.textSecond }}>{option.cnpj}</Typography>
                </Box>
              </li>
            )}
            renderInput={(params) => (
              <TextField {...params} label={
                empresasSelecionadasIds.length === 0
                  ? 'Todas as empresas (clique para selecionar)'
                  : `${empresasSelecionadasIds.length} empresa(s) selecionada(s)`
              } size="small" placeholder="Buscar empresa..." />
            )}
          />
          <Stack direction="row" gap={1}>
            <Button size="small" variant="outlined"
              onClick={() => setEmpresasSelecionadasIds(empresas.map(e => e.id))}
              disabled={empresas.length === 0}
              sx={{ textTransform: 'none', borderRadius: '8px' }}>
              Marcar todas
            </Button>
            <Button size="small" variant="outlined"
              onClick={() => setEmpresasSelecionadasIds([])}
              disabled={empresasSelecionadasIds.length === 0}
              sx={{ textTransform: 'none', borderRadius: '8px' }}>
              Limpar
            </Button>
          </Stack>
          <Divider orientation="vertical" flexItem sx={{ display: { xs: 'none', md: 'block' } }} />
          {filaStatus === 'idle' ? (
            <Button variant="contained" startIcon={<PlayIcon />} onClick={iniciarFila}
              disabled={empresasEscopo.length === 0}
              sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, textTransform: 'none', fontWeight: 600, borderRadius: '10px', minWidth: 200 }}>
              Atualizar {empresasSelecionadasIds.length === 0 ? 'todas' : `${empresasEscopo.length} empresa(s)`}
            </Button>
          ) : (
            <Button variant="contained" color="error" startIcon={<StopIcon />} onClick={cancelarFila}
              disabled={filaStatus === 'cancelando'}
              sx={{ textTransform: 'none', fontWeight: 600, borderRadius: '10px', minWidth: 200 }}>
              {filaStatus === 'cancelando' ? 'Cancelando…' : 'Cancelar fila'}
            </Button>
          )}
        </Stack>
      </Paper>

      {/* ═══ Fila visual ═════════════════════════════════════════════════════ */}
      {filaIds.length > 0 && (
        <Paper sx={{ p: 2.5, borderRadius: 3, mb: 3, border: `1px solid ${T.cyan}33` }}>
          <Stack direction="row" alignItems="center" gap={1} mb={1.5}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>
              Fila de execução
            </Typography>
            <Chip size="small" label={`${filaPosAtual >= 0 ? filaPosAtual + 1 : filaIds.length}/${filaIds.length}`} sx={{ bgcolor: T.cyan + '22', color: T.cyan, fontWeight: 700 }} />
            <Box sx={{ flex: 1 }} />
            {filaStatus === 'em_curso' && <Chip size="small" label="EM CURSO" sx={{ bgcolor: T.cyan + '22', color: T.cyan, fontWeight: 700 }} icon={<CircularProgress size={10} sx={{ color: T.cyan }} />} />}
          </Stack>
          <Stack gap={1}>
            {filaIds.map((id, idx) => {
              const emp = empresas.find(e => e.id === id);
              const status = resumoFila[id] || 'pendente';
              const isAtual = idx === filaPosAtual && filaStatus === 'em_curso';
              const corBorda = status === 'em_execucao' ? T.cyan
                : status === 'concluido' ? T.emerald
                : status === 'erro' ? '#ef4444'
                : '#e2e8f0';
              const icone = status === 'em_execucao' ? <CircularProgress size={16} sx={{ color: T.cyan }} />
                : status === 'concluido' ? <OkIcon sx={{ color: T.emerald, fontSize: 18 }} />
                : status === 'erro' ? <ErrIcon sx={{ color: '#ef4444', fontSize: 18 }} />
                : <PendingIcon sx={{ color: '#94a3b8', fontSize: 18 }} />;
              return (
                <Paper key={id} variant="outlined" sx={{
                  p: 1.5, borderRadius: 2, borderColor: corBorda, borderWidth: isAtual ? 2 : 1,
                  bgcolor: isAtual ? T.cyan + '08' : 'white',
                }}>
                  <Stack direction="row" alignItems="center" gap={1.5}>
                    <Box sx={{ minWidth: 24, textAlign: 'center' }}>{icone}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Typography variant="body2" sx={{ fontWeight: 700, color: T.navy }}>
                          #{idx + 1} · {emp?.razao_social || `Empresa ${id}`}
                        </Typography>
                        <Typography variant="caption" sx={{ color: T.textSecond }}>{emp?.cnpj}</Typography>
                      </Stack>
                      {/* Mensagem ao vivo da etapa atual (vem do backend via ultima_execucao_msg) */}
                      {status === 'em_execucao' && emp?.ultima_execucao_msg && (
                        <Typography variant="caption" sx={{
                          display: 'block', color: T.cyan, fontFamily: 'monospace', mt: 0.5,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }} title={emp.ultima_execucao_msg}>
                          ▸ {emp.ultima_execucao_msg}
                        </Typography>
                      )}
                      {status === 'erro' && emp?.ultima_execucao_msg && (
                        <Typography variant="caption" sx={{ display: 'block', color: '#ef4444', mt: 0.5 }}>
                          ✗ {emp.ultima_execucao_msg.slice(0, 200)}
                        </Typography>
                      )}
                      {status === 'concluido' && (
                        <Typography variant="caption" sx={{ display: 'block', color: T.emerald, mt: 0.5 }}>
                          ✓ Atualização concluída
                        </Typography>
                      )}
                      {status === 'pendente' && (
                        <Typography variant="caption" sx={{ display: 'block', color: T.textSecond, mt: 0.5 }}>
                          aguardando na fila…
                        </Typography>
                      )}
                    </Box>
                    {isAtual && (
                      <Chip size="small" label="EXECUTANDO" sx={{ bgcolor: T.cyan, color: 'white', fontWeight: 700, fontSize: 10 }} />
                    )}
                  </Stack>
                </Paper>
              );
            })}
          </Stack>
        </Paper>
      )}

      {loading || !global ? (
        <Box display="flex" justifyContent="center" py={8}>
          <CircularProgress sx={{ color: T.cyan }} />
        </Box>
      ) : (
        <>
          {/* ═══ Configuração GLOBAL ═══════════════════════════════════════════ */}
          <Paper sx={{ p: 3, borderRadius: 3, mb: 3 }}>
            <Stack direction="row" alignItems="center" gap={1.5} mb={2}>
              <AutoIcon sx={{ color: T.cyan }} />
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>
                  Configuração geral do agendamento
                </Typography>
                <Typography variant="caption" sx={{ color: T.textSecond }}>
                  Define se a automação está ativa e em qual horário diário rodar.
                </Typography>
              </Box>
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} gap={3} alignItems={{ xs: 'stretch', sm: 'center' }} flexWrap="wrap">
              <FormControlLabel
                control={
                  <Switch
                    checked={global.ativo}
                    onChange={(e) => setGlobal({ ...global, ativo: e.target.checked })}
                    sx={{
                      '& .MuiSwitch-switchBase.Mui-checked': { color: T.emerald },
                      '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { backgroundColor: T.emerald },
                    }}
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Automação {global.ativo ? 'ATIVA' : 'desativada'}
                    </Typography>
                    <Typography variant="caption" sx={{ color: T.textSecond }}>
                      {global.ativo ? 'Rodará todo dia no horário configurado' : 'Nenhuma execução automática'}
                    </Typography>
                  </Box>
                }
              />

              <TextField
                label="Horário diário"
                type="time"
                size="small"
                value={global.horario_diario}
                onChange={(e) => setGlobal({ ...global, horario_diario: e.target.value })}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><AccessTime fontSize="small" /></InputAdornment>,
                }}
                sx={{ width: 180 }}
                inputProps={{ step: 300 }}
              />

              <Box sx={{ flex: 1 }} />

              <Stack direction="row" gap={1} alignItems="center">
                <Tooltip title="As mudanças nos switches e horário são salvas automaticamente — não precisa clicar em nada">
                  <Typography variant="caption" sx={{ color: T.textSecond, fontStyle: 'italic' }}>
                    ✓ Salva automaticamente
                  </Typography>
                </Tooltip>
                <Tooltip title={
                  temEmAndamento ? 'Aguarde as execuções em andamento concluírem'
                  : empresasComFlag === 0
                    ? 'Ative pelo menos um fluxo (Documentos, Recibos, PDF ou Saldos) na linha da empresa para habilitar a execução'
                    : 'Executa agora todas as empresas com flags ativas (sem esperar o horário)'
                }>
                  <span>
                    <Button
                      variant="contained"
                      startIcon={(executandoGlobal || temEmAndamento) ? <CircularProgress size={16} sx={{ color: 'white' }} /> : <PlayIcon />}
                      onClick={handleExecutarAgoraTodas}
                      disabled={executandoGlobal || temEmAndamento || empresasComFlag === 0}
                      sx={{ bgcolor: T.cyan, '&:hover': { bgcolor: T.cyanHover }, textTransform: 'none', fontWeight: 600, borderRadius: '10px' }}
                    >
                      {temEmAndamento ? 'Em execução…' : `Executar agora (${empresasComFlag})`}
                    </Button>
                  </span>
                </Tooltip>
              </Stack>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" gap={3} flexWrap="wrap">
              <Box>
                <Typography variant="caption" sx={{ color: T.textSecond }}>Empresas com automação</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: T.navy }}>
                  {empresasComFlag} <Typography component="span" variant="body2" sx={{ color: T.textSecond }}>de {empresas.length}</Typography>
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: T.textSecond }}>Próxima execução</Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, color: T.navy }}>
                  {global.ativo ? `Diariamente às ${global.horario_diario}` : '—'}
                </Typography>
              </Box>
            </Stack>
          </Paper>

          {/* Hint quando nenhuma empresa do escopo tem flags ativas — ajuda usuário novo */}
          {empresasEscopo.length > 0 && empresasComFlag === 0 && (
            <Alert severity="info" icon={<AutoIcon />} sx={{ mb: 2, borderRadius: 3 }}>
              <strong>Nenhum fluxo automático ativo</strong> nesta empresa.
              Marque pelo menos um dos toggles na tabela abaixo (<em>Documentos</em>, <em>Recibos</em>,
              <em> PDF Completo</em> ou <em>Saldos</em>) para habilitar a execução automática e o botão "Executar agora".
            </Alert>
          )}

          {/* ═══ Configuração POR EMPRESA ═══════════════════════════════════════ */}
          <Paper sx={{ borderRadius: 3, overflow: 'hidden' }}>
            <Box sx={{ p: 2, borderBottom: '1px solid', borderColor: 'divider', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
              <Box>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: T.navy }}>
                  Empresas e fluxos automáticos
                </Typography>
                <Typography variant="caption" sx={{ color: T.textSecond }}>
                  Marque por empresa quais fluxos devem rodar no horário configurado.
                </Typography>
              </Box>
              <Stack direction="row" gap={1} alignItems="center">
                <TextField
                  size="small"
                  placeholder="Filtrar por nome ou CNPJ…"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
                  sx={{ minWidth: 280 }}
                />
                <IconButton size="small" onClick={() => carregar()} sx={{ color: T.cyan }}>
                  <Refresh />
                </IconButton>
              </Stack>
            </Box>

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond }}>Empresa</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: T.textSecond }}>
                      <Tooltip title="Sincroniza a lista de PER/DCOMPs no e-CAC (extração de metadados)">
                        <span>📋 Documentos</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: T.textSecond }}>
                      <Tooltip title="Baixa os PDFs dos recibos pendentes">
                        <span>🧾 Recibos</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: T.textSecond }}>
                      <Tooltip title="Baixa os PDFs completos dos documentos (5+ páginas)">
                        <span>📄 PDF Completo</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: T.textSecond }}>
                      <Tooltip title="Recalcula saldos consolidados a partir dos recibos parseados">
                        <span>💰 Saldos</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: T.textSecond }}>Última execução</TableCell>
                    <TableCell align="center" sx={{ fontWeight: 700, color: T.textSecond }}>Ações</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {empresasFiltradas.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} align="center" sx={{ py: 4, color: T.textSecond }}>
                        {empresas.length === 0 ? 'Nenhuma empresa cadastrada.' : 'Nenhum resultado para o filtro.'}
                      </TableCell>
                    </TableRow>
                  ) : empresasFiltradas.map(emp => {
                    const semCertificado = !emp.tem_certificado_ativo;
                    const semSessao = !emp.tem_sessao_ecac;
                    // Detecta sessão EXPIRADA pela última msg de erro — o backend só sabe
                    // que expirou ao tentar usar, e essa info fica na ultima_execucao_msg.
                    const sessaoExpiradaDetectada = emp.ultima_execucao_status === 'erro'
                      && /[Ss]ess[aã]o.*(expirada|inv[aá]lida)/i.test(emp.ultima_execucao_msg || '');
                    const algumaAtiva = emp.sync_documentos_ativo || emp.baixar_recibos_ativo
                      || emp.baixar_documentos_ativo || emp.sync_saldos_ativo;
                    const executando = emp.ultima_execucao_status === 'em_andamento';
                    return (
                      <TableRow
                        key={emp.id}
                        hover
                        sx={{
                          position: 'relative',
                          ...(executando && {
                            // Highlight da linha enquanto está rodando
                            bgcolor: 'rgba(0,200,240,0.06)',
                            // Borda lateral animada
                            boxShadow: 'inset 3px 0 0 0 #00c8f0',
                            animation: 'rowPulse 2.5s ease-in-out infinite',
                            '@keyframes rowPulse': {
                              '0%, 100%': { bgcolor: 'rgba(0,200,240,0.06)' },
                              '50%': { bgcolor: 'rgba(0,200,240,0.14)' },
                            },
                          }),
                        }}
                      >
                        <TableCell>
                          <Stack direction="row" alignItems="center" gap={1}>
                            {/* Spinner inline indicando processamento ativo */}
                            {executando && (
                              <CircularProgress size={14} thickness={5} sx={{ color: T.cyan }} />
                            )}
                            <Box>
                              <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy, lineHeight: 1.2 }}>
                                {emp.razao_social}
                              </Typography>
                              <Typography variant="caption" sx={{ color: T.textSecond, fontFamily: 'monospace' }}>
                                {emp.cnpj}
                              </Typography>
                              {executando && (
                                <Typography variant="caption" sx={{ display: 'block', color: T.cyan, fontStyle: 'italic', fontWeight: 600, mt: 0.25 }}>
                                  ⏳ {emp.ultima_execucao_msg ? emp.ultima_execucao_msg.substring(0, 60) + (emp.ultima_execucao_msg.length > 60 ? '…' : '') : 'Processando…'}
                                </Typography>
                              )}
                            </Box>
                            {semCertificado && (
                              <Tooltip title="Empresa sem certificado digital ativo — automação não vai funcionar">
                                <KeyIcon sx={{ fontSize: 16, color: '#ef4444' }} />
                              </Tooltip>
                            )}
                            {!semCertificado && semSessao && (
                              <Tooltip title="Sessão e-CAC não autenticada — autentique antes na aba Certificados">
                                <KeyIcon sx={{ fontSize: 16, color: '#f59e0b' }} />
                              </Tooltip>
                            )}
                            {!semCertificado && !semSessao && sessaoExpiradaDetectada && (
                              <Tooltip title='⚠ Sessão e-CAC EXPIROU — clique no ícone para ir aos Certificados e re-autenticar'>
                                <IconButton size="small"
                                  onClick={() => window.open('/configuracoes/certificados', '_blank')}
                                  sx={{ p: 0.25, color: '#ef4444' }}>
                                  <KeyIcon sx={{ fontSize: 16 }} />
                                </IconButton>
                              </Tooltip>
                            )}
                          </Stack>
                          {/* Barra indeterminate sob a linha em execução */}
                          {executando && (
                            <LinearProgress
                              sx={{
                                mt: 0.75, height: 2, borderRadius: 1,
                                bgcolor: 'rgba(0,200,240,0.15)',
                                '& .MuiLinearProgress-bar': { bgcolor: T.cyan },
                              }}
                            />
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <FlagCell emp={emp} field="sync_documentos_ativo" disabled={semCertificado || executando} onChange={handleToggleFlag} />
                        </TableCell>
                        <TableCell align="center">
                          <FlagCell emp={emp} field="baixar_recibos_ativo" disabled={semCertificado || executando} onChange={handleToggleFlag} />
                        </TableCell>
                        <TableCell align="center">
                          <FlagCell emp={emp} field="baixar_documentos_ativo" disabled={semCertificado || executando} onChange={handleToggleFlag} />
                        </TableCell>
                        <TableCell align="center">
                          <FlagCell emp={emp} field="sync_saldos_ativo" disabled={semCertificado || executando} onChange={handleToggleFlag} />
                        </TableCell>
                        <TableCell>
                          <StatusUltimaExecucao emp={emp} />
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title={
                            executando ? 'Em execução…'
                            : semCertificado ? 'Empresa sem certificado'
                            : !algumaAtiva ? 'Nenhuma flag ativa'
                            : 'Executar agora (ignora o agendamento)'
                          }>
                            <span>
                              <IconButton
                                size="small"
                                disabled={executando || semCertificado || !algumaAtiva || executandoEmpresaId === emp.id}
                                onClick={() => handleExecutarAgoraEmpresa(emp.id)}
                                sx={{ color: T.cyan }}
                              >
                                {executando || executandoEmpresaId === emp.id
                                  ? <CircularProgress size={16} sx={{ color: T.cyan }} />
                                  : <PlayIcon fontSize="small" />}
                              </IconButton>
                            </span>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </>
      )}
    </Box>
  );
}
