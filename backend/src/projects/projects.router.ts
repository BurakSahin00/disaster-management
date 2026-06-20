import { Router, Response, NextFunction } from 'express';
import { requireAuth, type AuthRequest } from '../auth/auth.middleware';
import { requireApiKey } from '../middleware/apiKey';
import { parseBody } from '../validation/zod';
import { zUpsertProject } from '../validation/schemas';
import {
  getProjectAnalysesForUser,
  listProjectsForUser,
  upsertProject,
} from './projects.service';

export const projectsRouter = Router();

projectsRouter.post('/', requireApiKey, requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const body = parseBody(zUpsertProject, req.body);
    const userId = req.user!.sub;
    const project = await upsertProject({ userId, name: body.name });
    res.status(201).json(project);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get('/', requireAuth, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.sub;
    const projects = await listProjectsForUser(userId);
    res.json(projects);
  } catch (err) {
    next(err);
  }
});

projectsRouter.get(
  '/:projectId/analyses',
  requireAuth,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const projectId = req.params['projectId'] as string;
      const userId = req.user!.sub;
      const payload = await getProjectAnalysesForUser(projectId, userId);
      if (!payload) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      res.json(payload);
    } catch (err) {
      next(err);
    }
  },
);
