/**
 * Banner inteligente de execução em andamento — reutilizável entre os módulos
 * (PER/DCOMP, DCTFweb e quaisquer outros que tenham pipelines multi-etapa).
 *
 * Mostra:
 *   • Durante execução: anel circular com %, timer, etapa atual,
 *     pipeline visual (4 cards lado-a-lado) e mensagem ao vivo.
 *   • Após conclusão: post-mortem expansível com detalhe de cada etapa.
 *
 * Como usar:
 *   <ExecutionTracker
 *     entities={empresas}
 *     steps={[
 *       { chave: 'sync_decl', label: 'Declarações', icon: <DocIcon />, flag: 'sync_declaracoes_ativo' },
 *       { chave: 'recibos',   label: 'Recibos PDF',  icon: <ReceiptIcon />, flag: 'baixar_recibos_ativo' },
 *       …
 *     ]}
 *     productLabel="DCTFweb"
 *     productExpectationText="A consulta no e-CAC envolve autenticação + navegação."
 *   />
 *
 * Cada item de `entities` precisa ter ao menos:
 *   id, label, ultima_execucao_status, ultima_execucao, ultima_execucao_msg,
 *   e os booleanos das flags (lidos pelo nome em `step.flag`).
 */
import { useEffect, useState, type ReactNode } from 'react';
import {
  Paper, Box, Stack, Typography, Chip, Tooltip, IconButton,
  CircularProgress, LinearProgress,
} from '@mui/material';
import {
  CheckCircle as OkIcon, ErrorOutline as ErrIcon,
  ExpandMore as ExpandMoreIcon, ExpandLess as ExpandLessIcon,
  Cancel as CancelIcon, PlayArrow as PlayIcon, Pause as PauseIcon, Stop as StopIcon,
} from '@mui/icons-material';

const T = { navy: '#0a1628', cyan: '#00c8f0', textSecond: '#64748b', emerald: '#22c55e' };

export interface ExecutionStep<E> {
  chave: string;          // chave usada no parser da `ultima_execucao_msg` (ex: 'sync_decl')
  label: string;          // nome amigável
  icon: ReactNode;        // ícone visual
  flag: keyof E;          // nome do booleano em `entities[i]` que indica "etapa ativa"
  peso?: number;          // peso relativo no progresso geral (default 1)
}

export interface ExecutionEntity {
  id: number;
  label: string;
  ultima_execucao_status: 'em_andamento' | 'concluido' | 'erro' | null;
  ultima_execucao: string | null;
  ultima_execucao_msg: string | null;
  [key: string]: any;
}

export interface ExecutionControls {
  onPause?: (id: number) => void | Promise<void>;
  onResume?: (id: number) => void | Promise<void>;
  onCancel?: (id: number) => void | Promise<void>;
}

interface Props<E extends ExecutionEntity> {
  entities: E[];
  steps: ExecutionStep<E>[];
  productLabel?: string;                 // ex: "PER/DCOMP", "DCTFweb"
  productExpectationText?: string;        // dica mostrada nos primeiros 3 min da 1ª etapa
  controls?: ExecutionControls;
}

interface EtapaParsed { chave: string; status: 'ok' | 'erro' | 'skip' | 'parcial'; detalhe: string; }

function parseEtapas(msg: string | null): EtapaParsed[] {
  if (!msg) return [];
  const partes = msg.split(' | ').map(p => p.trim()).filter(Boolean);
  const out: EtapaParsed[] = [];
  for (const p of partes) {
    const m = p.match(/^([\w_]+):\s*(.*)$/);
    if (!m) continue;
    const detalhe = m[2];
    const upper = detalhe.toUpperCase();
    let status: EtapaParsed['status'];
    if (upper.startsWith('OK') || /^\d+ criados|^\d+\/\d+ baixados/.test(detalhe)) {
      if (/^0\/\d+/.test(detalhe) || /^0 criados, 0/.test(detalhe)) status = 'parcial';
      else status = 'ok';
    } else if (upper.startsWith('ERRO') || upper.startsWith('EXCEPTION')) {
      status = 'erro';
    } else if (detalhe.toLowerCase().includes('nada pendente') || upper.startsWith('SKIP')) {
      status = 'skip';
    } else {
      status = 'ok';
    }
    out.push({ chave: m[1], status, detalhe });
  }
  return out;
}

export function ExecutionTracker<E extends ExecutionEntity>({
  entities, steps, productLabel = 'pipeline', productExpectationText, controls,
}: Props<E>) {
  const emExec = entities.filter(e => e.ultima_execucao_status === 'em_andamento');
  const duasHorasAtras = Date.now() - 2 * 60 * 60 * 1000;
  const recentes = entities.filter(e =>
    e.ultima_execucao_status &&
    e.ultima_execucao_status !== 'em_andamento' &&
    e.ultima_execucao && new Date(e.ultima_execucao).getTime() > duasHorasAtras
  );

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (emExec.length === 0) return;
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [emExec.length]);
  void tick;

  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  // ── Banner ATIVO ────────────────────────────────────────────────────────────
  if (emExec.length > 0) {
    const ent = emExec[0];
    const elapsed = ent.ultima_execucao
      ? Math.max(0, Math.floor((Date.now() - new Date(ent.ultima_execucao).getTime()) / 1000))
      : 0;
    const elapsedStr = `${Math.floor(elapsed / 60).toString().padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

    interface EtapaPlano {
      chave: string; label: string; icon: ReactNode; ativa: boolean;
      status: 'pendente' | 'em_curso' | 'ok' | 'erro' | 'skip' | 'parcial';
      detalhe?: string; peso: number;
    }
    const etapasPlanejadas: EtapaPlano[] = steps.map(s => ({
      chave: s.chave, label: s.label, icon: s.icon,
      ativa: Boolean(ent[s.flag as string]),
      status: 'pendente', peso: s.peso ?? 1,
    }));

    const parsed = parseEtapas(ent.ultima_execucao_msg);
    const concluidasMap = new Map(parsed.map(p => [p.chave, p]));
    let achouEmCurso = false;
    for (const ep of etapasPlanejadas) {
      if (!ep.ativa) { ep.status = 'skip'; continue; }
      const c = concluidasMap.get(ep.chave);
      if (c) {
        ep.status = c.status === 'ok' ? 'ok' : c.status === 'erro' ? 'erro' : c.status === 'parcial' ? 'parcial' : c.status === 'skip' ? 'skip' : 'ok';
        ep.detalhe = c.detalhe;
      } else if (!achouEmCurso) {
        ep.status = 'em_curso';
        achouEmCurso = true;
      }
    }
    const totalAtivas = etapasPlanejadas.filter(e => e.ativa).length;
    const concluidas = etapasPlanejadas.filter(e => e.ativa && ['ok', 'erro', 'parcial', 'skip'].includes(e.status)).length;
    const somaPesosAtivos = etapasPlanejadas.reduce((acc, ep) => acc + (ep.ativa ? ep.peso : 0), 0) || 1;
    let fracAtual = 0;
    const ultimaParte = (ent.ultima_execucao_msg || '').split(' | ').pop() || '';
    const mPct = ultimaParte.match(/\((\d+)%\)/);
    const mFrac = ultimaParte.match(/(\d+)\s*\/\s*(\d+)/);
    if (mPct) fracAtual = Math.min(1, Number(mPct[1]) / 100);
    else if (mFrac) { const n = Number(mFrac[1]), d = Number(mFrac[2]); if (d > 0) fracAtual = Math.min(1, n / d); }
    let pesoFeito = 0;
    for (const ep of etapasPlanejadas) {
      if (!ep.ativa) continue;
      if (['ok', 'erro', 'parcial', 'skip'].includes(ep.status)) pesoFeito += ep.peso;
      else if (ep.status === 'em_curso') pesoFeito += ep.peso * fracAtual;
    }
    const pct = Math.round((pesoFeito / somaPesosAtivos) * 100);

    const ehPrimeiraEtapa = etapasPlanejadas[0]?.status === 'em_curso';

    return (
      <Paper sx={{
        position: 'sticky', top: 8, zIndex: 5,
        mb: 2, borderRadius: 3, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 50%, #0a1628 100%)',
        backgroundSize: '200% 200%',
        animation: 'gradShift 6s ease infinite',
        '@keyframes gradShift': { '0%, 100%': { backgroundPosition: '0% 50%' }, '50%': { backgroundPosition: '100% 50%' } },
        color: 'white',
        boxShadow: '0 4px 24px rgba(0,200,240,0.4), 0 0 0 1px rgba(0,200,240,0.3)',
      }}>
        <LinearProgress variant="determinate" value={pct}
          sx={{
            height: 4, bgcolor: 'rgba(255,255,255,0.1)',
            '& .MuiLinearProgress-bar': { background: 'linear-gradient(90deg, #00c8f0 0%, #22c55e 100%)', transition: 'transform 0.6s ease-out' },
          }} />

        <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
          {/* Anel */}
          <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, flexShrink: 0 }}>
            <Box sx={{
              position: 'absolute', inset: -8, borderRadius: '50%',
              border: '2px solid rgba(0,200,240,0.5)',
              animation: 'haloPulse 2s ease-out infinite',
              '@keyframes haloPulse': { '0%': { opacity: 0.7, transform: 'scale(0.85)' }, '100%': { opacity: 0, transform: 'scale(1.4)' } },
            }} />
            <CircularProgress size={72} thickness={4} variant="determinate" value={100} sx={{ color: 'rgba(255,255,255,0.1)', position: 'absolute' }} />
            <CircularProgress size={72} thickness={4} variant="determinate" value={pct}
              sx={{ color: T.cyan, position: 'absolute', transform: 'rotate(-90deg)!important', '& circle': { transition: 'stroke-dashoffset 0.6s ease-out' } }} />
            <Box sx={{ textAlign: 'center', zIndex: 1, lineHeight: 1 }}>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>{pct}%</Typography>
              <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {concluidas}/{totalAtivas}
              </Typography>
            </Box>
          </Box>

          {/* Texto principal + controles */}
          <Box sx={{ flex: 1, minWidth: 200 }}>
            <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
              <Chip label="EM EXECUÇÃO" size="small"
                sx={{ bgcolor: T.cyan, color: T.navy, fontWeight: 700, fontSize: '0.65rem', height: 18,
                  animation: 'breathe 1.5s ease-in-out infinite',
                  '@keyframes breathe': { '0%, 100%': { transform: 'scale(1)' }, '50%': { transform: 'scale(1.05)' } },
                }} />
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', fontFamily: 'monospace', fontSize: '0.75rem' }}>⏱ {elapsedStr}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontSize: '0.7rem' }}>
                Etapa {Math.min(concluidas + 1, totalAtivas)} de {totalAtivas}
              </Typography>
              <Box sx={{ flex: 1 }} />
              {controls && (
                <Stack direction="row" spacing={0.5}>
                  {ent.ultima_execucao_msg?.toLowerCase().includes('pausado') ? (
                    controls.onResume && (
                      <Tooltip title="Retomar">
                        <IconButton size="small" sx={{ color: '#22c55e', bgcolor: 'rgba(34,197,94,0.15)', '&:hover': { bgcolor: 'rgba(34,197,94,0.3)' } }}
                          onClick={() => controls.onResume?.(ent.id)}><PlayIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )
                  ) : (
                    controls.onPause && (
                      <Tooltip title="Pausar (suspende ao fim da etapa atual)">
                        <IconButton size="small" sx={{ color: '#fbbf24', bgcolor: 'rgba(251,191,36,0.15)', '&:hover': { bgcolor: 'rgba(251,191,36,0.3)' } }}
                          onClick={() => controls.onPause?.(ent.id)}><PauseIcon fontSize="small" /></IconButton>
                      </Tooltip>
                    )
                  )}
                  {controls.onCancel && (
                    <Tooltip title="Cancelar execução">
                      <IconButton size="small" sx={{ color: '#f87171', bgcolor: 'rgba(248,113,113,0.15)', '&:hover': { bgcolor: 'rgba(248,113,113,0.3)' } }}
                        onClick={() => { if (window.confirm('Cancelar a execução em andamento? A etapa atual termina, e as próximas serão ignoradas.')) controls.onCancel?.(ent.id); }}>
                        <StopIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  )}
                </Stack>
              )}
            </Stack>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: 'white' }}>{ent.label}</Typography>
            <Typography variant="caption" sx={{ color: '#00c8f0', fontStyle: 'italic', display: 'block', mt: 0.5, fontWeight: 600 }}>
              ➤ {ent.ultima_execucao_msg || `Iniciando ${productLabel}…`}
            </Typography>
            {ehPrimeiraEtapa && elapsed < 180 && productExpectationText && (
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', display: 'block', mt: 0.5 }}>
                ⓘ {productExpectationText}
              </Typography>
            )}
          </Box>

          {emExec.length > 1 && (
            <Box sx={{ textAlign: 'center', px: 2, borderLeft: '1px solid rgba(255,255,255,0.15)' }}>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', display: 'block' }}>Em fila</Typography>
              <Typography variant="h4" sx={{ fontWeight: 700, color: T.cyan, lineHeight: 1 }}>+{emExec.length - 1}</Typography>
              <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>entidade(s)</Typography>
            </Box>
          )}
        </Box>

        {/* Pipeline visual */}
        <Box sx={{ px: 2.5, pb: 2, display: 'flex', alignItems: 'stretch', gap: 1, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,0.08)', mt: 0.5, pt: 1.5 }}>
          {etapasPlanejadas.map((ep, idx) => {
            const isLast = idx === etapasPlanejadas.length - 1;
            const cor = ep.status === 'ok' ? '#22c55e'
              : ep.status === 'erro' ? '#ef4444'
              : ep.status === 'parcial' ? '#f59e0b'
              : ep.status === 'em_curso' ? T.cyan
              : ep.status === 'skip' && !ep.ativa ? 'rgba(255,255,255,0.2)'
              : 'rgba(255,255,255,0.35)';
            const label = ep.status === 'ok' ? 'OK'
              : ep.status === 'erro' ? 'ERRO'
              : ep.status === 'parcial' ? 'PARCIAL'
              : ep.status === 'em_curso' ? 'EXECUTANDO'
              : ep.status === 'skip' && !ep.ativa ? 'DESLIGADO'
              : 'AGUARDA';
            return (
              <Box key={ep.chave} sx={{ display: 'flex', alignItems: 'center', flex: '1 1 200px', minWidth: 0 }}>
                <Box sx={{
                  flex: 1, p: 1, borderRadius: 2, minWidth: 0,
                  bgcolor: ep.status === 'em_curso' ? 'rgba(0,200,240,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${ep.status === 'em_curso' ? 'rgba(0,200,240,0.5)' : 'rgba(255,255,255,0.08)'}`,
                  ...(ep.status === 'em_curso' && {
                    animation: 'stageRun 1.6s ease-in-out infinite',
                    '@keyframes stageRun': { '0%, 100%': { boxShadow: '0 0 0 0 rgba(0,200,240,0.6)' }, '50%': { boxShadow: '0 0 0 4px rgba(0,200,240,0.1)' } },
                  }),
                }}>
                  <Stack direction="row" alignItems="center" gap={0.75}>
                    <Box sx={{ color: cor, display: 'flex' }}>
                      {ep.status === 'em_curso' ? <CircularProgress size={14} thickness={5} sx={{ color: T.cyan }} />
                        : ep.status === 'ok' ? <OkIcon sx={{ fontSize: 16, color: cor }} />
                        : ep.status === 'erro' ? <ErrIcon sx={{ fontSize: 16, color: cor }} />
                        : ep.icon}
                    </Box>
                    <Box flex={1} minWidth={0}>
                      <Typography variant="caption" sx={{ color: 'white', fontWeight: 600, fontSize: '0.7rem', display: 'block', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ep.label}
                      </Typography>
                      <Typography variant="caption" sx={{ color: cor, fontSize: '0.6rem', fontWeight: 700, letterSpacing: 0.5 }}>{label}</Typography>
                    </Box>
                  </Stack>
                  {ep.detalhe && ['ok', 'parcial', 'erro'].includes(ep.status) && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.25, color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: '0.6rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ep.detalhe.substring(0, 50)}{ep.detalhe.length > 50 ? '…' : ''}
                    </Typography>
                  )}
                </Box>
                {!isLast && (
                  <Box sx={{ width: 12, height: 1, mx: 0.25, bgcolor: ['ok', 'erro', 'parcial', 'skip'].includes(ep.status) ? T.cyan : 'rgba(255,255,255,0.15)', transition: 'background-color 0.4s' }} />
                )}
              </Box>
            );
          })}
        </Box>
      </Paper>
    );
  }

  // ── Banner de POST-MORTEM (execuções recentes) ──────────────────────────────
  const recentesNaoDispensados = recentes.filter(e => !dismissed.has(e.id));
  if (recentesNaoDispensados.length === 0) return null;

  return (
    <>
      {recentesNaoDispensados.map(ent => {
        const status = ent.ultima_execucao_status;
        const etapas = parseEtapas(ent.ultima_execucao_msg);
        const algumErro = etapas.some(e => e.status === 'erro');
        const tudoOk = etapas.length > 0 && etapas.every(e => e.status === 'ok' || e.status === 'skip');
        const sev = status === 'erro' || algumErro ? 'error' : tudoOk ? 'success' : 'warning';
        const expandedHere = !!expanded[ent.id];
        const tempo = ent.ultima_execucao ? new Date(ent.ultima_execucao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
        const corBorda = sev === 'success' ? T.emerald : sev === 'error' ? '#ef4444' : '#f59e0b';
        const stepMeta = (chave: string) => steps.find(s => s.chave === chave);

        return (
          <Paper key={ent.id} sx={{ mb: 2, borderRadius: 3, overflow: 'hidden', border: '1px solid', borderColor: `${corBorda}40`, borderLeft: `4px solid ${corBorda}` }}>
            <Box sx={{ p: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
              <Box sx={{ width: 36, height: 36, borderRadius: '50%', bgcolor: `${corBorda}15`, color: corBorda, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {sev === 'success' ? <OkIcon /> : <ErrIcon />}
              </Box>
              <Box flex={1}>
                <Typography variant="caption" sx={{ color: T.textSecond }}>Última execução · {tempo}</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy, lineHeight: 1.2 }}>
                  {ent.label}{' '}
                  <Typography component="span" variant="caption" sx={{ color: corBorda, fontWeight: 700, ml: 0.5 }}>
                    · {sev === 'success' ? 'CONCLUÍDA COM SUCESSO' : sev === 'error' ? 'TERMINOU COM ERROS' : 'CONCLUÍDA COM AVISOS'}
                  </Typography>
                </Typography>
              </Box>
              <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ maxWidth: 360 }}>
                {etapas.map((et, i) => {
                  const c = et.status === 'ok' ? T.emerald : et.status === 'erro' ? '#ef4444' : et.status === 'parcial' ? '#f59e0b' : '#94a3b8';
                  const meta = stepMeta(et.chave);
                  return (
                    <Tooltip key={i} title={`${meta?.label || et.chave}: ${et.detalhe}`}>
                      <Chip size="small" icon={meta?.icon as any} label={et.chave}
                        sx={{ bgcolor: `${c}15`, color: c, fontWeight: 600, height: 22, '& .MuiChip-icon': { color: c, fontSize: 14 } }} />
                    </Tooltip>
                  );
                })}
              </Stack>
              <IconButton size="small" onClick={() => setExpanded(p => ({ ...p, [ent.id]: !expandedHere }))}>
                {expandedHere ? <ExpandLessIcon /> : <ExpandMoreIcon />}
              </IconButton>
              <IconButton size="small" onClick={() => setDismissed(p => { const n = new Set(p); n.add(ent.id); return n; })}>
                <CancelIcon fontSize="small" sx={{ color: T.textSecond }} />
              </IconButton>
            </Box>
            {expandedHere && (
              <Box sx={{ px: 2, pb: 2, bgcolor: '#f8fafc' }}>
                <Stack spacing={1}>
                  {etapas.map((et, i) => {
                    const c = et.status === 'ok' ? T.emerald : et.status === 'erro' ? '#ef4444' : et.status === 'parcial' ? '#f59e0b' : '#94a3b8';
                    const meta = stepMeta(et.chave);
                    return (
                      <Stack key={i} direction="row" alignItems="center" gap={1.5}>
                        <Box sx={{ color: c }}>{meta?.icon}</Box>
                        <Box flex={1}>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: T.navy }}>{meta?.label || et.chave}</Typography>
                          <Typography variant="caption" sx={{ color: T.textSecond, fontFamily: 'monospace' }}>{et.detalhe}</Typography>
                        </Box>
                        <Chip size="small" label={et.status.toUpperCase()} sx={{ bgcolor: `${c}20`, color: c, fontWeight: 700, fontSize: '0.65rem', height: 18 }} />
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
