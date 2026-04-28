import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { changeMapsRepository } from './changemaps.repository';

export const changeMapsRouter = Router({ mergeParams: true });

// Minimal registration endpoint:
// POST /analyses/:analysisId/change-maps  { uri, crsWkt?, bbox4326GeoJSON?, meta? }
changeMapsRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysisId = req.params['analysisId'] as string;
    const body = req.body as {
      uri?: string;
      crsWkt?: string;
      bbox4326GeoJSON?: Record<string, unknown>;
      meta?: Record<string, unknown>;
    };
    if (!body.uri) {
      res.status(400).json({ error: 'uri is required.' });
      return;
    }
    const id = crypto.randomUUID();
    const row = await changeMapsRepository.create({
      id,
      analysisId,
      uri: body.uri,
      crsWkt: body.crsWkt ?? null,
      bbox4326GeoJSON: body.bbox4326GeoJSON ?? null,
      meta: body.meta ?? null,
    });
    res.status(201).json({ id: row.id });
  } catch (err) {
    next(err);
  }
});

