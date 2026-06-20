import * as fs from 'fs';
import * as path from 'path';
import type { Pool } from 'pg';

export async function applyMigrations(db: Pool, migrationsDir: string): Promise<string[]> {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort((a, b) => a.localeCompare(b));

  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
    await db.query(sql);
  }

  return files;
}
