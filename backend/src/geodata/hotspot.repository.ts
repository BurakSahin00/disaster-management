// backend/src/geodata/hotspot.repository.ts
import { Pool } from 'pg';
import { pool as defaultPool } from '../db';

export function createHotspotRepository(db: Pool = defaultPool) {
  return {
    async hasRegions(analysisId: string): Promise<boolean> {
      const { rows } = await db.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM region_damages WHERE analysis_id = $1) AS exists`,
        [analysisId],
      );
      return rows[0]?.exists ?? false;
    },

    async countHotspotCells(analysisId: string): Promise<number> {
      const { rows } = await db.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM hotspot_cells WHERE analysis_id = $1`,
        [analysisId],
      );
      return parseInt(rows[0]?.count ?? '0', 10);
    },

    async hasHotspotData(analysisId: string): Promise<boolean> {
      const { rows } = await db.query<{ exists: boolean }>(
        `SELECT EXISTS(SELECT 1 FROM hotspot_cells WHERE analysis_id = $1) AS exists`,
        [analysisId],
      );
      return rows[0]?.exists ?? false;
    },

    async getHotspotGeoJSON(
      analysisId: string,
      bbox4326?: [number, number, number, number],
    ): Promise<object> {
      const { rows } = await db.query<{ fc: object }>(
        `SELECT jsonb_build_object(
           'type', 'FeatureCollection',
           'features', COALESCE(jsonb_agg(
             jsonb_build_object(
               'type', 'Feature',
               'geometry', ST_AsGeoJSON(rd.geom_4326)::jsonb,
               'properties', jsonb_build_object(
                 'region_id',  hc.region_id,
                 'z_score',    hc.z_score,
                 'p_value',    hc.p_value,
                 'confidence', hc.confidence
               )
             )
           ), '[]'::jsonb)
         ) AS fc
         FROM hotspot_cells hc
         JOIN region_damages rd ON rd.id = hc.region_id
         WHERE hc.analysis_id = $1
           AND (
             $2::bool IS FALSE OR
             ST_Intersects(rd.geom_4326, ST_MakeEnvelope($3, $4, $5, $6, 4326))
           )`,
        [
          analysisId,
          bbox4326 ? true : false,
          bbox4326?.[0] ?? null,
          bbox4326?.[1] ?? null,
          bbox4326?.[2] ?? null,
          bbox4326?.[3] ?? null,
        ],
      );
      return rows[0]?.fc ?? { type: 'FeatureCollection', features: [] };
    },
  };
}

export const hotspotRepository = createHotspotRepository();
