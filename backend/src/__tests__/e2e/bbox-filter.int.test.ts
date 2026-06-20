import request from 'supertest';
import { pool } from '../../db';
import { app } from '../../app';
import * as path from 'path';
import { applyMigrations as applyAllMigrations } from '../../migrations/apply';

async function canConnect(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

async function applyMigrations() {
  const migrationsDir = path.resolve(__dirname, '..', '..', 'migrations');
  await applyAllMigrations(pool, migrationsDir);
}

async function resetDb() {
  await pool.query(
    `TRUNCATE TABLE
      cluster_regions,
      clusters,
      region_damages,
      building_damages,
      change_maps,
      buildings,
      analyses,
      satellite_images,
      users,
      jobs
     RESTART IDENTITY CASCADE`,
  );
}

function featureCount(fc: any): number {
  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return 0;
  return fc.features.length;
}

describe('integration: bbox filtering', () => {
  const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1' && Boolean(process.env.DATABASE_URL);
  let canRun = false;

  beforeAll(async () => {
    if (!shouldRun) return;
    canRun = await canConnect();
    if (!canRun) return;
    await applyMigrations();
  });

  beforeEach(async () => {
    if (!shouldRun || !canRun) return;
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  (shouldRun ? it : it.skip)(
    'filters buildings via bbox on /analyses and /ogc endpoints',
    async () => {
      if (!canRun) return;

      await pool.query(
        `INSERT INTO users (id, email, password_hash, role) VALUES ('u1','u1@example.com','x','admin')`,
      );
      await pool.query(
        `INSERT INTO satellite_images (id, uri) VALUES ('img-pre','file:///pre.tif'), ('img-post','file:///post.tif')`,
      );
      await pool.query(
        `INSERT INTO analyses (id, user_id, pre_image_id, post_image_id, status)
       VALUES ('a1','u1','img-pre','img-post','completed')`,
      );

      // One building near İzmir (27E, 38N) and one far away (Istanbul-ish 29E, 41N)
      await pool.query(
        `INSERT INTO buildings (id, geom_4326)
       VALUES
        ('b1', ST_Multi(ST_SetSRID(ST_GeomFromText('POLYGON((27.10 38.40, 27.101 38.40, 27.101 38.401, 27.10 38.401, 27.10 38.40))'), 4326))),
        ('b2', ST_Multi(ST_SetSRID(ST_GeomFromText('POLYGON((29.00 41.00, 29.001 41.00, 29.001 41.001, 29.00 41.001, 29.00 41.00))'), 4326)))`,
      );
      await pool.query(
        `INSERT INTO building_damages (id, analysis_id, building_id, damage_class, geom_4326)
       VALUES
        ('bd1','a1','b1',2,(SELECT geom_4326 FROM buildings WHERE id='b1')),
        ('bd2','a1','b2',3,(SELECT geom_4326 FROM buildings WHERE id='b2'))`,
      );

      // bbox around İzmir only
      const bboxIzmir = '27.0,38.3,27.2,38.5';

      const buildings = await request(app)
        .get(`/analyses/a1/buildings.geojson?bbox=${bboxIzmir}`)
        .expect(200);
      expect(featureCount(buildings.body)).toBe(1);

      const ogcBuildings = await request(app)
        .get(`/ogc/collections/buildings/items?analysisId=a1&bbox=${bboxIzmir}`)
        .expect(200);
      expect(featureCount(ogcBuildings.body)).toBe(1);
    },
  );
});
