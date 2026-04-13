import { Box, Typography } from '@mui/material';

const T = {
  textPrimary: '#1a2332',
  textSecond:  '#64748b',
};

export default function PacotePage() {
  return (
    <Box sx={{ fontFamily: '"Inter", system-ui, sans-serif' }}>
      <Typography sx={{ fontSize: '1.375rem', fontWeight: 700, color: T.textPrimary, letterSpacing: '-0.02em', mb: 0.5 }}>
        Pacote
      </Typography>
      <Typography sx={{ fontSize: '0.875rem', color: T.textSecond }}>
        Gerenciamento de pacotes
      </Typography>
    </Box>
  );
}
