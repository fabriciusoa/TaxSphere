import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthRequest, JWTPayload } from '../types';
import { log } from '../utils/logger';

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
  // Token lido exclusivamente do cookie httpOnly (SEC-04)
  const token = req.cookies?.token;

  if (!token) {
    log.warn(`Token não fornecido`);
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    req.user = decoded;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      log.warn(`Sessão expirada: ${error.message}`);
      return res.status(401).json({ error: 'sessao_expirada', message: 'Sessão expirada' });
    }
    log.warn(`Token inválido: ${error.message}`);
    return res.status(403).json({ error: 'Token inválido' });
  }
}
