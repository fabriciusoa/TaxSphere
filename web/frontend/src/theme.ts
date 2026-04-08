import { createTheme } from '@mui/material/styles';

const theme = createTheme({
  palette: {
    primary: {
      main: '#00A3E0',      //  Blue (azul principal)
      light: '#33B5E6',     // Azul claro
      dark: '#0082B3',      // Azul escuro
      contrastText: '#FFFFFF'
    },
    secondary: {
      main: '#78BE20',      //  Green (verde principal)
      light: '#93CB4C',     // Verde claro
      dark: '#609816',      // Verde escuro
      contrastText: '#FFFFFF'
    },
    error: {
      main: '#D32F2F'       // Vermelho para erros
    },
    warning: {
      main: '#FFA726'       // Laranja para avisos
    },
    info: {
      main: '#29B6F6'       // Azul claro para informações
    },
    success: {
      main: '#66BB6A'       // Verde para sucesso
    },
    background: {
      default: '#F5F5F5',   // Cinza claro para fundo geral
      paper: '#FFFFFF'       // Branco para cards/papéis
    },
    text: {
      primary: '#333333',   // Texto principal (cinza escuro)
      secondary: '#666666'  // Texto secundário (cinza médio)
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
    }
  }
});

export default theme;
