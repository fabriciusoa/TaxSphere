import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getAll, getOne } from '../database/connection';
import { authController } from '../controllers/authController';
import { usuariosController } from '../controllers/usuariosController';
import { perfilController } from '../controllers/perfilController';
import { parametrosController } from '../controllers/parametrosController';
import { usuarioParametrosController } from '../controllers/usuarioParametrosController';
import { loginLogController } from '../controllers/loginLogController';
import { alterarSenha } from '../controllers/senhaController';
import notificacoesController from '../controllers/notificacoesController';
import { emailTemplatesController } from '../controllers/emailTemplatesController';
import { dashboardController } from '../controllers/dashboardController';
import { healthCheck, healthCheckSimple, healthDashboard } from '../controllers/healthController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/authorization';
import { adaptiveLoginGuard, adaptiveAuthRateLimit, clearAllIpFailures } from '../middleware/adaptiveRateLimit';
import { getRateLimitConfig } from '../utils/parametrosHelper';
import { chamadosController } from '../controllers/chamadosController';
import { admPlanosController } from '../controllers/admPlanosController';
import { admAssinaturaController } from '../controllers/admAssinaturaController';
import { stripePaymentController } from '../controllers/stripePaymentController';
import { stripeSubscriptionController } from '../controllers/stripeSubscriptionController';
import { stripeMetricsController } from '../controllers/stripeMetricsController';
import { manutencaoController } from '../controllers/manutencaoController';
import { frontendLogController } from '../controllers/frontendLogController';
import {
  perdcompEmpresasController, perdcompCreditosController, perdcompDebitosController,
  perdcompPedidosController, perdcompDashboardController, perdcompSimuladorController,
  perdcompAlertasController,
} from '../controllers/perdcompController';
import { perdcompIAController } from '../controllers/perdcompIAController';
import { log } from '../utils/logger';

const router = Router();

// Configuração de Rate Limiting
// Valores serão carregados dos parâmetros do banco de dados
// Defaults: limiterGeral = 10 req/hora por IP, limiterToken = 3 req/hora por token
let limiterGeral: any;
let limiterToken: any;

// Inicializar configurações de rate limit
(async () => {
  try {
    const config = await getRateLimitConfig();
    
    // Limiter Geral: Protege endpoints públicos por IP
    // Default: 10 requisições por hora por IP
    limiterGeral = rateLimit({
      windowMs: config.windowMs,
      max: config.maxRequests,
      message: {
        error: 'Muitas requisições deste IP. Tente novamente mais tarde.',
        retry_after: config.windowMs / 1000 / 60 // minutos
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Usar rate limit padrão por IP (suporta IPv6 automaticamente)
      // Não definir keyGenerator para usar o padrão que trata IPv6 corretamente
    });

    // Limiter por Token: Protege ações públicas por token específico
    // Default: 3 requisições por hora por token
    limiterToken = rateLimit({
      windowMs: config.windowMs,
      max: config.maxTokenRequests,
      message: {
        error: 'Muitas tentativas com este link. Tente novamente mais tarde.',
        retry_after: config.windowMs / 1000 / 60 // minutos
      },
      standardHeaders: true,
      legacyHeaders: false,
      // Identificar por token na URL
      keyGenerator: (req) => {
        const token = req.params.token || 'no-token';
        return `token:${token}`;
      },
      // Pular rate limit se não houver token
      skip: (req) => !req.params.token
    });

    log.info('Configuração carregada com sucesso');
    log.info(`Limiter Geral: ${config.maxRequests} req/${config.windowMs / 1000 / 60}min`);
    log.info(`Limiter Token: ${config.maxTokenRequests} req/${config.windowMs / 1000 / 60}min`);
  } catch (error) {
    log.error(`Erro ao carregar configurações, usando defaults: ${error}`);
    
    // Fallback para valores padrão se houver erro
    limiterGeral = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hora
      max: 10,
      message: {
        error: 'Muitas requisições deste IP. Tente novamente mais tarde.',
        retry_after: 60
      }
    });

    limiterToken = rateLimit({
      windowMs: 60 * 60 * 1000, // 1 hora
      max: 3,
      message: {
        error: 'Muitas tentativas com este link. Tente novamente mais tarde.',
        retry_after: 60
      },
      // Para limiter por token, não é baseado em IP então pode usar keyGenerator customizado
      keyGenerator: (req) => `token:${req.params.token || 'no-token'}`,
      skip: (req) => !req.params.token,
      // Desabilitar validação de IP para este limiter (não usa IP como key)
      validate: { xForwardedForHeader: false, trustProxy: false }
    });
  }
})();

// Middleware helper para aplicar rate limiters (serão usados nas rotas públicas)
export const applyLimiterGeral = (req: any, res: any, next: any) => {
  if (limiterGeral) {
    return limiterGeral(req, res, next);
  }
  next();
};

export const applyLimiterToken = (req: any, res: any, next: any) => {
  if (limiterToken) {
    return limiterToken(req, res, next);
  }
  next();
};

// Configuração do multer para upload de arquivos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    // Aceitar apenas PDFs, documentos e imagens
    if (file.mimetype === 'application/pdf' || 
        file.mimetype === 'application/msword' || 
        file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      log.error(`Tipo de arquivo não permitido. Use PDF, DOC/DOCX ou imagens.`);
      cb(new Error('Tipo de arquivo não permitido. Use PDF, DOC/DOCX ou imagens.'));
    }
  }
});

// Rotas públicas - Autenticação
// adaptiveLoginGuard: bloqueia IPs com muitas falhas consecutivas (credential stuffing)
router.post('/auth/login', adaptiveLoginGuard, applyLimiterGeral, authController.login);
router.post('/auth/validate_reset', applyLimiterGeral, authController.validate_reset);
router.post('/auth/reset-password', applyLimiterGeral, authController.reset_password);

// Rota de reset de rate limits — APENAS em desenvolvimento, para scripts de teste
// Em produção esta rota nunca é registrada (NODE_ENV=production)
if (process.env.NODE_ENV !== 'production') {
  router.post('/test/reset-rate-limits', (_req, res) => {
    clearAllIpFailures();
    log.info('Rate limit state cleared');
    res.json({ ok: true, message: 'Rate limit state cleared' });
  });
}
// Rota pública - Log de erros do Frontend
router.post('/logs/frontend-error', applyLimiterGeral, frontendLogController.logError);

// Rota pública - Health Check (monitoramento de cron jobs)
// TODO: 03 Criar dashboard frontend para visualizar estatísticas
router.get('/health/cron', async (req, res) => {
  try {
    const ultimasExecucoes = await getAll(
      `SELECT *
       FROM cron_execucoes 
       ORDER BY executado_em DESC 
       LIMIT 10`
    );
    //buscar estatísticas das últimas 48 horas
    const estatisticas = await getOne(
      `SELECT 
        COUNT(*) as total_execucoes,
        SUM(CASE WHEN sucesso = 1 THEN 1 ELSE 0 END) as total_sucessos,
        SUM(CASE WHEN sucesso = 0 THEN 1 ELSE 0 END) as total_falhas,
        AVG(duracao_ms) as duracao_media_ms
       FROM cron_execucoes 
       WHERE executado_em >= datetime('now', '-48 hours')`
    );

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ultimas_execucoes: ultimasExecucoes,
      estatisticas_24h: estatisticas
    });
  } catch (error) {
    log.error(`Erro ao buscar estatísticas de cron jobs: ${error}`);
    res.status(500).json({ 
      status: 'error', 
      message: 'Erro ao buscar estatísticas de cron jobs' 
    });
  }
});

// Rotas protegidas - Auth
// adaptiveAuthRateLimit: tiered limits (admin=600/15min, user=200/15min, suspeito=40/15min)
// Aplicado globalmente para todas as rotas que passam por authenticateToken.
// O middleware internamente checa req.user — se não há usuário autenticado, passa direto.
// /auth/me e /auth/logout são explicitamente excluídos pois são chamadas de infraestrutura.
router.use((req, res, next) => {
  const skipPaths = ['/auth/me', '/auth/logout', '/auth/login'];
  if (skipPaths.includes(req.path)) return next();
  adaptiveAuthRateLimit(req, res, next);
});

router.post('/auth/refresh', authenticateToken, authController.refresh);
router.get('/auth/me', authenticateToken, authController.me); // sem rate limit: chamado a cada F5
router.post('/auth/logout', authenticateToken, authController.logout); // sem rate limit: ação de segurança

// Rotas protegidas - Usuários (apenas ADMIN)
router.get('/usuarios', authenticateToken, adaptiveAuthRateLimit, requireAdmin, usuariosController.listar);
router.get('/usuarios/:id', authenticateToken, requireAdmin, usuariosController.buscarPorId);
router.post('/usuarios', authenticateToken, requireAdmin, usuariosController.criar);
router.put('/usuarios/:id', authenticateToken, requireAdmin, usuariosController.atualizar);
router.put('/usuarios/:id/senha', authenticateToken, alterarSenha);
router.put('/usuarios/:id/desbloquear', authenticateToken, requireAdmin, usuariosController.desbloquear);
router.delete('/usuarios/:id', authenticateToken, requireAdmin, usuariosController.inativar);

// Rotas protegidas - Perfis (apenas ADMIN)
router.get('/perfis', authenticateToken, requireAdmin, perfilController.listar);
router.get('/perfis/:id', authenticateToken, requireAdmin, perfilController.buscarPorId);
router.post('/perfis', authenticateToken, requireAdmin, perfilController.criar);
router.put('/perfis/:id', authenticateToken, requireAdmin, perfilController.atualizar);
router.delete('/perfis/:id', authenticateToken, requireAdmin, perfilController.deletar);

// Rota pública - Stripe Publishable Key (necessária para formulário de pagamento público)
// IMPORTANTE: Deve vir ANTES das rotas protegidas de parâmetros para não ser capturada por /parametros/:id
router.get('/parametros/stripe-publishable-key', parametrosController.obterStripePublishableKey);

// Rotas protegidas - Parâmetros (apenas ADMIN)
router.get('/parametros', authenticateToken, requireAdmin, parametrosController.listar);
router.get('/parametros/:id', authenticateToken, requireAdmin, parametrosController.buscarPorId);
router.put('/parametros/:id', authenticateToken, requireAdmin, parametrosController.atualizar);

// Rotas protegidas - Parâmetros do Usuário
router.get('/usuario-parametros/me', authenticateToken, usuarioParametrosController.buscarMeus);
router.get('/usuario-parametros/cores', authenticateToken, usuarioParametrosController.buscarCores);
router.post('/usuario-parametros', authenticateToken, usuarioParametrosController.criar);
router.put('/usuario-parametros/me', authenticateToken, usuarioParametrosController.atualizar);

// Rotas protegidas - Parâmetros de outros usuários (ADMIN)
router.get('/usuario-parametros/usuario/:userId', authenticateToken, requireAdmin, usuarioParametrosController.buscarPorUsuario);
router.post('/usuario-parametros/usuario/:userId', authenticateToken, requireAdmin, usuarioParametrosController.criarParaUsuario);
router.put('/usuario-parametros/usuario/:userId', authenticateToken, requireAdmin, usuarioParametrosController.atualizarPorUsuario);

// Rotas protegidas - Log de Login (apenas ADMIN)
router.get('/login-log', authenticateToken, requireAdmin, loginLogController.listar);

// Rotas protegidas - Perfil do usuário logado
router.get('/perfil/me', authenticateToken, perfilController.buscarMeuPerfil);
router.put('/perfil/me', authenticateToken, perfilController.atualizarMeuPerfil);

// Rotas protegidas - Perfil de outros usuários (ADMIN)
router.get('/perfil/usuario/:userId', authenticateToken, requireAdmin, perfilController.buscarPerfilUsuario);

// Rotas de Planos (Admin)
router.get('/adm-planos', authenticateToken, admPlanosController.listar);
router.get('/adm-planos/ativos', admPlanosController.listarAtivos); // Pública
router.get('/adm-planos/:id', authenticateToken, admPlanosController.buscarPorId);
router.post('/adm-planos', authenticateToken, requireAdmin, admPlanosController.criar);
router.put('/adm-planos/:id', authenticateToken, requireAdmin, admPlanosController.atualizar);
router.delete('/adm-planos/:id', authenticateToken, requireAdmin, admPlanosController.excluir);

// Rotas de Assinaturas
router.get('/adm-assinaturas', authenticateToken, requireAdmin, admAssinaturaController.listar);
router.get('/adm-assinaturas/:id', authenticateToken, requireAdmin, admAssinaturaController.buscarPorId);
router.post('/adm-assinaturas', admAssinaturaController.criar); // Pública para novos clientes
router.put('/adm-assinaturas/:id', authenticateToken, requireAdmin, admAssinaturaController.atualizar);
router.delete('/adm-assinaturas/:id', authenticateToken, requireAdmin, admAssinaturaController.excluir);

// Rotas protegidas - Templates de Email
router.get('/email-templates', authenticateToken, emailTemplatesController.buscarPorUsuario);
router.put('/email-templates', authenticateToken, emailTemplatesController.atualizar);
router.post('/email-templates/testar', authenticateToken, emailTemplatesController.testar);

// Rotas protegidas - Notificações
router.get('/notificacoes', authenticateToken, notificacoesController.listar);
router.get('/notificacoes/estatisticas', authenticateToken, notificacoesController.estatisticas);
router.post('/notificacoes/reprocessar-falhas', authenticateToken, notificacoesController.reprocessarFalhas);
router.post('/notificacoes/processar', authenticateToken, requireAdmin, notificacoesController.processarFila);

// Rotas protegidas - Dashboard
router.get('/dashboard/indicadores', authenticateToken, dashboardController.indicadores);

// Rotas protegidas - Chamados de Suporte
router.get('/chamados', authenticateToken, chamadosController.listar);
router.post('/chamados', authenticateToken, chamadosController.criar);
router.get('/chamados/admin/dashboard', authenticateToken, requireAdmin, chamadosController.dashboardAdmin);
router.get('/chamados/minhas-estatisticas', authenticateToken, chamadosController.minhasEstatisticas);
router.get('/chamados/:id', authenticateToken, chamadosController.buscarPorId);
router.put('/chamados/:id', authenticateToken, chamadosController.atualizar);
router.delete('/chamados/:id', authenticateToken, chamadosController.deletar);
router.get('/chamados/:id/comentarios', authenticateToken, chamadosController.listarComentarios);
router.post('/chamados/:id/comentarios', authenticateToken, chamadosController.criarComentario);
router.post('/chamados/comentarios/anexos', authenticateToken, upload.array('anexos', 5), chamadosController.uploadAnexos);
router.get('/chamados/anexos/:id', authenticateToken, chamadosController.getAnexo);

// Rotas protegidas - Stripe Payment (Setup Intent)
router.post('/stripe/setup-intent', authenticateToken, stripePaymentController.criarSetupIntent);

// Rotas protegidas - Stripe Subscription
router.post('/stripe/subscription', authenticateToken, stripeSubscriptionController.criarSubscription);

// Rotas protegidas - Stripe Metrics (apenas ADMIN)
router.get('/stripe/metrics', authenticateToken, requireAdmin, stripeMetricsController.obterMetricas);

// Rotas de Health Check
router.get('/health', healthCheckSimple); // Público — monitoramento externo (uptime, load balancers)
router.get('/health/full', authenticateToken, requireAdmin, healthCheck); // Protegido — detalhes internos
router.get('/health/dashboard', authenticateToken, requireAdmin, healthDashboard); // Protegido — dashboard HTML

// Rotas - Manutenções do Sistema
// ATENÇÃO: /manutencoes/ativas deve vir ANTES de /manutencoes/:id
router.get('/manutencoes/ativas', authenticateToken, manutencaoController.ativas);
router.get('/manutencoes', authenticateToken, requireAdmin, manutencaoController.listar);
router.post('/manutencoes', authenticateToken, requireAdmin, manutencaoController.criar);
router.put('/manutencoes/:id', authenticateToken, requireAdmin, manutencaoController.atualizar);
router.delete('/manutencoes/:id', authenticateToken, requireAdmin, manutencaoController.excluir);

// ============ PERD/Comp ============

// Empresas (uso comum para todos os módulos)
router.get('/perdcomp/empresas', authenticateToken, perdcompEmpresasController.listar);
router.get('/perdcomp/empresas/cnpj/:cnpj', authenticateToken, perdcompEmpresasController.buscarCNPJ);
router.get('/perdcomp/empresas/:id', authenticateToken, perdcompEmpresasController.buscarPorId);
router.post('/perdcomp/empresas', authenticateToken, perdcompEmpresasController.criar);
router.put('/perdcomp/empresas/:id', authenticateToken, perdcompEmpresasController.atualizar);
router.delete('/perdcomp/empresas/:id', authenticateToken, perdcompEmpresasController.excluir);

// Créditos
router.get('/perdcomp/creditos', authenticateToken, perdcompCreditosController.listar);
router.get('/perdcomp/creditos/:id', authenticateToken, perdcompCreditosController.buscarPorId);
router.post('/perdcomp/creditos', authenticateToken, perdcompCreditosController.criar);
router.put('/perdcomp/creditos/:id', authenticateToken, perdcompCreditosController.atualizar);
router.delete('/perdcomp/creditos/:id', authenticateToken, perdcompCreditosController.excluir);
router.post('/perdcomp/creditos/atualizar-selic', authenticateToken, perdcompCreditosController.atualizarSelic);

// Débitos
router.get('/perdcomp/debitos', authenticateToken, perdcompDebitosController.listar);
router.get('/perdcomp/debitos/:id', authenticateToken, perdcompDebitosController.buscarPorId);
router.post('/perdcomp/debitos', authenticateToken, perdcompDebitosController.criar);
router.put('/perdcomp/debitos/:id', authenticateToken, perdcompDebitosController.atualizar);
router.delete('/perdcomp/debitos/:id', authenticateToken, perdcompDebitosController.excluir);

// Pedidos
router.get('/perdcomp/pedidos', authenticateToken, perdcompPedidosController.listar);
router.get('/perdcomp/pedidos/:id', authenticateToken, perdcompPedidosController.buscarPorId);
router.post('/perdcomp/pedidos', authenticateToken, perdcompPedidosController.criar);
router.put('/perdcomp/pedidos/:id/status', authenticateToken, perdcompPedidosController.atualizarStatus);
router.delete('/perdcomp/pedidos/:id', authenticateToken, perdcompPedidosController.excluir);

// Dashboard, Simulador, Alertas
router.get('/perdcomp/dashboard', authenticateToken, perdcompDashboardController.obter);
router.post('/perdcomp/simulador', authenticateToken, perdcompSimuladorController.simular);
router.get('/perdcomp/alertas', authenticateToken, perdcompAlertasController.listar);
router.put('/perdcomp/alertas/:id/lido', authenticateToken, perdcompAlertasController.marcarLido);
router.post('/perdcomp/alertas/gerar', authenticateToken, perdcompAlertasController.gerarAlertas);

// IA
router.post('/perdcomp/ia/analisar', authenticateToken, perdcompIAController.analisar);
router.post('/perdcomp/ia/sugerir', authenticateToken, perdcompIAController.sugerir);
router.post('/perdcomp/ia/risco', authenticateToken, perdcompIAController.risco);
router.post('/perdcomp/ia/chat', authenticateToken, perdcompIAController.chat);

export default router;
