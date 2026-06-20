import { Router, Request, Response, NextFunction } from 'express';
import {
  getAnalysisBuildingsGeoJSONBbox,
  getAnalysisClustersGeoJSONBbox,
  getAnalysisRegionsGeoJSONBbox,
} from '../geodata/geodata.service';

type BBox4326 = [number, number, number, number];

function parseBbox(queryVal: unknown): BBox4326 | undefined {
  if (typeof queryVal !== 'string') return undefined;
  const parts = queryVal.split(',').map(Number);
  if (parts.length !== 4) return undefined;
  if (!parts.every((n) => Number.isFinite(n))) return undefined;
  return parts as BBox4326;
}

const COLLECTIONS = [
  {
    id: 'buildings',
    title: 'Building damages',
    description: 'Building footprints with damage class.',
  },
  { id: 'regions', title: 'Regional damage', description: 'Derived regional cells with severity.' },
  { id: 'clusters', title: 'Damage clusters', description: 'Derived impact zones (clusters).' },
] as const;

export const ogcRouter = Router();

ogcRouter.get('/collections', (_req: Request, res: Response) => {
  res.json({
    collections: COLLECTIONS.map((c) => ({
      id: c.id,
      title: c.title,
      description: c.description,
      links: [
        { href: `/ogc/collections/${c.id}`, rel: 'self', type: 'application/json' },
        { href: `/ogc/collections/${c.id}/items`, rel: 'items', type: 'application/geo+json' },
      ],
    })),
    links: [{ href: '/ogc/collections', rel: 'self', type: 'application/json' }],
  });
});

ogcRouter.get('/collections/:collectionId', (req: Request, res: Response) => {
  const collectionId = req.params['collectionId'] as string;
  const c = COLLECTIONS.find((x) => x.id === collectionId);
  if (!c) {
    res.status(404).json({ error: 'Collection not found.' });
    return;
  }
  res.json({
    id: c.id,
    title: c.title,
    description: c.description,
    crs: ['http://www.opengis.net/def/crs/OGC/1.3/CRS84'],
    links: [
      { href: `/ogc/collections/${c.id}`, rel: 'self', type: 'application/json' },
      { href: `/ogc/collections/${c.id}/items`, rel: 'items', type: 'application/geo+json' },
    ],
  });
});

ogcRouter.get(
  '/collections/:collectionId/items',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const collectionId = req.params['collectionId'] as string;
      const analysisId =
        typeof req.query['analysisId'] === 'string'
          ? (req.query['analysisId'] as string)
          : undefined;
      if (!analysisId) {
        res.status(400).json({ error: 'analysisId query param is required.' });
        return;
      }
      const bbox = parseBbox(req.query['bbox']);

      if (collectionId === 'buildings') {
        res.json(await getAnalysisBuildingsGeoJSONBbox({ analysisId, bbox4326: bbox }));
        return;
      }
      if (collectionId === 'regions') {
        res.json(await getAnalysisRegionsGeoJSONBbox({ analysisId, bbox4326: bbox }));
        return;
      }
      if (collectionId === 'clusters') {
        res.json(await getAnalysisClustersGeoJSONBbox({ analysisId, bbox4326: bbox }));
        return;
      }

      res.status(404).json({ error: 'Collection not found.' });
    } catch (err) {
      next(err);
    }
  },
);
