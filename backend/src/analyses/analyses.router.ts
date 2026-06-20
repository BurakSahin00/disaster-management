import { Router, Request, Response, NextFunction } from 'express';
import { createAnalysis, getAnalysis } from './analyses.service';
import { changeMapsRouter } from '../changemaps/changemaps.router';
import {
  persistBuildingsGeoJSONToPostGIS,
  recomputeRegionsAndClusters,
} from '../geodata/geodata.service';
import { requireApiKey } from '../middleware/apiKey';
import { parseBody } from '../validation/zod';
import { zCreateAnalysis, zFeatureCollection } from '../validation/schemas';

export const analysesRouter = Router();

// Minimal ERD-aligned endpoints.
// Auth/RBAC is intentionally not implemented yet (see progress report).

analysesRouter.use('/:analysisId/change-maps', changeMapsRouter);

// Webhook-like ingest endpoint: ML engine can POST GeoJSON results.
analysesRouter.post(
  '/:analysisId/ingest/buildings',
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const fc = parseBody(zFeatureCollection, req.body);
      const result = await persistBuildingsGeoJSONToPostGIS({
        analysisId,
        featureCollection: fc,
      });
      await recomputeRegionsAndClusters({ analysisId });
      res.status(202).json(result);
    } catch (err) {
      next(err);
    }
  },
);

analysesRouter.post('/', requireApiKey, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = parseBody(zCreateAnalysis, req.body);
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
