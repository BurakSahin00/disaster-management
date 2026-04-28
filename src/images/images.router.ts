import { Router, Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';
import { imagesRepository } from './images.repository';

export const imagesRouter = Router();

// Minimal metadata registration. Upload-to-storage can be added later.
imagesRouter.post('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as {
      uri?: string;
      crsWkt?: string;
      widthPx?: number;
      heightPx?: number;
      bands?: number;
      bbox4326GeoJSON?: Record<string, unknown>;
      meta?: Record<string, unknown>;
    };
    if (!body.uri) {
      res.status(400).json({ error: 'uri is required.' });
      return;
    }

    const id = crypto.randomUUID();
    const row = await imagesRepository.create({
      id,
      uri: body.uri,
      crs_wkt: body.crsWkt ?? null,
      width_px: body.widthPx ?? null,
      height_px: body.heightPx ?? null,
      bands: body.bands ?? null,
      bbox_4326_geojson: body.bbox4326GeoJSON ?? null,
      meta: body.meta ?? null,
    });
    res.status(201).json({ id: row.id });
  } catch (err) {
    next(err);
  }
});

imagesRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const row = await imagesRepository.findById(req.params['id'] as string);
    if (!row) {
      res.status(404).json({ error: 'SatelliteImage not found.' });
      return;
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
});

