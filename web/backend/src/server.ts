import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import dotenv from 'dotenv';
import cron from 'node-cron';
import routes from './routes';
import './database/connection';
import { ensurePerdcompSchema } from './database/ensurePerdcompSchema';
import { ensureDctfwebSchema } from './database/ensureDctfwebSchema';
import { runQuery as runQueryForBootCleanup } from './database/connection';
import { recarregarAgendamentoAutomacao } from './services/perdcompAutomacaoScheduler';
import notificacoesController from './controllers/notificacoesController';
import { getParametro } from './utils/parametrosHelper';
import { log } from './utils/logger';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const SERVER_NAME = process.env.SERVER_NAME || 'localhost';
const isProduction = process.env.NODE_ENV === 'production';

// Necessário para ler X-Forwarded-Proto e X-Forwarded-For corretamente
// quando a aplicação roda atrás de nginx/proxy reverso.
// '1' = confiar apenas no primeiro proxy imediato (o nginx)
if (isProduction) {
  app.set('trust proxy', 1);
}

// Middlewares
app.use(helmet({
  // CSP desabilitado aqui — controlado via meta tag no frontend (index.html)
  contentSecurityPolicy: false,
  // HSTS: instrui o browser a usar HTTPS por 1 ano, mesmo se o usuário digitar http://
  // includeSubDomains: aplica a todos os subdomínios
  // preload: permite submeter o domínio à lista HSTS do Chrome/Firefox (opcional)
  hsts: isProduction
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
    : false
}));

// Redirect HTTP → HTTPS em produção
// Funciona em conjunto com 'trust proxy': o nginx envia X-Forwarded-Proto ao Express
// Se a requisição chegou por HTTP, redirecionar permanentemente (301)
if (isProduction) {
  app.use((req, res, next) => {
    if (req.protocol === 'http') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    next();
  });
}

// Em produção: frontend é servido pelo próprio Express (mesma origem) — CORS não necessário
// Em dev: frontend roda no Vite (:5173) e precisa de CORS com credentials
if (!isProduction) {
  app.use(cors({
    origin: `http://${SERVER_NAME}:5173`,
    credentials: true,
    exposedHeaders: ['Content-Disposition']
  }));
}

// Cookie parser — necessário para ler cookies httpOnly do JWT
app.use(cookieParser());

// IMPORTANTE: Rota de webhook Stripe deve usar express.raw() ANTES de express.json()
// O Stripe precisa do body bruto para validar a assinatura
/* Comentado temporariamente para evitar erros de webhook durante desenvolvimento
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeWebhookController.handleWebhook
);
*/
// Aumentar limite de payload para suportar uploads de imagens em Base64
app.use(express.json({ limit: '3mb' }));
app.use(express.urlencoded({ limit: '3mb', extended: true }));

// Log de requisições
app.use((req, res, next) => {
  log.info(`Requisição recebida: ${req.method} ${req.path}`);
  next();
});

// Log de respostas não-2xx (monitoramento preventivo).
// 4xx → WARN  | 5xx → ERROR. Inclui status, método, path, tempo, usuário (se houver).
// Evita rotas de polling/streaming que não devem ruidar (/health, SSE).
app.use((req, res, next) => {
  const t0 = Date.now();
  const skipPaths = new Set(['/health', '/api/health', '/api/auth/me']);
  res.on('finish', () => {
    if (res.statusCode < 400) return;
    if (skipPaths.has(req.path) || req.path.startsWith('/api/stream/')) return;
    const dt = Date.now() - t0;
    const userId = (req as any).user?.id ?? '-';
    const msg = `HTTP ${res.statusCode} ${req.method} ${req.path} (${dt}ms, user=${userId})`;
    if (res.statusCode >= 500) log.error(msg);
    else log.warn(msg);
  });
  next();
});

// Rotas
app.use('/api', routes);

// Em produção: servir o frontend compilado (React build)
// O frontend é compilado em web/frontend/dist/ com `npm run build`
// __dirname aponta para web/backend/src/ (ts-node) ou web/backend/dist/ (compilado)
// Em ambos os casos, ../../frontend/dist resolve para web/frontend/dist
if (isProduction) {
  const frontendDist = path.join(__dirname, '../../frontend/dist');

  // Assets com hash no nome (JS/CSS gerados pelo Vite): cache imutável de 1 ano
  // Quando o conteúdo muda, o hash muda → browser baixa automaticamente
  app.use('/assets', express.static(path.join(frontendDist, 'assets'), {
    maxAge: '1y',
    immutable: true
  }));

  // index.html e demais arquivos sem hash: nunca cachear (garante SPA atualizado)
  app.use(express.static(frontendDist, { maxAge: 0 }));

  // SPA catch-all: qualquer rota não-API retorna o index.html
  // Necessário para React Router funcionar com refresh/deep links em produção
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Rota de health check
app.get('/health', (req, res) => {
  const { getCurrentTimestamp } = require('./utils/dateHelpers');
  res.json({ status: 'ok', timestamp: getCurrentTimestamp() });
});

// Iniciar servidor
app.listen(PORT, async () => {
  try {
    await ensurePerdcompSchema();
    log.info('[PERDCOMP] Schema garantido com sucesso');
    await ensureDctfwebSchema();
    // Limpeza de pipelines DCTFweb órfãos: marca como erro tudo que ficou
    // em 'em_andamento' no banco mas não tem mais processo rodando (restart
    // do backend, crash, kill -9). Sem isso a UI mostra empresas eternamente
    // "atualizando" e usuário não consegue disparar nova execução.
    try {
      const r = await runQueryForBootCleanup(
        `UPDATE dctfweb_automacao_config
            SET ultima_execucao_status = 'erro',
                ultima_execucao_msg    = COALESCE(NULLIF(ultima_execucao_msg, ''), '') || ' | Backend reiniciado — pipeline interrompido',
                atualizado_em          = NOW()
          WHERE ultima_execucao_status = 'em_andamento'`
      );
      if (r.changes > 0) log.warn(`[DCTFweb] Limpeza de boot: ${r.changes} pipeline(s) órfão(s) marcado(s) como erro`);
    } catch (e: any) {
      log.warn(`[DCTFweb] Limpeza de boot falhou: ${e.message}`);
    }
  } catch (error: any) {
    log.error(`[PERDCOMP] Falha ao garantir schema: ${error.message}`);
  }

  // Boot do agendador de automações do e-CAC (lê config_global e instala cron)
  try {
    await recarregarAgendamentoAutomacao();
  } catch (error: any) {
    log.error(`[PERDCOMP/Automacao] Falha ao iniciar scheduler: ${error.message}`);
  }

  log.info(`Servidor rodando na porta ${PORT}`);
  log.info(`Health check: http://${SERVER_NAME}:${PORT}/health`);
  log.info(`API disponível em: http://${SERVER_NAME}:${PORT}/api`);

  // ============================================================
  // CRON JOBS - Sistema de Notificações
  // ============================================================

  // Verificar se notificações estão habilitadas
  const notificacoesAtivadas = await getParametro('NOTIFICACAO_CRON', false);

  log.info(`[CRON] Sistema de notificações: ${notificacoesAtivadas === 'true' ? 'ATIVADO' : 'DESATIVADO'}`);

  if (notificacoesAtivadas === 'true') {

    // Job 1: Processar fila de notificações a cada 5 minutos
    // Envia emails de confirmação e lembretes pendentes
    // Validado em notificacoesController.processarFila
    cron.schedule('*/5 * * * *', async () => {
      try {
        log.info('[CRON] Executando processarFila...');
        const mockReq = { user: { perfil_id: 1 } } as any;
        const mockRes = {
          json: (data: any) => {
            log.info(`[CRON] processarFila concluído: ${data.processados} notificações processadas`);
          },
          status: (code: number) => ({
            json: (data: any) => {
              log.error(`[CRON] Erro ao processar fila (${code}): ${JSON.stringify(data)}`);
            }
          })
        } as any;

        await notificacoesController.processarFila(mockReq, mockRes);
      } catch (error: any) {
        log.error(`[CRON] Erro crítico ao processar fila: ${error}`);
      }
    });

    log.info('[CRON] ✓ Job processarFila agendado (a cada 5 minutos)');

    // Job 2: Auto-confirmar agendamentos a cada hora
    // Confirma automaticamente agendamentos quando prazo de remarcação expira
    // Validado em agendamentosController.autoConfirmar
    cron.schedule('0 * * * *', async () => {
      try {
        log.info('[CRON] Executando autoConfirmar...');
        const mockReq = { user: { perfil_id: 1 } } as any;
        const mockRes = {
          json: (data: any) => {
            log.info(`[CRON] autoConfirmar concluído: ${data.confirmados} agendamentos confirmados automaticamente`);
          },
          status: (code: number) => ({
            json: (data: any) => {
              log.error(`[CRON] Erro ao auto-confirmar (${code}): ${JSON.stringify(data)}`);
            }
          })
        } as any;

      } catch (error: any) {
        log.error(`[CRON] Erro crítico ao auto-confirmar: ${error}`);
      }
    });
    log.info('[CRON] ✓ Job autoConfirmar agendado (a cada hora)');

    // Job 3: Processar os aniversariantes do dia - diariamente às 6h
    // Confirma automaticamente agendamentos quando prazo de remarcação expira
    // Validado em notificacoesController.processarAniversariantes
    /*cron.schedule('0 6 * * *', async () => {
      try {
        log.info('[CRON] Executando processarAniversariantes...');
        const mockReq = { user: { perfil_id: 1 } } as any;
        const mockRes = {
          json: (data: any) => {
            log.info(`[CRON] processarAniversariantes concluído`);
          },
          status: (code: number) => ({
            json: (data: any) => {
              log.error(`[CRON] Erro ao processarAniversariantes (${code}): ${JSON.stringify(data)}`);
            }
          })
        } as any;

        await notificacoesController.processarAniversariantes(mockReq, mockRes);
      } catch (error: any) {
        log.error(`[CRON] Erro crítico ao processarAniversariantes: ${error}`);
      }
    });
    log.info('[CRON] ✓ Job processarAniversariantes agendado (diariamente às 6h)');
*/
    // Processar backlog de notificações pendentes ao iniciar o servidor
    // Garante que nenhuma notificação fique sem envio
    // Validado em notificacoesController.catchUp
    // Executa de forma assíncrona para não bloquear o start do servidor
    // TODO: 01 Verificar se realmente faz sentido manter este catch-up no start do servidor
    /*log.info('\n[CATCH-UP] Processando notificações pendentes...');
    try {
      const mockReq = { user: { perfil_id: 1 } } as any;
      const mockRes = {
        json: (data: any) => {
          log.info(`[CATCH-UP] Concluído: ${data.processados} notificações processadas`);
          log.info('\n[SERVER] Servidor pronto para receber requisições\n');
        },
        status: (code: number) => ({
          json: (data: any) => {
            log.error(`[CATCH-UP] Erro (${code}): ${JSON.stringify(data)}`);
            log.info('\n[SERVER] Servidor pronto para receber requisições (com avisos)\n');
          }
        })
      } as any;

      await notificacoesController.catchUp(mockReq, mockRes);
    } catch (error : any) {
      log.error(`[CATCH-UP] Erro ao processar backlog: ${error}`);
      log.info('\n[SERVER] Servidor pronto para receber requisições (com erros)\n');
    }*/
  } else {
    log.info('[CRON] ⚠️ Jobs de notificação desativados via parâmetro NOTIFICACAO_CRON');
  }

  // ============================================================
  // CRON JOBS - Sincronização Stripe
  // ============================================================

  // Job 4: Sincronizar Customers pendentes com Stripe a cada 30 minutos
  // Cria Customers no Stripe para assinaturas que ainda não têm stripe_customer_id
  // Validado em stripeCustomerSyncJob
  /* Comentado temporariamente para evitar erros de webhook durante desenvolvimento
  startStripeCustomerSyncJob();
  log.info('[CRON] ✓ Job Stripe Customer Sync agendado (a cada 30 minutos)');
  */
  // Job 5: Deletar assinaturas abandonadas (sem subscription após 24h)
  // Remove fisicamente do banco assinaturas não convertidas
  // Validado em abandonedSubscriptionsJob
  /* Comentado temporariamente para evitar erros de webhook durante desenvolvimento
  startAbandonedSubscriptionsJob();
  log.info('[CRON] ✓ Job Abandoned Subscriptions agendado (diariamente às 2h)');
  */

  // Job 6: Bloquear trials expirados sem assinatura paga
  // Marca como INADIMPLENTE usuários que não converteram o trial
  // Validado em trialExpirationJob
  /* Comentado temporariamente para evitar erros de webhook durante desenvolvimento
  startTrialExpirationJob();
  log.info('[CRON] ✓ Job Trial Expiration agendado (diariamente às 6h)');
  */
  // Job 7: Reconciliação entre banco e Stripe
  // Verifica divergências de status e sincroniza com realidade do Stripe
  // Validado em stripeReconciliationJob
  /* Comentado temporariamente para evitar erros de webhook durante desenvolvimento
  startStripeReconciliationJob();
  log.info('[CRON] ✓ Job Stripe Reconciliation agendado (diariamente às 3h)');
  */
});

export default app;

