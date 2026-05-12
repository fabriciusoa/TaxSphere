import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { EmpresaProvider } from './contexts/EmpresaContext';
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
const PerdcompSimuladorPage = lazy(() => import('./pages/perdcomp/SimuladorPage'));
const EcacIntegracaoPage = lazy(() => import('./pages/perdcomp/EcacIntegracaoPage'));
const PerdcompDocumentosPage = lazy(() => import('./pages/perdcomp/DocumentosPage'));
const PerdcompWizardPage = lazy(() => import('./pages/perdcomp/PerdcompWizardPage'));
const RelatoriosPage = lazy(() => import('./pages/perdcomp/RelatoriosPage'));
const CertificadosPage = lazy(() => import('./pages/CertificadosPage'));
const DctfWebDashboardPage = lazy(() => import('./pages/dctfweb/DctfWebDashboardPage'));
const DctfWebDeclaracoesPage = lazy(() => import('./pages/dctfweb/DeclaracoesPage'));
const ClientesPage = lazy(() => import('./pages/ClientesPage'));
const PerfisPage = lazy(() => import('./pages/PerfisPage'));
const NcmTabelaPage = lazy(() => import('./pages/ncm/NcmTabelaPage'));

// Fallback leve exibido enquanto o chunk da página é baixado (< 1 s em LAN/produção)
function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{
        width: 40, height: 40,
        border: '3px solid #dfe6ee',
        borderTop: '3px solid #00bfd4',
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
        <EmpresaProvider>
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<Navigate to="/dashboard" replace />} />

              <Route element={<PrivateRoute />}>
                <Route path="/dashboard" element={<DashboardPage />} />

                {/* Soluções Fiscais */}
                <Route path="/fiscal/classificacao-ncm" element={<ModuloEmBreve />} />

                {/* PER/DComp */}
                <Route path="/fiscal/perdcomp" element={<PerdcompDashboardPage />} />
                <Route path="/fiscal/perdcomp/creditos" element={<PerdcompCreditosPage />} />
                <Route path="/fiscal/perdcomp/debitos" element={<PerdcompDebitosPage />} />
                <Route path="/fiscal/perdcomp/simulador" element={<PerdcompSimuladorPage />} />
                <Route path="/fiscal/perdcomp/documentos" element={<PerdcompDocumentosPage />} />
                <Route path="/fiscal/perdcomp/documentos/novo" element={<PerdcompWizardPage />} />
                <Route path="/fiscal/perdcomp/documentos/:id/editar" element={<PerdcompWizardPage />} />
                <Route path="/fiscal/perdcomp/relatorios" element={<RelatoriosPage />} />
                <Route path="/configuracoes/ecac" element={<EcacIntegracaoPage />} />
                <Route path="/configuracoes/certificados" element={<CertificadosPage />} />

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
                <Route path="/fiscal/ncm/tabela" element={<NcmTabelaPage />} />

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
        </EmpresaProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App
