import { Box, Button, Typography } from '@mui/material';
import { MenuBook, OpenInNew } from '@mui/icons-material';

const T = {
  cyan:       '#00c8f0',
  cyanGlow:   '0 4px 18px rgba(0,200,240,0.25)',
  cyanHover:  '0 6px 22px rgba(0,200,240,0.38)',
  textPrimary:'#1a2332',
  textSecond: '#64748b',
  border:     'rgba(15, 30, 60, 0.09)',
  surface:    '#FFFFFF',
  navy:       '#0a1628',
  cardShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
};

export default function ManualPage() {
  const handleOpenManual = () => {
    const SERVER_NAME = import.meta.env.VITE_API_URL_WEB || 'http://localhost:8080';
    window.open(`${SERVER_NAME}/manual`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Box sx={{
      fontFamily: '"Inter", system-ui, sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
    }}>
      <Box sx={{
        backgroundColor: T.surface,
        borderRadius: '16px',
        border: `1px solid ${T.border}`,
        boxShadow: T.cardShadow,
        p: 6,
        textAlign: 'center',
        maxWidth: 480,
        width: '100%',
      }}>
        {/* Icon badge */}
        <Box sx={{
          width: 72, height: 72, borderRadius: '18px', mx: 'auto', mb: 3,
          backgroundColor: 'rgba(0, 200, 240, 0.08)',
          border: `1px solid rgba(0, 200, 240, 0.18)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.cyan,
        }}>
          <MenuBook sx={{ fontSize: 36 }} />
        </Box>

        <Typography sx={{
          fontSize: '1.5rem', fontWeight: 700, color: T.textPrimary,
          letterSpacing: '-0.02em', mb: 1,
        }}>
          Manual do Usuário
        </Typography>

        <Typography sx={{ fontSize: '0.9375rem', color: T.textSecond, lineHeight: 1.65, mb: 4 }}>
          Acesse a documentação completa do TaxSphere com tutoriais,
          guias passo a passo e informações sobre todas as funcionalidades.
        </Typography>

        <Button
          variant="contained"
          size="large"
          endIcon={<OpenInNew sx={{ fontSize: 18 }} />}
          onClick={handleOpenManual}
          sx={{
            height: 48, px: 4, borderRadius: '12px',
            backgroundColor: T.cyan, color: T.navy,
            fontWeight: 700, fontSize: '0.9375rem', textTransform: 'none',
            boxShadow: T.cyanGlow,
            '&:hover': { backgroundColor: '#00b8e0', boxShadow: T.cyanHover },
          }}
        >
          Acessar o Manual
        </Button>

        <Typography sx={{ fontSize: '0.8125rem', color: T.textSecond, mt: 2.5 }}>
          Será aberto em uma nova aba do navegador
        </Typography>
      </Box>
    </Box>
  );
}
