import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { changeMapsRepository } from './changemaps.repository';
import { requireApiKey } from '../middleware/apiKey';
import { parseBody } from '../validation/zod';
import { zRegisterChangeMap } from '../validation/schemas';

export const changeMapsRouter = Router({ mergeParams: true });

// Minimal registration endpoint:
// POST /analyses/:analysisId/change-maps  { uri, crsWkt?, bbox4326GeoJSON?, meta? }
changeMapsRouter.post(
  '/',
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const body = parseBody(zRegisterChangeMap, req.body);
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
  },
);
