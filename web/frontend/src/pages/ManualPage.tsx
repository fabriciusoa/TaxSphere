import { Box, Button, Container, Paper, Typography } from '@mui/material';
import { MenuBook, OpenInNew } from '@mui/icons-material';

export default function ManualPage() {
  const handleOpenManual = () => {

    const SERVER_NAME = import.meta.env.VITE_API_URL_WEB || 'http://localhost:8080';
    // Manual agora está no site institucional
    window.open(`${SERVER_NAME}/manual`, '_blank', 'noopener,noreferrer');
  };

  return (
    <Container maxWidth="md">
      <Box
        sx={{
          minHeight: 'calc(100vh - 120px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          py: 4
        }}
      >
        <Paper
          elevation={3}
          sx={{
            p: 6,
            textAlign: 'center',
            borderRadius: 2,
            width: '100%'
          }}
        >
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'center',
              mb: 3
            }}
          >
            <MenuBook
              sx={{
                fontSize: 80,
                color: 'primary.main'
              }}
            />
          </Box>

          <Typography
            variant="h4"
            component="h1"
            gutterBottom
            sx={{ fontWeight: 600, mb: 2 }}
          >
            Manual do Usuário
          </Typography>

          <Typography
            variant="body1"
            color="text.secondary"
            sx={{ mb: 4, lineHeight: 1.7 }}
          >
            Acesse a documentação completa do Sistema Mentis com tutoriais,
            guias passo a passo e informações sobre todas as funcionalidades.
          </Typography>

          <Button
            variant="contained"
            size="large"
            endIcon={<OpenInNew />}
            onClick={handleOpenManual}
            sx={{
              px: 4,
              py: 1.5,
              fontSize: '1rem',
              fontWeight: 500,
              textTransform: 'none'
            }}
          >
            Acessar o Manual do Sistema Mentis
          </Button>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 3 }}
          >
            O manual será aberto em uma nova aba do navegador
          </Typography>
        </Paper>
      </Box>
    </Container>
  );
}
