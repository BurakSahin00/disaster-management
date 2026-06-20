import { Pool } from 'pg';
import { pool as defaultPool } from '../db';

export interface SatelliteImage {
  id: string;
  uri: string;
  crs_wkt: string | null;
  width_px: number | null;
  height_px: number | null;
  bands: number | null;
  bbox_4326: unknown | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
}

type CreateInput = Pick<SatelliteImage, 'id' | 'uri'> &
  Partial<Pick<SatelliteImage, 'crs_wkt' | 'width_px' | 'height_px' | 'bands'>> & {
    meta?: Record<string, unknown> | null;
    bbox_4326_geojson?: Record<string, unknown> | null;
  };

export function createImagesRepository(db: Pool) {
  return {
    async create(input: CreateInput): Promise<SatelliteImage> {
      const { rows } = await db.query<SatelliteImage>(
        `INSERT INTO satellite_images (id, uri, crs_wkt, width_px, height_px, bands, bbox_4326, meta)
         VALUES ($1, $2, $3, $4, $5, $6,
           CASE WHEN $7::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326) END,
           $8::jsonb
         )
         RETURNING *`,
        [
          input.id,
          input.uri,
          input.crs_wkt ?? null,
          input.width_px ?? null,
          input.height_px ?? null,
          input.bands ?? null,
          input.bbox_4326_geojson ? JSON.stringify(input.bbox_4326_geojson) : null,
          input.meta ? JSON.stringify(input.meta) : null,
        ],
      );
      if (!rows[0]) throw new Error(`INSERT did not return a row for satellite_image ${input.id}`);
      return rows[0];
    },

    async findById(id: string): Promise<SatelliteImage | null> {
      const { rows } = await db.query<SatelliteImage>(
        'SELECT * FROM satellite_images WHERE id = $1',
        [id],
      );
      return rows[0] ?? null;
    },
  };
}

export const imagesRepository = createImagesRepository(defaultPool);
