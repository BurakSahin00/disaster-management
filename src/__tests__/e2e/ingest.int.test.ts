import request from 'supertest';
import { pool } from '../../db';
import { app } from '../../app';
import * as path from 'path';
import { applyMigrations } from '../../migrations/apply';

async function canConnect(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
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

describe('integration: ingest buildings GeoJSON', () => {
  const shouldRun = process.env.RUN_INTEGRATION_TESTS === '1' && Boolean(process.env.DATABASE_URL);
  let canRun = false;

  beforeAll(async () => {
    if (!shouldRun) return;
    canRun = await canConnect();
    if (!canRun) return;
    await applyMigrations(pool, path.resolve(__dirname, '..', '..', 'migrations'));
  });

  beforeEach(async () => {
    if (!shouldRun || !canRun) return;
    await resetDb();
  });

  afterAll(async () => {
    await pool.end();
  });

  (shouldRun ? it : it.skip)('persists GeoJSON and serves OGC items', async () => {
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

    const geojson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [27.1, 38.4],
                [27.101, 38.4],
                [27.101, 38.401],
                [27.1, 38.401],
                [27.1, 38.4],
              ],
            ],
          },
          properties: { id: 1, damage_class: 2 },
        },
      ],
    };

    await request(app).post('/analyses/a1/ingest/buildings').send(geojson).expect(202);

    const buildings = await request(app)
      .get('/ogc/collections/buildings/items?analysisId=a1')
      .expect(200);
    expect(buildings.body.type).toBe('FeatureCollection');
    expect(buildings.body.features.length).toBe(1);

    const regions = await request(app)
      .get('/ogc/collections/regions/items?analysisId=a1')
      .expect(200);
    expect(regions.body.type).toBe('FeatureCollection');
  });
});
