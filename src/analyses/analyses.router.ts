import { Router, Request, Response, NextFunction } from 'express';
import { createAnalysis, getAnalysis } from './analyses.service';
import { changeMapsRouter } from '../changemaps/changemaps.router';

export const analysesRouter = Router();

// Minimal ERD-aligned endpoints.
// Auth/RBAC is intentionally not implemented yet (see progress report).

analysesRouter.use('/:analysisId/change-maps', changeMapsRouter);

analysesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { userId?: string; preImageId?: string; postImageId?: string };
    if (!body.userId || !body.preImageId || !body.postImageId) {
      res.status(400).json({ error: 'userId, preImageId, postImageId are required.' });
      return;
    }
    const analysis = await createAnalysis({
      userId: body.userId,
      preImageId: body.preImageId,
      postImageId: body.postImageId,
    });
    res.status(201).json(analysis);
  } catch (err) {
    next(err);
  }
});

analysesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysis = await getAnalysis(req.params['id'] as string);
    if (!analysis) {
      res.status(404).json({ error: 'Analysis not found.' });
      return;
    }
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

