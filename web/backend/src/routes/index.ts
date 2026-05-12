import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { getAll, getOne } from '../database/connection';
import { authController } from '../controllers/authController';
import { usuariosController } from '../controllers/usuariosController';
import { parametrosController } from '../controllers/parametrosController';
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
import { manutencaoController } from '../controllers/manutencaoController';
import { frontendLogController } from '../controllers/frontendLogController';
import {
  perdcompCreditosController, perdcompDebitosController,
  perdcompDashboardController, perdcompSimuladorController,
} from '../controllers/perdcompController';
import { ecacCertificadoController, ecacSincronizacaoController } from '../controllers/ecacController';
import {
  perdcompDocumentosController, creditoTributarioController, debitoDocumentoController,
  responsavelPreenchimentoController, recibosController,
} from '../controllers/perdcompDocumentosController';
import { perdcompRelatoriosController } from '../controllers/perdcompRelatoriosController';
import { dctfwebController } from '../controllers/dctfwebController';
import { log } from '../utils/logger';
import { empresasController } from '../controllers/empresasController';
import { clientesController } from '../controllers/clientesController';
import { perfisController } from '../controllers/perfisController';
import { ncmTabelaController } from '../controllers/ncmTabelaController';

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
       WHERE executado_em >= NOW() - INTERVAL '48 hours'`
    );

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      ultimas_execucoes: ultimasExecucoes,
      estatisticas_48h: estatisticas
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

// Rotas protegidas - Perfil do usuário logado (deve vir ANTES de /:id)
router.get('/usuarios/me', authenticateToken, usuariosController.buscarMeuPerfil);
router.put('/usuarios/me', authenticateToken, usuariosController.atualizarMeuPerfil);
// Rotas protegidas - Usuários (apenas ADMIN)
router.get('/usuarios', authenticateToken, adaptiveAuthRateLimit, requireAdmin, usuariosController.listar);
router.get('/usuarios/:id', authenticateToken, requireAdmin, usuariosController.buscarPorId);
router.post('/usuarios', authenticateToken, requireAdmin, usuariosController.criar);
router.put('/usuarios/:id', authenticateToken, requireAdmin, usuariosController.atualizar);
router.put('/usuarios/:id/senha', authenticateToken, alterarSenha);
router.put('/usuarios/:id/desbloquear', authenticateToken, requireAdmin, usuariosController.desbloquear);
router.delete('/usuarios/:id', authenticateToken, requireAdmin, usuariosController.inativar);
router.get('/usuarios/:id/perfis', authenticateToken, requireAdmin, usuariosController.buscarPerfisDoUsuario);
router.put('/usuarios/:id/perfis', authenticateToken, requireAdmin, usuariosController.sincronizarPerfisDoUsuario);

// Rota pública - Stripe Publishable Key (necessária para formulário de pagamento público)
// IMPORTANTE: Deve vir ANTES das rotas protegidas de parâmetros para não ser capturada por /parametros/:id
router.get('/parametros/stripe-publishable-key', parametrosController.obterStripePublishableKey);

// Rotas protegidas - Parâmetros (apenas ADMIN)
router.get('/parametros', authenticateToken, requireAdmin, parametrosController.listar);
router.get('/parametros/:id', authenticateToken, requireAdmin, parametrosController.buscarPorId);
router.put('/parametros/:id', authenticateToken, requireAdmin, parametrosController.atualizar);

// Rotas protegidas - Log de Login (apenas ADMIN)
router.get('/login-log', authenticateToken, requireAdmin, loginLogController.listar);

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

// Perfis de acesso
router.get('/perfis/menu', authenticateToken, perfisController.arvoreMenu);
router.get('/perfis', authenticateToken, requireAdmin, perfisController.listar);
router.get('/perfis/:id', authenticateToken, requireAdmin, perfisController.buscarPorId);
router.post('/perfis', authenticateToken, requireAdmin, perfisController.criar);
router.put('/perfis/:id', authenticateToken, requireAdmin, perfisController.atualizar);
router.delete('/perfis/:id', authenticateToken, requireAdmin, perfisController.excluir);

// Clientes (apenas ADMIN)
router.get('/clientes', authenticateToken, requireAdmin, clientesController.listar);
router.get('/clientes/:id', authenticateToken, requireAdmin, clientesController.buscarPorId);
router.post('/clientes', authenticateToken, requireAdmin, clientesController.criar);
router.put('/clientes/:id', authenticateToken, requireAdmin, clientesController.atualizar);
router.patch('/clientes/:id/ativo', authenticateToken, requireAdmin, clientesController.alternarAtivo);
router.delete('/clientes/:id', authenticateToken, requireAdmin, clientesController.excluir);

// NCM Tabela (apenas ADMIN)
router.get('/ncm-tabela', authenticateToken, requireAdmin, ncmTabelaController.listar);
router.get('/ncm-tabela/:id', authenticateToken, requireAdmin, ncmTabelaController.buscarPorId);
router.post('/ncm-tabela', authenticateToken, requireAdmin, ncmTabelaController.criar);
router.put('/ncm-tabela/:id', authenticateToken, requireAdmin, ncmTabelaController.atualizar);
router.patch('/ncm-tabela/:id/status', authenticateToken, requireAdmin, ncmTabelaController.alternarStatus);
router.delete('/ncm-tabela/:id', authenticateToken, requireAdmin, ncmTabelaController.excluir);

// Empresas (uso comum para todos os módulos)
router.get('/empresas', authenticateToken, empresasController.listar);
router.get('/empresas/cnpj/:cnpj', authenticateToken, empresasController.buscarCNPJ);
router.get('/empresas/:id', authenticateToken, empresasController.buscarPorId);
router.post('/empresas', authenticateToken, empresasController.criar);
router.put('/empresas/:id', authenticateToken, empresasController.atualizar);
router.delete('/empresas/:id', authenticateToken, empresasController.excluir);

// ============ PER/DComp ============

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

// Dashboard
router.get('/perdcomp/dashboard', authenticateToken, perdcompDashboardController.obter);

// Simulador (Manual e Automático)
router.post('/perdcomp/simulador',             authenticateToken, perdcompSimuladorController.simular);
router.post('/perdcomp/simulador/automatico',  authenticateToken, perdcompSimuladorController.automatico);
router.get ('/perdcomp/simulador/historico',   authenticateToken, perdcompSimuladorController.sugerirHistorico);
router.post('/perdcomp/simulador/parse-texto', authenticateToken, perdcompSimuladorController.parseTexto);

// ============ DCTF Web ============
router.get('/dctfweb/dashboard', authenticateToken, dctfwebController.dashboard);
router.get('/dctfweb/declaracoes', authenticateToken, dctfwebController.listar);
router.get('/dctfweb/declaracoes/:id', authenticateToken, dctfwebController.buscarPorId);
router.post('/dctfweb/declaracoes', authenticateToken, dctfwebController.criar);
router.put('/dctfweb/declaracoes/:id', authenticateToken, dctfwebController.atualizar);
router.delete('/dctfweb/declaracoes/:id', authenticateToken, dctfwebController.excluir);
router.post('/dctfweb/declaracoes/:id/darf', authenticateToken, dctfwebController.gerarDarf);
router.put('/dctfweb/declaracoes/:id/pago', authenticateToken, dctfwebController.marcarPago);

// ============ eCAC - Certificados Digitais ============
const uploadCert = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  // Aceita qualquer MIME — browsers/SOs enviam tipos variados para .pfx/.p12.
  // A validação real do conteúdo é feita no controller pelo certificadoService.
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.pfx') || name.endsWith('.p12')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos .pfx ou .p12 são aceitos'));
    }
  },
});

router.get('/ecac/certificados', authenticateToken, ecacCertificadoController.listar);
router.post('/ecac/certificados', authenticateToken, uploadCert.single('certificado'), ecacCertificadoController.upload);
router.post('/ecac/certificados/validar', authenticateToken, uploadCert.single('certificado'), ecacCertificadoController.validarArquivo);
router.get('/ecac/certificados/:id/validar', authenticateToken, ecacCertificadoController.validarPorId);
router.post('/ecac/certificados/:id/autenticar', authenticateToken, ecacCertificadoController.autenticar);
router.delete('/ecac/certificados/:id', authenticateToken, ecacCertificadoController.excluir);
router.patch('/ecac/certificados/:id/senha', authenticateToken, ecacCertificadoController.atualizarSenha);
router.delete('/ecac/certificados/:id/sessao', authenticateToken, ecacCertificadoController.limparSessao);
router.get('/ecac/certificados/:id/sessao', authenticateToken, ecacCertificadoController.statusSessao);
router.post('/ecac/certificados/:id/instalar-certificado', authenticateToken, ecacCertificadoController.instalarCertificado);
router.post('/ecac/certificados/:id/capturar-sessao-edge', authenticateToken, ecacCertificadoController.capturarSessaoEdge);

// eCAC - Sincronização
router.post('/ecac/sincronizar', authenticateToken, ecacSincronizacaoController.sincronizar);
// Importação automática usando sessão previamente autenticada (acionada pelo Dashboard)
router.post('/ecac/importar-automatico', authenticateToken, ecacSincronizacaoController.sincronizarAutomatico);
router.get('/ecac/sincronizacoes/ativa', authenticateToken, ecacSincronizacaoController.ativa);
router.post('/ecac/sincronizacoes/:id/pausar', authenticateToken, ecacSincronizacaoController.pausar);
router.post('/ecac/sincronizacoes/:id/retomar', authenticateToken, ecacSincronizacaoController.retomar);
router.post('/ecac/sincronizacoes/:id/cancelar', authenticateToken, ecacSincronizacaoController.cancelar);
router.get('/ecac/sincronizacoes/:id', authenticateToken, ecacSincronizacaoController.status);
router.get('/ecac/sincronizacoes', authenticateToken, ecacSincronizacaoController.historico);
// eCAC - Documentos PER/DCOMP importados
router.get('/ecac/perdcomp-documentos', authenticateToken, ecacSincronizacaoController.listarDocumentos);
router.get('/ecac/perdcomp-documentos/:id/recibo.pdf', authenticateToken, ecacSincronizacaoController.baixarReciboPdf);
router.get('/ecac/perdcomp-documentos/:id/debitos', authenticateToken, ecacSincronizacaoController.listarDebitosCompensados);
router.post('/ecac/baixar-recibos', authenticateToken, ecacSincronizacaoController.baixarRecibos);
router.post('/ecac/sincronizar-saldos', authenticateToken, ecacSincronizacaoController.sincronizarSaldos);

// ============ PER/DCOMP — Documentos Oficiais (novo módulo) ============

router.get('/perdcomp/documentos', authenticateToken, perdcompDocumentosController.listar);
router.get('/perdcomp/documentos/:id', authenticateToken, perdcompDocumentosController.buscarPorId);
router.post('/perdcomp/documentos', authenticateToken, perdcompDocumentosController.criar);
router.put('/perdcomp/documentos/:id', authenticateToken, perdcompDocumentosController.atualizar);
router.patch('/perdcomp/documentos/:id/status', authenticateToken, perdcompDocumentosController.atualizarStatus);
router.delete('/perdcomp/documentos/:id', authenticateToken, perdcompDocumentosController.excluir);
router.get('/perdcomp/documentos/:id/historico', authenticateToken, perdcompDocumentosController.historico);

// Crédito Tributário do documento
router.put('/perdcomp/documentos/:id/credito', authenticateToken, creditoTributarioController.salvar);

// Débitos do documento
router.get('/perdcomp/documentos/:id/debitos', authenticateToken, debitoDocumentoController.listar);
router.post('/perdcomp/documentos/:id/debitos', authenticateToken, debitoDocumentoController.criar);
router.put('/perdcomp/documentos/:id/debitos/:debitoId', authenticateToken, debitoDocumentoController.atualizar);
router.delete('/perdcomp/documentos/:id/debitos/:debitoId', authenticateToken, debitoDocumentoController.excluir);

// Responsável pelo preenchimento
router.put('/perdcomp/documentos/:id/responsavel', authenticateToken, responsavelPreenchimentoController.salvar);

// Recibos (geral + por documento)
router.get('/perdcomp/recibos', authenticateToken, recibosController.listar);
router.get('/perdcomp/documentos/:id/recibos', authenticateToken, recibosController.listar);
router.post('/perdcomp/documentos/:id/recibos', authenticateToken, recibosController.criar);
router.delete('/perdcomp/documentos/:id/recibos/:reciboId', authenticateToken, recibosController.excluir);

// ============ Relatórios PER/DCOMP (consolidados e-CAC + sistema) ============

router.get('/perdcomp/relatorios/dashboard', authenticateToken, perdcompRelatoriosController.dashboard);
router.get('/perdcomp/relatorios/saldos-disponiveis', authenticateToken, perdcompRelatoriosController.saldosDisponiveis);
router.get('/perdcomp/relatorios/prescricao', authenticateToken, perdcompRelatoriosController.prescricao);
router.get('/perdcomp/relatorios/retrabalho', authenticateToken, perdcompRelatoriosController.retrabalho);
router.get('/perdcomp/relatorios/compensacoes-em-risco', authenticateToken, perdcompRelatoriosController.compensacoesEmRisco);
router.get('/perdcomp/relatorios/controle-consolidado', authenticateToken, perdcompRelatoriosController.controleConsolidado);


export default router;
