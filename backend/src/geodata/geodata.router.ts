import { Router, Request, Response, NextFunction } from 'express';
import {
  getAnalysisBuildingsGeoJSONBbox,
  getAnalysisClustersGeoJSONBbox,
  getAnalysisRegionsGeoJSONBbox,
  recomputeRegionsAndClusters,
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
