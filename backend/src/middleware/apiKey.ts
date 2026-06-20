import type { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  // If not configured, keep dev experience frictionless.
  if (!config.apiKey) return next();

  const provided = req.header('x-api-key');
  if (!provided || provided !== config.apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
