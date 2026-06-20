import { Pool } from 'pg';
import { pool as defaultPool } from '../db';

export type AnalysisStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Analysis {
  id: string;
  user_id: string;
  pre_image_id: string;
  post_image_id: string;
  project_id: string | null;
  status: AnalysisStatus;
  created_at: Date;
  completed_at: Date | null;
}

type CreateInput = Pick<Analysis, 'id' | 'user_id' | 'pre_image_id' | 'post_image_id'> & {
  status?: AnalysisStatus;
  project_id?: string | null;
};

export function createAnalysesRepository(db: Pool) {
  return {
    async create(input: CreateInput): Promise<Analysis> {
      const { rows } = await db.query<Analysis>(
        `INSERT INTO analyses (id, user_id, pre_image_id, post_image_id, project_id, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.id,
          input.user_id,
          input.pre_image_id,
          input.post_image_id,
          input.project_id ?? null,
          input.status ?? 'pending',
        ],
      );
      if (!rows[0]) throw new Error(`INSERT did not return a row for analysis ${input.id}`);
      return rows[0];
    },

    async findById(id: string): Promise<Analysis | null> {
      const { rows } = await db.query<Analysis>('SELECT * FROM analyses WHERE id = $1', [id]);
      return rows[0] ?? null;
    },

    async updateStatus(id: string, status: AnalysisStatus, completedAt?: Date): Promise<void> {
      await db.query(
        `UPDATE analyses
         SET status = $2,
             completed_at = COALESCE($3, completed_at)
         WHERE id = $1`,
        [id, status, completedAt ?? null],
      );
    },
  };
}

export const analysesRepository = createAnalysesRepository(defaultPool);
