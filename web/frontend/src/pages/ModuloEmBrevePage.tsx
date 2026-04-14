import { Box, Typography, Paper } from '@mui/material';
import { Construction as ConstructionIcon } from '@mui/icons-material';
import { useLocation } from 'react-router-dom';

const moduleNames: Record<string, string> = {
  '/fiscal/classificacao-ncm': 'Classificação NCM',
  '/fiscal/perdcomp': 'PERD/Comp',
  '/fiscal/pis-cofins': 'Recuperação PIS/COFINS',
  '/fiscal/mit': 'MIT',
  '/fiscal/dctf-web': 'DCTF Web',
  '/fiscal/cnds': 'Gestão de CNDs',
  '/fiscal/ecac': 'Caixa Postal eCac',
};

export default function ModuloEmBrevePage() {
  const location = useLocation();
  const moduleName = moduleNames[location.pathname] || 'Módulo';

  return (
    <Box sx={{
      display: 'flex', justifyContent: 'center', alignItems: 'center',
      minHeight: 'calc(100vh - 160px)',
    }}>
      <Paper elevation={0} sx={{
        p: 6, textAlign: 'center', maxWidth: 480,
        borderRadius: '16px',
        border: '1px solid rgba(15, 30, 60, 0.10)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)',
      }}>
        <Box sx={{
          width: 64, height: 64, borderRadius: '16px', mx: 'auto', mb: 3,
          backgroundColor: 'rgba(0, 200, 240, 0.08)',
          border: '1px solid rgba(0, 200, 240, 0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ConstructionIcon sx={{ fontSize: 32, color: '#00c8f0' }} />
        </Box>

        <Typography sx={{
          fontSize: '1.25rem', fontWeight: 700,
          color: '#1a2332', letterSpacing: '-0.02em', mb: 1,
        }}>
          {moduleName}
        </Typography>

        <Typography sx={{ fontSize: '0.9375rem', color: '#64748b', lineHeight: 1.6 }}>
          Este módulo está em desenvolvimento e será disponibilizado em breve.
        </Typography>

        <Box sx={{
          mt: 3, px: 3, py: 1.5, borderRadius: '10px',
          backgroundColor: 'rgba(0, 200, 240, 0.06)',
          border: '1px solid rgba(0, 200, 240, 0.12)',
          display: 'inline-block',
        }}>
          <Typography sx={{ fontSize: '0.8125rem', color: '#00c8f0', fontWeight: 600 }}>
            Em breve
          </Typography>
        </Box>
      </Paper>
    </Box>
  );
}
