import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import PrivateRoute from './components/PrivateRoute';
// LoginPage permanece estático: necessário imediatamente na verificação inicial de auth
import LoginPage from './pages/LoginPage';

// Lazy loading: cada página vira um chunk separado, carregado só quando acessado pela 1ª vez
const DashboardPage               = lazy(() => import('./pages/DashboardPage'));
const TrocarSenhaPage             = lazy(() => import('./pages/TrocarSenhaPage'));
const MeuPerfilPage               = lazy(() => import('./pages/MeuPerfilPage'));
const UsuariosPage                = lazy(() => import('./pages/UsuariosPage'));
const ParametrosPage              = lazy(() => import('./pages/ParametrosPage'));
const ChamadoPage                 = lazy(() => import('./pages/ChamadoPage'));
const ChamadosReportsPage         = lazy(() => import('./pages/ChamadosReportsPage'));
const ManualPage                  = lazy(() => import('./pages/ManualPage'));
const AssinarPage                 = lazy(() => import('./pages/AssinarPage'));
const AdmPlanosPage               = lazy(() => import('./pages/AdmPlanosPage'));
const AdmAssinaturaPage           = lazy(() => import('./pages/AdmAssinaturaPage'));
const AdmStripeMetricsPage        = lazy(() => import('./pages/AdmStripeMetricsPage'));
const ManutencaoPage              = lazy(() => import('./pages/ManutencaoPage'));
const NotFoundPage                = lazy(() => import('./pages/NotFoundPage'));

// Fallback leve exibido enquanto o chunk da página é baixado (< 1 s em LAN/produção)
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{
        width: 40, height: 40,
        border: '3px solid #e0e0e0',
        borderTop: '3px solid #1976d2',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/assinar" element={<AssinarPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              <Route element={<PrivateRoute />}>              
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/trocar-senha" element={<TrocarSenhaPage />} />
                <Route path="/meu-perfil" element={<MeuPerfilPage />} />
                <Route path="/sistema/usuarios" element={<UsuariosPage />} />
                <Route path="/sistema/parametros" element={<ParametrosPage />} />
                <Route path="/suporte/chamado" element={<ChamadoPage />} />
                <Route path="/suporte/relatorios" element={<ChamadosReportsPage />} />
                <Route path="/suporte/manual" element={<ManualPage />} />
                <Route path="/assinatura/planos" element={<AdmPlanosPage />} />
                <Route path="/assinatura/assinaturas" element={<AdmAssinaturaPage />} />
                <Route path="/assinatura/metricas-stripe" element={<AdmStripeMetricsPage />} />
                <Route path="/sistema/manutencao" element={<ManutencaoPage />} />
              </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
    </ErrorBoundary>
  );
}

export default App
