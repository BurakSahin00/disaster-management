import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  loginUser,
  registerUser,
  submitRegistrationRequest,
  listRegistrationRequests,
  listUsers,
  approveRegistrationRequest,
  rejectRegistrationRequest,
} from './auth.service';
import { requireAuth, requireRole, type AuthRequest } from './auth.middleware';

export const authRouter = Router();

// POST /auth/login
authRouter.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'E-posta ve şifre zorunludur' });
      return;
    }
    const result = await loginUser(email, password);
    res.json(result);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Geçersiz')) {
      res.status(401).json({ error: err.message });
      return;
    }
    next(err);
  }
});

// POST /auth/register  — sadece admin kullanabilir
authRouter.post(
  '/register',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (req.user?.role !== 'admin') {
        res.status(403).json({ error: 'Kullanıcı oluşturma yetkisi sadece admin\'e aittir' });
        return;
      }
      const { email, password, role } = req.body as {
        email?: string;
        password?: string;
        role?: string;
      };
      if (!email || !password) {
        res.status(400).json({ error: 'E-posta ve şifre zorunludur' });
        return;
      }
      const validRoles = ['admin', 'analyst', 'viewer'];
      const userRole = validRoles.includes(role ?? '') ? (role as 'admin' | 'analyst' | 'viewer') : 'viewer';
      const result = await registerUser(email, password, userRole);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes('kayıtlı')) {
        res.status(409).json({ error: err.message });
        return;
      }
      next(err);
    }
  },
);

// GET /auth/me
authRouter.get('/me', requireAuth, (req: AuthRequest, res: Response) => {
  res.json(req.user);
});

// POST /auth/register-request  — public, no auth required
authRouter.post('/register-request', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'E-posta ve şifre zorunludur' });
      return;
    }
    const result = await submitRegistrationRequest(email, password);
    res.status(201).json(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message.includes('zaten kayıtlı') || err.message.includes('bekleyen bir talep')) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err.message.includes('en az 6')) {
        res.status(400).json({ error: err.message });
        return;
      }
    }
    next(err);
  }
});

// GET /auth/register-requests?status=pending  — admin only
authRouter.get(
  '/register-requests',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const status = typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
      const requests = await listRegistrationRequests(status);
      res.json(requests);
    } catch (err) {
      next(err);
    }
  },
);

// GET /auth/users  — admin only
authRouter.get(
  '/users',
  requireAuth,
  requireRole('admin'),
  async (_req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const users = await listUsers();
      res.json(users);
    } catch (err) {
      next(err);
    }
  },
);

// POST /auth/register-requests/:id/approve  — admin only
authRouter.post(
  '/register-requests/:id/approve',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { role } = req.body as { role?: string };
      if (!role || !['admin', 'analyst', 'viewer'].includes(role)) {
        res.status(400).json({ error: 'Geçersiz rol. admin, analyst veya viewer olmalıdır.' });
        return;
      }
      const user = await approveRegistrationRequest(
        req.params['id'] as string,
        role as 'admin' | 'analyst' | 'viewer',
        req.user!.sub,
      );
      res.status(201).json(user);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Talep bulunamadı') {
          res.status(404).json({ error: err.message });
          return;
        }
        if (err.message.includes('zaten işleme')) {
          res.status(409).json({ error: err.message });
          return;
        }
      }
      next(err);
    }
  },
);

// POST /auth/register-requests/:id/reject  — admin only
authRouter.post(
  '/register-requests/:id/reject',
  requireAuth,
  requireRole('admin'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { reason } = req.body as { reason?: string };
      const result = await rejectRegistrationRequest(
        req.params['id'] as string,
        req.user!.sub,
        reason,
      );
      res.json(result);
    } catch (err) {
      if (err instanceof Error) {
        if (err.message === 'Talep bulunamadı') {
          res.status(404).json({ error: err.message });
          return;
        }
        if (err.message.includes('zaten işleme')) {
          res.status(409).json({ error: err.message });
          return;
        }
      }
      next(err);
    }
  },
);
