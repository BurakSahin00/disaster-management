import * as fs from 'fs';
import * as path from 'path';
import { jobsRepository } from '../jobs/jobs.repository';
import { Router, Request, Response, NextFunction } from 'express';
import {
  getAnalysisBuildingsGeoJSONBbox,
  getAnalysisClustersGeoJSONBbox,
  getAnalysisRegionsGeoJSONBbox,
  recomputeRegionsAndClusters,
  getPreImageForAnalysis,
} from './geodata.service';
import { requireApiKey } from '../middleware/apiKey';
import { parseBody } from '../validation/zod';
import { zRecompute } from '../validation/schemas';

export const geodataRouter = Router();

geodataRouter.get(
  '/analyses/:analysisId/buildings.geojson',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const bbox =
        typeof req.query['bbox'] === 'string' ? (req.query['bbox'] as string) : undefined;
      const bbox4326 = bbox ? bbox.split(',').map(Number) : undefined;
      const parsed =
        bbox4326 && bbox4326.length === 4 && bbox4326.every((n) => Number.isFinite(n))
          ? (bbox4326 as [number, number, number, number])
          : undefined;

      const fc = await getAnalysisBuildingsGeoJSONBbox({ analysisId, bbox4326: parsed });
      res.json(fc);
    } catch (err) {
      next(err);
    }
  },
);

geodataRouter.get(
  '/analyses/:analysisId/regions.geojson',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const bbox =
        typeof req.query['bbox'] === 'string' ? (req.query['bbox'] as string) : undefined;
      const bbox4326 = bbox ? bbox.split(',').map(Number) : undefined;
      const parsed =
        bbox4326 && bbox4326.length === 4 && bbox4326.every((n) => Number.isFinite(n))
          ? (bbox4326 as [number, number, number, number])
          : undefined;

      const fc = await getAnalysisRegionsGeoJSONBbox({ analysisId, bbox4326: parsed });
      res.json(fc);
    } catch (err) {
      next(err);
    }
  },
);

geodataRouter.get(
  '/analyses/:analysisId/clusters.geojson',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const bbox =
        typeof req.query['bbox'] === 'string' ? (req.query['bbox'] as string) : undefined;
      const bbox4326 = bbox ? bbox.split(',').map(Number) : undefined;
      const parsed =
        bbox4326 && bbox4326.length === 4 && bbox4326.every((n) => Number.isFinite(n))
          ? (bbox4326 as [number, number, number, number])
          : undefined;

      const fc = await getAnalysisClustersGeoJSONBbox({ analysisId, bbox4326: parsed });
      res.json(fc);
    } catch (err) {
      next(err);
    }
  },
);

// Manual trigger for derived layers (useful for debugging/tuning eps/minPoints).
geodataRouter.post(
  '/analyses/:analysisId/recompute',
  requireApiKey,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const body = parseBody(zRecompute, req.body);
      const result = await recomputeRegionsAndClusters({
        analysisId,
        gridType: body?.gridType,
        epsMeters: body?.epsMeters,
        minPoints: body?.minPoints,
        gridSizeMeters: body?.gridSizeMeters,
        clusterMinAvgDamageClass: body?.clusterMinAvgDamageClass,
        clusterMinCellCount: body?.clusterMinCellCount,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analyses/:analysisId/pre-image  →  { url, bounds } JSON metadata
geodataRouter.get(
  '/analyses/:analysisId/pre-image',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const meta = await getPreImageForAnalysis(analysisId);
      res.json(meta);
    } catch (err) {
      next(err);
    }
  },
);

// GET /analyses/:analysisId/pre-image.png  →  PNG binary
geodataRouter.get(
  '/analyses/:analysisId/pre-image.png',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysisId = req.params['analysisId'] as string;
      const job = await jobsRepository.findByAnalysisId(analysisId);
      if (!job) {
        res.status(404).json({ error: 'No job found for this analysis' });
        return;
      }
      const pngPath = path.join(job.output_dir, 'pre_preview.png');
      if (!fs.existsSync(pngPath)) {
        res.status(404).json({ error: 'Preview not generated yet. Call /pre-image first.' });
        return;
      }
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.sendFile(pngPath);
    } catch (err) {
      next(err);
    }
  },
);
