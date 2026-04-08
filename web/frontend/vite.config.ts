import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://localhost:3000',
        changeOrigin: true
        // cookieDomainRewrite removido: adicionava Domain= vazio (inválido) no Set-Cookie
        // O browser rejeitava o cookie e a sessão era perdida no F5
      }
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (!id.includes('node_modules')) return;

          // FullCalendar — exclusivo de AgendaPage, ~400 kB
          if (id.includes('@fullcalendar')) return 'vendor-fullcalendar';

          // MUI Icons — arquivo enorme (~1 MB não minificado), separado do core
          if (id.includes('@mui/icons-material')) return 'vendor-mui-icons';

          // MUI (core + X + emotion) — mantidos no mesmo chunk para evitar
          // referências circulares: @mui/x-* depende de @mui/material/@mui/system
          if (id.includes('@mui/') || id.includes('@emotion')) return 'vendor-mui';

          // Stripe
          if (id.includes('@stripe')) return 'vendor-stripe';

          // Recharts (inclui d3 internamente)
          if (id.includes('recharts')) return 'vendor-charts';

          // React core
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'vendor-react';
        }
      }
    }
  }
})
