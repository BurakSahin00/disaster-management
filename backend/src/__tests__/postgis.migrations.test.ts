import { pool } from '../db';
import * as fs from 'fs';
import * as path from 'path';

function hasRealDatabaseUrl(url: unknown): url is string {
  return typeof url === 'string' && url.length > 0 && !url.includes('<') && !url.includes('>');
}

describe('postgis migrations (integration)', () => {
  afterAll(() => pool.end());

  const databaseUrl = process.env.DATABASE_URL;
  const shouldRun =
    hasRealDatabaseUrl(databaseUrl) && process.env.RUN_POSTGIS_MIGRATION_TESTS === '1';

  (shouldRun ? it : it.skip)('applies PostGIS + ERD migrations', async () => {
    // This test is opt-in because it mutates the connected database.
    const migrationsDir = path.resolve(__dirname, '..', 'migrations');
    const files = ['002_enable_postgis.sql', '003_core_erd_schema.sql'];

    for (const f of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
      await pool.query(sql);
    }

    const ext = await pool.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS "exists"`,
    );
    expect(ext.rows[0]?.exists).toBe(true);

    const tables = await pool.query<{ name: string }>(
      `SELECT table_name AS name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_name IN ('users','satellite_images','analyses','buildings','change_maps','building_damages','region_damages','clusters','cluster_regions')`,
    );
    const found = new Set(tables.rows.map((r) => r.name));
    for (const t of [
      'users',
      'satellite_images',
      'analyses',
      'buildings',
      'building_damages',
      'clusters',
    ]) {
      expect(found.has(t)).toBe(true);
    }
  });
});
