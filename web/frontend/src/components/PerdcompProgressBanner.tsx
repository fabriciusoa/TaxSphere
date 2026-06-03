import { Box, Paper, Typography, Chip, LinearProgress, CircularProgress, Stack } from '@mui/material';
import type { ReactNode } from 'react';

interface PerdcompProgressBannerProps {
  /** Título principal (ex.: razão social, "Baixando recibos"). */
  titulo: string;
  /** Mensagem atual em itálico (ex.: "Documento 40/49 (80%)"). */
  mensagem?: string;
  /** Progresso 0-100. */
  progresso: number;
  /** Total de etapas (para o "X/Y" abaixo do %). Opcional. */
  totalEtapas?: number;
  /** Etapas concluídas (para o "X/Y" abaixo do %). Opcional. */
  etapasConcluidas?: number;
  /** Texto do chip de status. Default: "EM EXECUÇÃO". */
  statusLabel?: string;
  /** Cor de destaque do anel/chip. Default: cyan. */
  corDestaque?: string;
  /** Conteúdo extra à direita (ex.: timer, botões pausar/cancelar). */
  acoes?: ReactNode;
  /** Slot abaixo do banner (ex.: pipeline visual com os 4 cards). */
  rodape?: ReactNode;
  /** Hint adicional embaixo da mensagem (ex.: dica de duração). */
  dica?: ReactNode;
  /** Quando false, suprime sticky/topo para uso inline. */
  sticky?: boolean;
}

/**
 * Banner padronizado de processamento do módulo PERD/Comp:
 * gradiente navy + anel com % + halo pulsante + barra de progresso superior.
 * Usado em ConfiguracoesPage (automação) e DocumentosPage (downloads).
 */
export function PerdcompProgressBanner({
  titulo,
  mensagem,
  progresso,
  totalEtapas,
  etapasConcluidas,
  statusLabel = 'EM EXECUÇÃO',
  corDestaque = '#00c8f0',
  acoes,
  rodape,
  dica,
  sticky = true,
}: PerdcompProgressBannerProps) {
  const T = { navy: '#0a1628' };
  const pct = Math.max(0, Math.min(100, Math.round(progresso)));

  return (
    <Paper
      sx={{
        position: sticky ? 'sticky' : 'relative', top: sticky ? 8 : undefined, zIndex: sticky ? 5 : undefined,
        mb: 2, borderRadius: 3, overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a1628 0%, #1e3a5f 50%, #0a1628 100%)',
        backgroundSize: '200% 200%',
        animation: 'pcbGradShift 6s ease infinite',
        '@keyframes pcbGradShift': {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        color: 'white',
        boxShadow: `0 4px 24px ${corDestaque}66, 0 0 0 1px ${corDestaque}4d`,
      }}
    >
      {/* Barra superior fina com o % real */}
      <LinearProgress
        variant="determinate"
        value={pct}
        sx={{
          height: 4, bgcolor: 'rgba(255,255,255,0.1)',
          '& .MuiLinearProgress-bar': {
            background: `linear-gradient(90deg, ${corDestaque} 0%, #22c55e 100%)`,
            transition: 'transform 0.6s ease-out',
          },
        }}
      />

      <Box sx={{ p: 2.5, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap' }}>
        {/* Anel com porcentagem */}
        <Box sx={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 80, height: 80, flexShrink: 0 }}>
          <Box sx={{
            position: 'absolute', inset: -8, borderRadius: '50%',
            border: `2px solid ${corDestaque}80`,
            animation: 'pcbHaloPulse 2s ease-out infinite',
            '@keyframes pcbHaloPulse': {
              '0%': { opacity: 0.7, transform: 'scale(0.85)' },
              '100%': { opacity: 0, transform: 'scale(1.4)' },
            },
          }} />
          <CircularProgress size={72} thickness={4} variant="determinate" value={100}
            sx={{ color: 'rgba(255,255,255,0.1)', position: 'absolute' }} />
          <CircularProgress size={72} thickness={4} variant="determinate" value={pct}
            sx={{
              color: corDestaque, position: 'absolute',
              transform: 'rotate(-90deg)!important',
              '& circle': { transition: 'stroke-dashoffset 0.6s ease-out' },
            }} />
          <Box sx={{ textAlign: 'center', zIndex: 1, lineHeight: 1 }}>
            <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: 'white', lineHeight: 1 }}>
              {pct}%
            </Typography>
            {typeof totalEtapas === 'number' && typeof etapasConcluidas === 'number' && (
              <Typography sx={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {etapasConcluidas}/{totalEtapas}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Texto */}
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Stack direction="row" alignItems="center" gap={1} mb={0.5}>
            <Chip
              label={statusLabel}
              size="small"
              sx={{
                bgcolor: corDestaque, color: T.navy, fontWeight: 700, fontSize: '0.65rem', height: 18,
                animation: 'pcbBreathe 1.5s ease-in-out infinite',
                '@keyframes pcbBreathe': {
                  '0%, 100%': { transform: 'scale(1)' },
                  '50%': { transform: 'scale(1.05)' },
                },
              }}
            />
            {acoes}
          </Stack>
          <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2, color: 'white' }}>
            {titulo}
          </Typography>
          {mensagem && (
            <Typography variant="caption" sx={{ color: corDestaque, fontStyle: 'italic', display: 'block', mt: 0.5, fontWeight: 600 }}>
              ➤ {mensagem}
            </Typography>
          )}
          {dica && (
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.55)', fontSize: '0.7rem', display: 'block', mt: 0.5 }}>
              {dica}
            </Typography>
          )}
        </Box>
      </Box>

      {rodape && (
        <Box sx={{ px: 2.5, pb: 2, borderTop: '1px solid rgba(255,255,255,0.08)', mt: 0.5, pt: 1.5 }}>
          {rodape}
        </Box>
      )}
    </Paper>
  );
}
