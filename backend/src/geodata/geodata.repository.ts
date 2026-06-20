import { Pool } from 'pg';
import { pool as defaultPool } from '../db';

export interface BuildingRow {
  id: string;
  geom_4326: unknown;
  props: Record<string, unknown> | null;
}

export interface BuildingDamageRow {
  id: string;
  analysis_id: string;
  building_id: string;
  damage_class: number;
  confidence: number | null;
  geom_4326: unknown | null;
  props: Record<string, unknown> | null;
}

export function createGeodataRepository(db: Pool) {
  return {
    async insertBuilding(input: {
      id: string;
      geomGeoJSON: object;
      props?: Record<string, unknown> | null;
    }): Promise<void> {
      await db.query(
        `INSERT INTO buildings (id, geom_4326, props)
         VALUES ($1, ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326))), $3::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           geom_4326 = EXCLUDED.geom_4326,
           props = EXCLUDED.props`,
        [
          input.id,
          JSON.stringify(input.geomGeoJSON),
          input.props ? JSON.stringify(input.props) : null,
        ],
      );
    },

    async insertBuildingDamage(input: {
      id: string;
      analysisId: string;
      buildingId: string;
      changeMapId?: string | null;
      damageClass: number;
      confidence?: number | null;
      geomGeoJSON?: object | null;
      props?: Record<string, unknown> | null;
    }): Promise<void> {
      await db.query(
        `INSERT INTO building_damages (id, analysis_id, building_id, change_map_id, damage_class, confidence, geom_4326, props)
         VALUES (
           $1, $2, $3, $4, $5, $6,
           CASE WHEN $7::text IS NULL THEN NULL ELSE ST_Multi(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($7::text), 4326))) END,
           $8::jsonb
         )
         ON CONFLICT (analysis_id, building_id) DO UPDATE SET
           change_map_id = COALESCE(EXCLUDED.change_map_id, building_damages.change_map_id),
           damage_class = EXCLUDED.damage_class,
           confidence = EXCLUDED.confidence,
           geom_4326 = COALESCE(EXCLUDED.geom_4326, building_damages.geom_4326),
           props = EXCLUDED.props`,
        [
          input.id,
          input.analysisId,
          input.buildingId,
          input.changeMapId ?? null,
          input.damageClass,
          input.confidence ?? null,
          input.geomGeoJSON ? JSON.stringify(input.geomGeoJSON) : null,
          input.props ? JSON.stringify(input.props) : null,
        ],
      );
    },

    async getBuildingsGeoJSONByAnalysis(
      analysisId: string,
      bbox4326?: [number, number, number, number],
    ): Promise<object> {
      const { rows } = await db.query<{ fc: object }>(
        `SELECT jsonb_build_object(
           'type','FeatureCollection',
           'features', COALESCE(jsonb_agg(
             jsonb_build_object(
               'type','Feature',
               'geometry', ST_AsGeoJSON(COALESCE(bd.geom_4326, b.geom_4326))::jsonb,
               'properties', jsonb_build_object(
                 'building_id', b.id,
                 'damage_class', bd.damage_class,
                 'confidence', bd.confidence
               ) || COALESCE(bd.props, '{}'::jsonb)
             )
           ), '[]'::jsonb)
         ) AS fc
         FROM building_damages bd
         JOIN buildings b ON b.id = bd.building_id
         WHERE bd.analysis_id = $1
           AND (
             $2::bool IS FALSE OR
             ST_Intersects(
               COALESCE(bd.geom_4326, b.geom_4326),
               ST_MakeEnvelope($3, $4, $5, $6, 4326)
             )
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

    async recomputeRegionsAndClustersFromBuildings(input: {
      analysisId: string;
      gridType?: 'square' | 'hex';
      epsMeters?: number;
      minPoints?: number;
      gridSizeMeters?: number;
      clusterMinAvgDamageClass?: number;
      clusterMinCellCount?: number;
    }): Promise<{ regions: number; clusters: number }> {
      const eps = input.epsMeters ?? 150;
      const minPts = input.minPoints ?? 1;
      const grid = input.gridSizeMeters ?? 250;
      // Cells with any damaged building (1–3) enter clustering; singleton-friendly defaults.
      const minAvg = input.clusterMinAvgDamageClass ?? 0.01;
      const minCells = input.clusterMinCellCount ?? 1;
      const gridType = input.gridType ?? 'square';

      // Wipes derived tables for the analysis, then regenerates:
      // - region_damages: grid cells over ALL building centroids (incl. class 0)
      // - clusters: DBSCAN over cells that contain at least one damaged building (class 1–3)
      // - cluster_regions: link cluster → region (square path; hex mirrors this)
      await db.query(
        'DELETE FROM cluster_regions WHERE cluster_id IN (SELECT id FROM clusters WHERE analysis_id = $1)',
        [input.analysisId],
      );
      await db.query('DELETE FROM clusters WHERE analysis_id = $1', [input.analysisId]);
      await db.query('DELETE FROM region_damages WHERE analysis_id = $1', [input.analysisId]);

      const squareSql = `
        -- 1) Convert building damages to metric points (EPSG:3857) and bin into a square grid.
        WITH pts AS (
          SELECT
            bd.analysis_id,
            bd.damage_class,
            ST_Transform(ST_Centroid(COALESCE(bd.geom_4326, b.geom_4326)), 3857) AS pt_3857
          FROM building_damages bd
          JOIN buildings b ON b.id = bd.building_id
          WHERE bd.analysis_id = $1
        ),
        binned AS (
          SELECT
            analysis_id,
            damage_class,
            (FLOOR(ST_X(pt_3857) / $3)::bigint * $3) AS gx,
            (FLOOR(ST_Y(pt_3857) / $3)::bigint * $3) AS gy
          FROM pts
        ),
        grid_cells AS (
          SELECT
            CONCAT($1, ':grid:', gx, ':', gy)::text AS region_id,
            $1::text AS analysis_id,
            ST_Transform(
              ST_Multi(
                ST_MakeEnvelope(gx, gy, gx + $3, gy + $3, 3857)
              ),
              4326
            )::geometry(MultiPolygon, 4326) AS geom_4326,
            AVG(damage_class)::float AS severity,
            jsonb_build_object(
              'cell_size_m', $3,
              'count', COUNT(*),
              'avg_damage_class', AVG(damage_class)::float,
              'damage_class_counts', jsonb_build_object(
                '0', SUM(CASE WHEN damage_class = 0 THEN 1 ELSE 0 END),
                '1', SUM(CASE WHEN damage_class = 1 THEN 1 ELSE 0 END),
                '2', SUM(CASE WHEN damage_class = 2 THEN 1 ELSE 0 END),
                '3', SUM(CASE WHEN damage_class = 3 THEN 1 ELSE 0 END)
              )
            ) AS stats
          FROM binned
          GROUP BY gx, gy
        ),
        inserted_regions AS (
          INSERT INTO region_damages (id, analysis_id, geom_4326, severity, stats)
          SELECT region_id, analysis_id, geom_4326, severity, stats
          FROM grid_cells
          ON CONFLICT (id) DO UPDATE SET
            geom_4326 = EXCLUDED.geom_4326,
            severity = EXCLUDED.severity,
            stats = EXCLUDED.stats
          RETURNING id, geom_4326, severity, stats
        ),
        -- 2) Cluster grid cells into impact zones (clusters).
        cluster_input AS (
          SELECT
            id AS region_id,
            geom_4326,
            severity,
            ST_Centroid(geom_4326) AS c
          FROM inserted_regions
          WHERE (
            COALESCE((stats->'damage_class_counts'->>'1')::int, 0)
            + COALESCE((stats->'damage_class_counts'->>'2')::int, 0)
            + COALESCE((stats->'damage_class_counts'->>'3')::int, 0)
          ) > 0
            AND severity >= $4
        ),
        clustered_regions AS (
          SELECT
            region_id,
            geom_4326,
            severity,
            ST_ClusterDBSCAN(ST_Transform(c, 3857), $2, $5) OVER () AS cid
          FROM cluster_input
        ),
        cluster_geoms AS (
          SELECT
            cid,
            ST_Multi(ST_UnaryUnion(ST_Collect(geom_4326)))::geometry(MultiPolygon, 4326) AS geom_4326,
            AVG(severity)::float AS severity,
            jsonb_build_object(
              'region_cells', COUNT(*),
              'avg_cell_severity', AVG(severity)::float,
              'eps_m', $2,
              'minpoints', $5
            ) AS stats
          FROM clustered_regions
          WHERE cid IS NOT NULL
          GROUP BY cid
          HAVING COUNT(*) >= $6
        ),
        inserted_clusters AS (
          INSERT INTO clusters (id, analysis_id, geom_4326, severity, stats)
          SELECT
            CONCAT($1, ':cluster:', cid)::text,
            $1,
            geom_4326,
            severity,
            stats
          FROM cluster_geoms
          ON CONFLICT (id) DO UPDATE SET
            geom_4326 = EXCLUDED.geom_4326,
            severity = EXCLUDED.severity,
            stats = EXCLUDED.stats
          RETURNING id
        )
        INSERT INTO cluster_regions (cluster_id, region_damage_id)
        SELECT
          CONCAT($1, ':cluster:', cr.cid)::text,
          cr.region_id
        FROM clustered_regions cr
        WHERE cr.cid IS NOT NULL
        ON CONFLICT DO NOTHING;
      `;

      const hexSql = `
        -- Requires PostGIS ST_HexagonGrid (PostGIS 3.x). If missing, caller must fallback.
        WITH pts AS (
          SELECT
            bd.analysis_id,
            bd.damage_class,
            ST_Transform(ST_Centroid(COALESCE(bd.geom_4326, b.geom_4326)), 3857) AS pt_3857
          FROM building_damages bd
          JOIN buildings b ON b.id = bd.building_id
          WHERE bd.analysis_id = $1
        ),
        bounds AS (
          SELECT ST_Envelope(ST_Extent(pt_3857))::geometry(Polygon, 3857) AS b
          FROM pts
        ),
        hex AS (
          SELECT
            (h).geom::geometry(Polygon, 3857) AS geom_3857,
            (h).i::int AS i,
            (h).j::int AS j
          FROM (
            SELECT ST_HexagonGrid($3::float8, (SELECT b FROM bounds)) AS h
          ) s
        ),
        assigned AS (
          SELECT
            p.damage_class,
            x.i,
            x.j
          FROM pts p
          JOIN hex x
            ON ST_Contains(x.geom_3857, p.pt_3857)
        ),
        grid_cells AS (
          SELECT
            CONCAT($1, ':hex:', i, ':', j)::text AS region_id,
            $1::text AS analysis_id,
            ST_Transform(ST_Multi(ST_Collect(DISTINCT geom_3857)), 4326)::geometry(MultiPolygon, 4326) AS geom_4326,
            AVG(damage_class)::float AS severity,
            jsonb_build_object(
              'grid', 'hex',
              'hex_size_m', $3,
              'count', COUNT(*),
              'avg_damage_class', AVG(damage_class)::float,
              'damage_class_counts', jsonb_build_object(
                '0', SUM(CASE WHEN damage_class = 0 THEN 1 ELSE 0 END),
                '1', SUM(CASE WHEN damage_class = 1 THEN 1 ELSE 0 END),
                '2', SUM(CASE WHEN damage_class = 2 THEN 1 ELSE 0 END),
                '3', SUM(CASE WHEN damage_class = 3 THEN 1 ELSE 0 END)
              )
            ) AS stats
          FROM assigned a
          JOIN hex h ON h.i = a.i AND h.j = a.j
          GROUP BY a.i, a.j
        ),
        inserted_regions AS (
          INSERT INTO region_damages (id, analysis_id, geom_4326, severity, stats)
          SELECT region_id, analysis_id, geom_4326, severity, stats
          FROM grid_cells
          ON CONFLICT (id) DO UPDATE SET
            geom_4326 = EXCLUDED.geom_4326,
            severity = EXCLUDED.severity,
            stats = EXCLUDED.stats
          RETURNING id, geom_4326, severity, stats
        ),
        cluster_input AS (
          SELECT
            id AS region_id,
            geom_4326,
            severity,
            ST_Centroid(geom_4326) AS c
          FROM inserted_regions
          WHERE (
            COALESCE((stats->'damage_class_counts'->>'1')::int, 0)
            + COALESCE((stats->'damage_class_counts'->>'2')::int, 0)
            + COALESCE((stats->'damage_class_counts'->>'3')::int, 0)
          ) > 0
            AND severity >= $4
        ),
        clustered_regions AS (
          SELECT
            region_id,
            geom_4326,
            severity,
            ST_ClusterDBSCAN(ST_Transform(c, 3857), $2, $5) OVER () AS cid
          FROM cluster_input
        ),
        cluster_geoms AS (
          SELECT
            cid,
            ST_Multi(ST_UnaryUnion(ST_Collect(geom_4326)))::geometry(MultiPolygon, 4326) AS geom_4326,
            AVG(severity)::float AS severity,
            jsonb_build_object(
              'region_cells', COUNT(*),
              'avg_cell_severity', AVG(severity)::float,
              'eps_m', $2,
              'minpoints', $5,
              'grid', 'hex'
            ) AS stats
          FROM clustered_regions
          WHERE cid IS NOT NULL
          GROUP BY cid
          HAVING COUNT(*) >= $6
        ),
        inserted_clusters AS (
          INSERT INTO clusters (id, analysis_id, geom_4326, severity, stats)
          SELECT
            CONCAT($1, ':cluster:', cid)::text,
            $1,
            geom_4326,
            severity,
            stats
          FROM cluster_geoms
          ON CONFLICT (id) DO UPDATE SET
            geom_4326 = EXCLUDED.geom_4326,
            severity = EXCLUDED.severity,
            stats = EXCLUDED.stats
          RETURNING id
        )
        INSERT INTO cluster_regions (cluster_id, region_damage_id)
        SELECT
          CONCAT($1, ':cluster:', cr.cid)::text,
          cr.region_id
        FROM clustered_regions cr
        WHERE cr.cid IS NOT NULL
        ON CONFLICT DO NOTHING;
      `;

      const params: unknown[] = [input.analysisId, eps, grid, minAvg, minPts, minCells];

      if (gridType === 'hex') {
        try {
          // Probe function availability.
          const { rows } = await db.query<{ ok: boolean }>(
            `SELECT EXISTS(SELECT 1 FROM pg_proc WHERE proname = 'st_hexagongrid') AS ok`,
          );
          if (rows[0]?.ok) {
            await db.query(hexSql, params);
          } else {
            await db.query(squareSql, params);
          }
        } catch {
          await db.query(squareSql, params);
        }
      } else {
        await db.query(squareSql, params);
      }

      const regionsCount = await db.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM region_damages WHERE analysis_id = $1',
        [input.analysisId],
      );
      const clustersCount = await db.query<{ n: string }>(
        'SELECT COUNT(*)::text AS n FROM clusters WHERE analysis_id = $1',
        [input.analysisId],
      );
      return {
        regions: Number(regionsCount.rows[0]?.n ?? '0'),
        clusters: Number(clustersCount.rows[0]?.n ?? '0'),
      };
    },

    async getRegionsGeoJSONByAnalysis(
      analysisId: string,
      bbox4326?: [number, number, number, number],
    ): Promise<object> {
      const { rows } = await db.query<{ fc: object }>(
        `SELECT jsonb_build_object(
           'type','FeatureCollection',
           'features', COALESCE(jsonb_agg(
             jsonb_build_object(
               'type','Feature',
               'geometry', ST_AsGeoJSON(rd.geom_4326)::jsonb,
               'properties', jsonb_build_object(
                 'region_id', rd.id,
                 'severity', rd.severity
               ) || COALESCE(rd.stats, '{}'::jsonb)
             )
           ), '[]'::jsonb)
         ) AS fc
         FROM region_damages rd
         WHERE rd.analysis_id = $1
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

    async getClustersGeoJSONByAnalysis(
      analysisId: string,
      bbox4326?: [number, number, number, number],
    ): Promise<object> {
      const { rows } = await db.query<{ fc: object }>(
        `SELECT jsonb_build_object(
           'type','FeatureCollection',
           'features', COALESCE(jsonb_agg(
             jsonb_build_object(
               'type','Feature',
               'geometry', ST_AsGeoJSON(c.geom_4326)::jsonb,
               'properties', jsonb_build_object(
                 'cluster_id', c.id,
                 'severity', c.severity
               ) || COALESCE(c.stats, '{}'::jsonb)
             )
           ), '[]'::jsonb)
         ) AS fc
         FROM clusters c
         WHERE c.analysis_id = $1
           AND (
             $2::bool IS FALSE OR
             ST_Intersects(c.geom_4326, ST_MakeEnvelope($3, $4, $5, $6, 4326))
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

export const geodataRepository = createGeodataRepository(defaultPool);
