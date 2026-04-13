import { Box, Button, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

const T = {
  cyan:       '#00c8f0',
  cyanGlow:   '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:  '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary:'#1a2332',
  textSecond: '#64748b',
  navy:       '#0a1628',
};

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Box sx={{
      fontFamily: '"Inter", system-ui, sans-serif',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', gap: 2, px: 2,
    }}>
      <Typography sx={{
        fontSize: '7rem', fontWeight: 800,
        color: T.cyan, letterSpacing: '-0.04em',
        lineHeight: 1, fontVariantNumeric: 'tabular-nums',
      }}>
        404
      </Typography>

      <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em' }}>
        Página não encontrada
      </Typography>

      <Typography sx={{ fontSize: '0.9375rem', color: T.textSecond, textAlign: 'center' }}>
        A página que você tentou acessar não existe ou foi movida.
      </Typography>

      <Button
        variant="contained"
        onClick={() => navigate('/dashboard')}
        sx={{
          mt: 1, height: 44, px: 4, borderRadius: '10px',
          backgroundColor: T.cyan, color: T.navy,
          fontWeight: 700, textTransform: 'none', fontSize: '0.9375rem',
          boxShadow: T.cyanGlow,
          '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
        }}
      >
        Voltar ao início
      </Button>
    </Box>
  );
}
