import * as crypto from 'crypto';
import { Pool } from 'pg';
import { pool as defaultPool } from '../db';

export interface Project {
  id: string;
  user_id: string;
  name: string;
  created_at: Date;
}

export interface ProjectAnalysisJobRow {
  analysis_id: string;
  analysis_status: string;
  analysis_created_at: Date;
  analysis_completed_at: Date | null;
  pre_image_id: string;
  post_image_id: string;
  job_id: string | null;
  job_status: string | null;
  job_pre_path: string | null;
  job_post_path: string | null;
  job_created_at: Date | null;
  job_completed_at: Date | null;
}

export function createProjectsRepository(db: Pool) {
  return {
    async upsertByUserAndName(input: { userId: string; name: string }): Promise<Project> {
      const id = crypto.randomUUID();
      const { rows } = await db.query<Project>(
        `INSERT INTO projects (id, user_id, name)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
         RETURNING *`,
        [id, input.userId, input.name],
      );
      if (!rows[0]) throw new Error('INSERT projects did not return a row');
      return rows[0];
    },

    async findById(id: string): Promise<Project | null> {
      const { rows } = await db.query<Project>('SELECT * FROM projects WHERE id = $1', [id]);
      return rows[0] ?? null;
    },

    async findByIdAndUser(id: string, userId: string): Promise<Project | null> {
      const { rows } = await db.query<Project>(
        'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
        [id, userId],
      );
      return rows[0] ?? null;
    },

    async listByUserId(userId: string): Promise<(Project & { analysis_count: number })[]> {
      const { rows } = await db.query<Project & { analysis_count: string }>(
        `SELECT p.*,
                COALESCE(
                  (SELECT COUNT(*)::text FROM analyses a WHERE a.project_id = p.id),
                  '0'
                ) AS analysis_count
         FROM projects p
         WHERE p.user_id = $1
         ORDER BY p.created_at DESC`,
        [userId],
      );
      return rows.map((r) => ({
        ...r,
        analysis_count: Number(r.analysis_count),
      }));
    },

    async listAnalysesWithLatestJob(projectId: string): Promise<ProjectAnalysisJobRow[]> {
      const { rows } = await db.query<ProjectAnalysisJobRow>(
        `SELECT
           a.id AS analysis_id,
           a.status AS analysis_status,
           a.created_at AS analysis_created_at,
           a.completed_at AS analysis_completed_at,
           a.pre_image_id,
           a.post_image_id,
           j.id AS job_id,
           j.status AS job_status,
           j.pre_path AS job_pre_path,
           j.post_path AS job_post_path,
           j.created_at AS job_created_at,
           j.completed_at AS job_completed_at
         FROM analyses a
         LEFT JOIN LATERAL (
           SELECT *
           FROM jobs
           WHERE jobs.analysis_id = a.id
           ORDER BY created_at DESC
           LIMIT 1
         ) j ON true
         WHERE a.project_id = $1
         ORDER BY COALESCE(j.created_at, a.created_at) DESC`,
        [projectId],
      );
      return rows;
    },
  };
}

export const projectsRepository = createProjectsRepository(defaultPool);
