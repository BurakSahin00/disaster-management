import { Pool } from 'pg';
import { spawnSync } from 'child_process';
import * as path from 'path';
import { applyMigrations } from '../migrations/apply';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL is required for integration tests.');
    process.exitCode = 1;
    return;
  }

  console.log('Connecting to DATABASE_URL...');
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.error('Cannot connect to DATABASE_URL:', (err as Error).message);
    process.exitCode = 1;
    return;
  }
  console.log('DB connection OK.');

  try {
    const migrationsDir = path.resolve(__dirname, '..', 'migrations');
    console.log(`Applying migrations from ${migrationsDir}...`);
    await applyMigrations(pool, migrationsDir);
    console.log('Migrations OK.');
  } catch (err) {
    console.error('Failed applying migrations:', (err as Error).message);
    process.exitCode = 1;
    return;
  } finally {
    await pool.end();
  }

  console.log('Running Jest integration tests...');
  const env = { ...process.env, RUN_INTEGRATION_TESTS: '1' };
  const jestBin = require.resolve('jest/bin/jest');
  const result = spawnSync(
    process.execPath,
    [jestBin, '--runInBand', '--testMatch', '**/*.int.test.ts'],
    { stdio: 'inherit', env },
  );
  if (result.error) {
    console.error('Failed to run Jest:', result.error.message);
  }
  console.log(`Jest exited with code ${result.status ?? 'unknown'}.`);
  process.exitCode = result.status ?? 1;
}

main().catch((err) => {
  console.error('Integration runner crashed:', err);
  process.exitCode = 1;
});
