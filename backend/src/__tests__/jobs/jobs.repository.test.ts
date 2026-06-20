// src/__tests__/jobs/jobs.repository.test.ts
import { Pool, QueryResult } from 'pg';

jest.mock('../../db', () => ({ pool: { query: jest.fn() } }));

import { pool } from '../../db';
import { createJobsRepository, Job } from '../../jobs/jobs.repository';

const mockQuery = pool.query as jest.Mock;
const repo = createJobsRepository(pool as unknown as Pool);

const baseJob: Job = {
  id: 'test-id',
  status: 'pending',
  analysis_id: null,
  pre_path: '/uploads/test-id_pre.tif',
  post_path: '/uploads/test-id_post.tif',
  output_dir: '/outputs/test-id',
  result: null,
  error: null,
  created_at: new Date('2026-01-01T00:00:00Z'),
  completed_at: null,
};

describe('jobsRepository.create', () => {
  it('inserts a job and returns it', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [baseJob] } as QueryResult);

    const job = await repo.create({
      id: 'test-id',
      pre_path: '/uploads/test-id_pre.tif',
      post_path: '/uploads/test-id_post.tif',
      output_dir: '/outputs/test-id',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(job.id).toBe('test-id');
    expect(job.status).toBe('pending');
  });
});

describe('jobsRepository.findById', () => {
  it('returns a job when found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [baseJob] } as QueryResult);
    const job = await repo.findById('test-id');
    expect(job).not.toBeNull();
    expect(job!.id).toBe('test-id');
  });

  it('returns null when not found', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as unknown as QueryResult);
    const job = await repo.findById('missing');
    expect(job).toBeNull();
  });
});

describe('jobsRepository.updateStatus', () => {
  it('calls UPDATE with status and id', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as unknown as QueryResult);
    await repo.updateStatus('test-id', 'running');
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('UPDATE jobs');
  });

  it('includes result and completed_at when status is completed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] } as unknown as QueryResult);
    await repo.updateStatus('test-id', 'completed', {
      result: { total_buildings: 5 },
      completed_at: new Date(),
    });
    const sql: string = mockQuery.mock.calls[0][0];
    expect(sql).toContain('result');
    expect(sql).toContain('completed_at');
  });
});
