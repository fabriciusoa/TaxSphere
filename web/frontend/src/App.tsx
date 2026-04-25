import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/LoginPage';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const TrocarSenhaPage = lazy(() => import('./pages/TrocarSenhaPage'));
const MeuPerfilPage = lazy(() => import('./pages/MeuPerfilPage'));
const UsuariosPage = lazy(() => import('./pages/UsuariosPage'));
const ParametrosPage = lazy(() => import('./pages/ParametrosPage'));
const ChamadoPage = lazy(() => import('./pages/ChamadoPage'));
const ChamadosReportsPage = lazy(() => import('./pages/ChamadosReportsPage'));
const ManualPage = lazy(() => import('./pages/ManualPage'));
const ManutencaoPage = lazy(() => import('./pages/ManutencaoPage'));
const NotificacoesPage = lazy(() => import('./pages/NotificacoesPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const ModuloEmBreve = lazy(() => import('./pages/ModuloEmBrevePage'));
const PerdcompDashboardPage = lazy(() => import('./pages/perdcomp/PerdcompDashboardPage'));
const PerdcompEmpresasPage = lazy(() => import('./pages/EmpresasPage'));
const PerdcompCreditosPage = lazy(() => import('./pages/perdcomp/CreditosPage'));
const PerdcompDebitosPage = lazy(() => import('./pages/perdcomp/DebitosPage'));
const PerdcompPedidosPage = lazy(() => import('./pages/perdcomp/PedidosPage'));
const PerdcompNovoPedidoPage = lazy(() => import('./pages/perdcomp/NovoPedidoPage'));
const PerdcompSimuladorPage = lazy(() => import('./pages/perdcomp/SimuladorPage'));
const PerdcompAssistenteIAPage = lazy(() => import('./pages/perdcomp/AssistenteIAPage'));
const EcacIntegracaoPage = lazy(() => import('./pages/perdcomp/EcacIntegracaoPage'));
const DctfWebDashboardPage = lazy(() => import('./pages/dctfweb/DctfWebDashboardPage'));
const DctfWebDeclaracoesPage = lazy(() => import('./pages/dctfweb/DeclaracoesPage'));
const ClientesPage = lazy(() => import('./pages/ClientesPage'));
const PerfisPage = lazy(() => import('./pages/PerfisPage'));

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
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              <Route element={<PrivateRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />

                {/* Soluções Fiscais */}
                <Route path="/fiscal/classificacao-ncm" element={<ModuloEmBreve />} />

                {/* PERD/Comp */}
                <Route path="/fiscal/perdcomp" element={<PerdcompDashboardPage />} />
                <Route path="/fiscal/perdcomp/creditos" element={<PerdcompCreditosPage />} />
                <Route path="/fiscal/perdcomp/debitos" element={<PerdcompDebitosPage />} />
                <Route path="/fiscal/perdcomp/pedidos" element={<PerdcompPedidosPage />} />
                <Route path="/fiscal/perdcomp/pedidos/novo" element={<PerdcompNovoPedidoPage />} />
                <Route path="/fiscal/perdcomp/simulador" element={<PerdcompSimuladorPage />} />
                <Route path="/fiscal/perdcomp/assistente" element={<PerdcompAssistenteIAPage />} />
                <Route path="/configuracoes/ecac" element={<EcacIntegracaoPage />} />

                {/*RecuperacaoPis Cofins */}
                <Route path="/fiscal/pis-cofins" element={<ModuloEmBreve />} />

                {/*MIT */}
                <Route path="/fiscal/mit" element={<ModuloEmBreve />} />

                {/* DCTF Web */}
                <Route path="/fiscal/dctf-web" element={<DctfWebDashboardPage />} />
                <Route path="/fiscal/dctf-web/declaracoes" element={<DctfWebDeclaracoesPage />} />

                {/*Gestao de CND */}
                <Route path="/fiscal/cnds" element={<ModuloEmBreve />} />

                {/*Caixa Postal */}
                <Route path="/fiscal/ecac" element={<ModuloEmBreve />} />

                {/*Classificacao NCM */}
                <Route path="/fiscal/classificacao-ncm" element={<ModuloEmBreve />} />

                {/* Suporte */}
                <Route path="/suporte/chamado" element={<ChamadoPage />} />
                <Route path="/suporte/relatorios" element={<ChamadosReportsPage />} />
                <Route path="/suporte/manual" element={<ManualPage />} />

                {/* Configurações */}
                <Route path="/configuracoes/empresas" element={<PerdcompEmpresasPage />} />
                <Route path="/trocar-senha" element={<TrocarSenhaPage />} />
                <Route path="/meu-perfil" element={<MeuPerfilPage />} />

                {/* Administração */}
                <Route path="/clientes" element={<ClientesPage />} />
                <Route path="/sistema/perfis" element={<PerfisPage />} />
                <Route path="/sistema/notificacoes" element={<NotificacoesPage />} />
                <Route path="/sistema/usuarios" element={<UsuariosPage />} />
                <Route path="/sistema/parametros" element={<ParametrosPage />} />
                <Route path="/sistema/manutencao" element={<ManutencaoPage />} />

                <Route path="*" element={<NotFoundPage />} />
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
