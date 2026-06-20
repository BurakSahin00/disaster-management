import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from './auth.service';

export interface AuthRequest extends Request {
  user?: TokenPayload;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.header('Authorization');
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
    return;
  }

  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Geçersiz veya süresi dolmuş token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Kimlik doğrulama gerekli' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Bu işlem için yetkiniz yok' });
      return;
    }
    next();
  };
}
