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

describe('integration: geodata + regions/clusters + OGC items', () => {
  const shouldRunRequested = process.env.RUN_INTEGRATION_TESTS === '1';
  let canRun = false;

  beforeAll(async () => {
    if (!shouldRunRequested) return;
    if (!process.env.DATABASE_URL) return;
    canRun = await canConnect();
    if (!canRun) return;
    await applyMigrations();
  });

  beforeEach(async () => {
    if (!shouldRunRequested) return;
    if (!process.env.DATABASE_URL) return;
    if (!canRun) return;
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  it('recomputes regions/clusters and serves GeoJSON', async () => {
    if (!shouldRunRequested || !process.env.DATABASE_URL || !canRun) return;
    // Minimal seed data
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

    // Two close-by damaged buildings (roughly İzmir area)
    await pool.query(
      `INSERT INTO buildings (id, geom_4326)
       VALUES
        ('b1', ST_Multi(ST_SetSRID(ST_GeomFromText('POLYGON((27.10 38.40, 27.101 38.40, 27.101 38.401, 27.10 38.401, 27.10 38.40))'), 4326))),
        ('b2', ST_Multi(ST_SetSRID(ST_GeomFromText('POLYGON((27.102 38.400, 27.103 38.400, 27.103 38.401, 27.102 38.401, 27.102 38.400))'), 4326)))`,
    );
    await pool.query(
      `INSERT INTO building_damages (id, analysis_id, building_id, damage_class, geom_4326)
       VALUES
        ('bd1','a1','b1',2,(SELECT geom_4326 FROM buildings WHERE id='b1')),
        ('bd2','a1','b2',3,(SELECT geom_4326 FROM buildings WHERE id='b2'))`,
    );

    // Recompute derived layers
    await request(app)
      .post('/analyses/a1/recompute')
      .send({
        gridType: 'square',
        gridSizeMeters: 250,
        epsMeters: 400,
        minPoints: 1,
        clusterMinCellCount: 1,
      })
      .expect(200);

    const regions = await request(app).get('/analyses/a1/regions.geojson').expect(200);
    expect(regions.body.type).toBe('FeatureCollection');

    const clusters = await request(app).get('/analyses/a1/clusters.geojson').expect(200);
    expect(clusters.body.type).toBe('FeatureCollection');

    const ogc = await request(app).get('/ogc/collections/regions/items?analysisId=a1').expect(200);
    expect(ogc.body.type).toBe('FeatureCollection');
  });
});
