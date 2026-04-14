import { Response, NextFunction } from 'express';
import { AuthRequest, PerfilEnum } from '../types';
import { log } from '../utils/logger';

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    log.error('Tentativa de acesso admin sem autenticação');
    return res.status(401).json({ error: 'Usuário não autenticado' });
  }

  if (req.user.perfil !== PerfilEnum.ADMIN) {
    log.error(`Usuário ${req.user.id} (${req.user.email}) tentou acessar recurso admin sem permissão`);
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores podem acessar este recurso.' });
  }

  next();
}

export function allowedProfiles(profiles: PerfilEnum[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      log.error('Tentativa de acesso a recurso protegido sem autenticação');
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }

    if (!profiles.includes(req.user.perfil as PerfilEnum)) {
      log.error(`Usuário ${req.user.id} (${req.user.email}) sem permissão para perfis: ${profiles.join(', ')}`);
      return res.status(403).json({ error: 'Acesso negado. Você não tem permissão para acessar este recurso.' });
    }

    next();
  };
}
