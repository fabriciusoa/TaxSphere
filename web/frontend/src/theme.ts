import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#00BFD4',      // Azul/teal principal (logo)
      light: '#4ED9E5',
      dark: '#008C9E',
      contrastText: '#FFFFFF'
    },
    secondary: {
      main: '#2BCB9A',      // Verde do logo
      light: '#65DDB7',
      dark: '#1D9C76',
      contrastText: '#FFFFFF'
    },
    error: {
      main: '#D32F2F'       // Vermelho para erros
    },
    warning: {
      main: '#F39C4A'       // Laranja sóbrio para avisos
    },
    info: {
      main: '#23B4C8'       // Teal informativo
    },
    success: {
      main: '#2AA876'       // Verde sóbrio para sucesso
    },
    background: {
      default: '#F4F7FA',   // Fundo clean
      paper: '#FFFFFF'       // Branco para cards/papéis
    },
    text: {
      primary: '#17324D',
      secondary: '#5E748A'
    }
  },
  typography: {
    fontFamily: [
      '-apple-system',
      'BlinkMacSystemFont',
      '"Segoe UI"',
      'Roboto',
      '"Helvetica Neue"',
      'Arial',
      'sans-serif'
    ].join(','),
    h1: {
      fontSize: '2.5rem',   // 40px
      fontWeight: 600
    },
    h2: {
      fontSize: '2rem',     // 32px
      fontWeight: 600
    },
    h3: {
      fontSize: '1.75rem',  // 28px
      fontWeight: 600
    },
    h4: {
      fontSize: '1.5rem',   // 24px
      fontWeight: 600
    },
    h5: {
      fontSize: '1.25rem',  // 20px
      fontWeight: 600
    },
    h6: {
      fontSize: '1rem',     // 16px
      fontWeight: 600
    }
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',  // Sem transformação para maiúsculas
          borderRadius: 8,        // Cantos arredondados
          padding: '8px 16px'     // Espaçamento interno
        }
      }
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 12,       // Cantos arredondados
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)' // Sombra suave
        }
      }
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined'       // Variante padrão com borda
      }
    },
    // ── Abas com visual moderno: pílulas arredondadas, fundo suave,
    //    aba ativa com cor primária preenchida e elevação leve.
    MuiTabs: {
      styleOverrides: {
        root: {
          minHeight: 44,
          padding: 6,
          backgroundColor: '#F1F5F9',
          borderRadius: 12,
          display: 'inline-flex',
          border: '1px solid #E2E8F0',
        },
        flexContainer: {
          gap: 4,
        },
        indicator: {
          display: 'none', // visual de pílulas — sem barra de indicador
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.875rem',
          minHeight: 32,
          padding: '6px 16px',
          borderRadius: 8,
          color: '#5E748A',
          transition: 'background-color 120ms ease, color 120ms ease, box-shadow 120ms ease',
          '&:hover': {
            color: '#17324D',
            backgroundColor: 'rgba(0, 191, 212, 0.08)',
          },
          '&.Mui-selected': {
            color: '#FFFFFF',
            backgroundColor: '#00BFD4',
            boxShadow: '0 2px 6px rgba(0, 191, 212, 0.35)',
          },
          '&.Mui-selected:hover': {
            backgroundColor: '#00ACBF',
          },
        },
      },
    },
  }
});

export default theme;
