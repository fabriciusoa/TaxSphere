import { Button, Box, Typography } from '@mui/material';
import { useNavigate } from 'react-router-dom';

export default function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minHeight="100vh"
      gap={2}
    >
      <Typography variant="h1" color="primary">404</Typography>
      <Typography variant="h5">Página não encontrada</Typography>
      <Typography color="text.secondary">
        A página que você tentou acessar não existe.
      </Typography>
      <Button variant="contained" onClick={() => navigate('/dashboard')}>
        Voltar ao início
      </Button>
    </Box>
  );
}