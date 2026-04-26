// src/jobs/jobs.repository.ts
import { Pool } from 'pg';
import { pool as defaultPool } from '../db';

export interface Job {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  pre_path: string;
  post_path: string;
  output_dir: string;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: Date;
  completed_at: Date | null;
}

type CreateInput = Pick<Job, 'id' | 'pre_path' | 'post_path' | 'output_dir'>;

interface UpdateExtra {
  result?: Record<string, unknown>;
  error?: string;
  completed_at?: Date;
}

export function createJobsRepository(db: Pool) {
  return {
    async create(input: CreateInput): Promise<Job> {
      const { rows } = await db.query<Job>(
        `INSERT INTO jobs (id, status, pre_path, post_path, output_dir)
         VALUES ($1, 'pending', $2, $3, $4)
         RETURNING *`,
        [input.id, input.pre_path, input.post_path, input.output_dir],
      );
      if (!rows[0]) throw new Error(`INSERT did not return a row for job ${input.id}`);
      return rows[0];
    },

    async findById(id: string): Promise<Job | null> {
      const { rows } = await db.query<Job>(
        'SELECT * FROM jobs WHERE id = $1',
        [id],
      );
      return rows[0] ?? null;
    },

    async updateStatus(
      id: string,
      status: Job['status'],
      extra: UpdateExtra = {},
    ): Promise<void> {
      const sets: string[] = ['status = $2'];
      const values: unknown[] = [id, status];
      let idx = 3;

      if (extra.result !== undefined) {
        sets.push(`result = $${idx++}`);
        values.push(JSON.stringify(extra.result));
      }
      if (extra.error !== undefined) {
        sets.push(`error = $${idx++}`);
        values.push(extra.error);
      }
      if (extra.completed_at !== undefined) {
        sets.push(`completed_at = $${idx++}`);
        values.push(extra.completed_at);
      }

      await db.query(
        `UPDATE jobs SET ${sets.join(', ')} WHERE id = $1`,
        values,
      );
    },
  };
}

export const jobsRepository = createJobsRepository(defaultPool);
