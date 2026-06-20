import { pool } from './db';
import * as path from 'path';
import { applyMigrations } from './migrations/apply';

async function main() {
  const migrationsDir = path.resolve(__dirname, 'migrations');
  const files = await applyMigrations(pool, migrationsDir);
  for (const f of files) console.log(`Applied ${f}`);

  console.log('Migrations applied.');
}

main()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error('Migration failed:', err);
    try {
      await pool.end();
    } catch {
      /* ignore */
    }
    process.exitCode = 1;
  });
