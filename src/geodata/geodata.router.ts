import { Router, Request, Response, NextFunction } from 'express';
import { getAnalysisBuildingsGeoJSON, getAnalysisClustersGeoJSON, getAnalysisRegionsGeoJSON, recomputeRegionsAndClusters } from './geodata.service';

export const geodataRouter = Router();

geodataRouter.get('/analyses/:analysisId/buildings.geojson', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysisId = req.params['analysisId'] as string;
    const fc = await getAnalysisBuildingsGeoJSON(analysisId);
    res.json(fc);
  } catch (err) {
    next(err);
  }
});

geodataRouter.get('/analyses/:analysisId/regions.geojson', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysisId = req.params['analysisId'] as string;
    const fc = await getAnalysisRegionsGeoJSON(analysisId);
    res.json(fc);
  } catch (err) {
    next(err);
  }
});

geodataRouter.get('/analyses/:analysisId/clusters.geojson', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysisId = req.params['analysisId'] as string;
    const fc = await getAnalysisClustersGeoJSON(analysisId);
    res.json(fc);
  } catch (err) {
    next(err);
  }
});

// Manual trigger for derived layers (useful for debugging/tuning eps/minPoints).
geodataRouter.post('/analyses/:analysisId/recompute', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const analysisId = req.params['analysisId'] as string;
    const body = req.body as {
      gridType?: 'square' | 'hex';
      epsMeters?: number;
      minPoints?: number;
      gridSizeMeters?: number;
      clusterMinAvgDamageClass?: number;
      clusterMinCellCount?: number;
    } | undefined;
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
});

