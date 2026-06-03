/**
 * Rate Limiting Adaptativo
 *
 * Estratégias implementadas:
 *
 * 1. BLOQUEIO POR IP (credential stuffing)
 *    O sistema já tem bloqueio por conta (tentativas_login no banco).
 *    Este middleware adiciona rastreamento por IP — se um mesmo IP falha
 *    em múltiplas contas diferentes, o IP é progressivamente bloqueado:
 *      - 3 falhas → delay de 5 min
 *      - 5 falhas → delay de 30 min
 *      - 10 falhas → delay de 2 horas
 *
 * 2. RATE LIMIT TIERED (rotas autenticadas)
 *    Admins têm limite maior do que usuários comuns.
 *    Usuários com comportamento suspeito (muitos 4xx em 15 min) têm limite reduzido.
 *
 * Importante: esses dados são mantidos em memória (Map).
 * Em caso de restart do servidor os contadores resetam — comportamento aceitável
 * para um servidor single-process. Para multi-process, usar Redis store.
 */

import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { log } from '../utils/logger';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

interface IpFailureRecord {
  count: number;
  firstFailAt: number;
  blockedUntil?: number;
}

interface ActivityRecord {
  errors4xx: number;
  windowStart: number;
}

// ─── Armazenamento em memória ──────────────────────────────────────────────────

const ipLoginFailures = new Map<string, IpFailureRecord>();
const suspiciousActivity = new Map<string, ActivityRecord>();

// Limpeza periódica de registros expirados (a cada 10 min)
setInterval(() => {
  const now = Date.now();

  for (const [ip, record] of ipLoginFailures.entries()) {
    const blockExpired = record.blockedUntil && record.blockedUntil < now;
    const windowExpired = !record.blockedUntil && now - record.firstFailAt > 3_600_000;
    if (blockExpired || windowExpired) ipLoginFailures.delete(ip);
  }

  for (const [key, record] of suspiciousActivity.entries()) {
    if (now - record.windowStart > 15 * 60_000) suspiciousActivity.delete(key);
  }
}, 10 * 60_000);

// ─── Helpers internos ──────────────────────────────────────────────────────────

function normalizeIp(req: Request): string {
  const raw = req.ip || req.socket?.remoteAddress || 'unknown';
  // IPv4-mapped IPv6 → IPv4
  return raw.replace(/^::ffff:/, '');
}

function getBlockDuration(failCount: number): number | undefined {
  if (failCount >= 10) return 2 * 60 * 60_000;  // 2 horas
  if (failCount >= 5)  return 30 * 60_000;       // 30 min
  if (failCount >= 3)  return 5 * 60_000;        // 5 min
  return undefined;
}

// ─── API pública: chamada pelo authController ──────────────────────────────────

/**
 * Registra uma falha de login para o IP.
 * Deve ser chamado quando login falha por senha errada ou usuário inexistente.
 */
export function recordLoginFailure(ip: string): void {
  // Normalizar aqui pois o controller passa req.ip bruto (ex: ::ffff:127.0.0.1)
  // e o guard usa normalizeIp(req) — sem isso as chaves não batem no Map
  const key = ip.replace(/^::ffff:/, '');
  const now = Date.now();
  const existing = ipLoginFailures.get(key);

  if (!existing || now - existing.firstFailAt > 3_600_000) {
    // Primeira falha ou janela expirada → resetar contador
    ipLoginFailures.set(key, { count: 1, firstFailAt: now });
    return;
  }

  const newCount = existing.count + 1;
  const blockedUntil = getBlockDuration(newCount)
    ? now + getBlockDuration(newCount)!
    : existing.blockedUntil;

  ipLoginFailures.set(key, { count: newCount, firstFailAt: existing.firstFailAt, blockedUntil });

  if (blockedUntil) {
    const minutos = Math.ceil((blockedUntil - now) / 60_000);
    log.warn(`IP ${key} bloqueado por ${minutos} min após ${newCount} falhas de login`);
  }
}

/**
 * Reseta o histórico de falhas do IP após login bem-sucedido.
 */
export function resetLoginFailures(ip: string): void {
  ipLoginFailures.delete(ip.replace(/^::ffff:/, ''));
}

/**
 * Limpa todos os registros de falha de IP.
 * USO EXCLUSIVO em ambiente de desenvolvimento/testes.
 */
export function clearAllIpFailures(): void {
  ipLoginFailures.clear();
  suspiciousActivity.clear();
}

// ─── Middleware 1: Guard de login por IP ───────────────────────────────────────

/**
 * Aplicar ANTES da rota POST /auth/login.
 * Rejeita IPs que excederam o limite de falhas.
 */
export function adaptiveLoginGuard(req: Request, res: Response, next: NextFunction): void {
  const ip = normalizeIp(req);
  const now = Date.now();
  const record = ipLoginFailures.get(ip);

  if (record?.blockedUntil && record.blockedUntil > now) {
    const retryAfterSecs = Math.ceil((record.blockedUntil - now) / 1000);
    const retryAfterMin  = Math.ceil(retryAfterSecs / 60);

    res.setHeader('Retry-After', String(retryAfterSecs));
    log.warn(`Muitas tentativas de login deste IP ${ip}. Bloqueado por ${retryAfterMin} min após ${record.count} falhas de login`);
    res.status(429).json({
      error: 'Muitas tentativas de login deste IP.',
      message: `Tente novamente em ${retryAfterMin} minuto${retryAfterMin !== 1 ? 's' : ''}.`,
      retry_after: retryAfterSecs
    });
    return;
  }

  next();
}

// ─── Middleware 2: Rate limit tiered para rotas autenticadas ───────────────────

// Admin: 2000 req / 15 min → ~133 req/min (uso intenso do painel + polling de sync)
const limiterAdmin = rateLimit({
  windowMs: 15 * 60_000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  // skip garante req.user sempre definido quando keyGenerator executa
  keyGenerator: (req: any) => `admin:${req.user.id}`,
  message: { error: 'Limite de requisições atingido. Aguarde alguns minutos.' },
  skip: (req: any) => !req.user
});

// Usuário padrão: 750 req / 15 min → ~50 req/min (acomoda polling de sincronização
// e múltiplas abas/sessões em desenvolvimento sem disparar 429).
const limiterUser = rateLimit({
  windowMs: 15 * 60_000,
  max: 750,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `user:${req.user.id}`,
  message: { error: 'Limite de requisições atingido. Aguarde alguns minutos.' },
  skip: (req: any) => !req.user
});

// Suspeito: 40 req / 15 min (atividade anômala detectada)
const limiterSuspicious = rateLimit({
  windowMs: 15 * 60_000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => `suspicious:${req.user.id}`,
  message: { error: 'Atividade incomum detectada. Limite temporariamente reduzido.' },
  skip: (req: any) => !req.user
});

/**
 * Rastreia respostas 4xx de um usuário autenticado para detecção de comportamento suspeito.
 * Chamado internamente pelo adaptiveAuthRateLimit.
 */
function trackUserActivity(userId: string, statusCode: number): void {
  if (statusCode < 400 || statusCode >= 500) return;

  const now = Date.now();
  const existing = suspiciousActivity.get(userId);

  if (!existing || now - existing.windowStart > 15 * 60_000) {
    suspiciousActivity.set(userId, { errors4xx: 1, windowStart: now });
  } else {
    existing.errors4xx += 1;
    // Log ao atingir o limiar
    if (existing.errors4xx === 20) {
      log.warn(`Usuário ${userId} atingiu 20 erros 4xx em 15 min — limite reduzido aplicado`);
    }
  }
}

function isSuspiciousUser(userId: string): boolean {
  const record = suspiciousActivity.get(userId);
  if (!record) return false;
  if (Date.now() - record.windowStart > 15 * 60_000) return false;
  return record.errors4xx >= 20;
}

/**
 * Aplicar nas rotas autenticadas (após authenticateToken).
 * Seleciona o limiter correto com base no perfil e comportamento do usuário.
 */
export function adaptiveAuthRateLimit(req: any, res: Response, next: NextFunction): void {
  // req.user pode estar undefined se chamado via router.use global (antes de authenticateToken per-route).
  // Resolver o JWT do cookie aqui para identificar o usuário para fins de rate limiting.
  // O authenticateToken per-route continua sendo a checagem de autorização definitiva.
  if (!req.user && req.cookies?.token) {
    try {
      req.user = jwt.verify(req.cookies.token, process.env.JWT_SECRET!) as any;
    } catch { /* token inválido/expirado — tratado pelo authenticateToken da rota */ }
  }

  if (!req.user) return next();

  const userId = String(req.user.id);
  const perfil  = (req.user.perfil ?? '').toLowerCase();

  // Intercepta o fim da resposta para rastrear erros 4xx
  const originalEnd = res.end.bind(res);
  (res as any).end = function (...args: any[]) {
    trackUserActivity(userId, res.statusCode);
    return originalEnd(...args);
  };

  if (isSuspiciousUser(userId)) {
    return limiterSuspicious(req, res, next);
  }

  if (perfil === 'admin' || perfil === 'administrador') {
    return limiterAdmin(req, res, next);
  }

  return limiterUser(req, res, next);
}
