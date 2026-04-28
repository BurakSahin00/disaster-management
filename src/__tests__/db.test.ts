// src/__tests__/db.test.ts
import { pool } from '../db';

describe('db', () => {
  afterAll(() => pool.end());

  const databaseUrl = process.env.DATABASE_URL;
  const shouldRun =
    typeof databaseUrl === 'string' &&
    databaseUrl.length > 0 &&
    !databaseUrl.includes('<') &&
    !databaseUrl.includes('>');

  (shouldRun ? it : it.skip)('connects to postgres and returns 1', async () => {
    const res = await pool.query<{ value: number }>('SELECT 1 AS value');
    expect(res.rows[0].value).toBe(1);
  });
});
