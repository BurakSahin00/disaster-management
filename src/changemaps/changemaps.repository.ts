import { Pool } from 'pg';
import { pool as defaultPool } from '../db';

export interface ChangeMap {
  id: string;
  analysis_id: string;
  uri: string;
  crs_wkt: string | null;
  bbox_4326: unknown | null;
  meta: Record<string, unknown> | null;
  created_at: Date;
}

export function createChangeMapsRepository(db: Pool) {
  return {
    async create(input: {
      id: string;
      analysisId: string;
      uri: string;
      crsWkt?: string | null;
      bbox4326GeoJSON?: Record<string, unknown> | null;
      meta?: Record<string, unknown> | null;
    }): Promise<ChangeMap> {
      const { rows } = await db.query<ChangeMap>(
        `INSERT INTO change_maps (id, analysis_id, uri, crs_wkt, bbox_4326, meta)
         VALUES ($1, $2, $3, $4,
           CASE WHEN $5::jsonb IS NULL THEN NULL ELSE ST_SetSRID(ST_GeomFromGeoJSON($5::text), 4326) END,
           $6::jsonb
         )
         RETURNING *`,
        [
          input.id,
          input.analysisId,
          input.uri,
          input.crsWkt ?? null,
          input.bbox4326GeoJSON ? JSON.stringify(input.bbox4326GeoJSON) : null,
          input.meta ? JSON.stringify(input.meta) : null,
        ],
      );
      if (!rows[0]) throw new Error(`INSERT did not return a row for change_map ${input.id}`);
      return rows[0];
    },
  };
}

export const changeMapsRepository = createChangeMapsRepository(defaultPool);

