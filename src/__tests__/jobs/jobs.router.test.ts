// src/__tests__/jobs/jobs.router.test.ts
import request from 'supertest';
import express from 'express';

jest.mock('../../jobs/jobs.service');
jest.mock('../../middleware/upload', () => ({
  upload: {
    fields: () => (req: any, _res: any, next: any) => {
      req.files = {
        pre: [{ path: '/uploads/tmp_pre.tif' }],
        post: [{ path: '/uploads/tmp_post.tif' }],
      };
      next();
    },
  },
}));

import { createJob, getJob } from '../../jobs/jobs.service';
import { jobsRouter } from '../../jobs/jobs.router';

const mockCreateJob = createJob as jest.Mock;
const mockGetJob = getJob as jest.Mock;

const app = express();
app.use(express.json());
app.use('/jobs', jobsRouter);

describe('POST /jobs', () => {
  it('returns 202 with id and pending status', async () => {
    mockCreateJob.mockResolvedValue({ id: 'abc123', status: 'pending' });
    const res = await request(app).post('/jobs');
    expect(res.status).toBe(202);
    expect(res.body).toEqual({ id: 'abc123', status: 'pending' });
  });
});

describe('GET /jobs/:id', () => {
  it('returns 200 with job when found', async () => {
    mockGetJob.mockResolvedValue({
      id: 'abc123',
      status: 'completed',
      created_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      result: { total_buildings: 5, summary: {} },
    });
    const res = await request(app).get('/jobs/abc123');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.result).toBeDefined();
  });

  it('returns 404 when job not found', async () => {
    mockGetJob.mockResolvedValue(null);
    const res = await request(app).get('/jobs/missing');
    expect(res.status).toBe(404);
    expect(res.body.error).toBeDefined();
  });
});

describe('GET /jobs/:id/files/:file', () => {
  it('returns 400 for disallowed file names', async () => {
    mockGetJob.mockResolvedValue({ id: 'abc123', output_dir: '/outputs/abc123' });
    const res = await request(app).get('/jobs/abc123/files/report.json');
    expect(res.status).toBe(400);
  });

  it('returns 404 when job not found', async () => {
    mockGetJob.mockResolvedValue(null);
    const res = await request(app).get('/jobs/missing/files/damage_overlay.png');
    expect(res.status).toBe(404);
  });
});
