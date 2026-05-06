import request from 'supertest';
import express from 'express';
import { ZodError } from 'zod';

jest.mock('../../../src/analyses/analyses.service', () => ({
  createAnalysis: jest.fn(),
  getAnalysis: jest.fn(),
}));

import { createAnalysis, getAnalysis } from '../../../src/analyses/analyses.service';
import { analysesRouter } from '../../../src/analyses/analyses.router';

const mockCreate = createAnalysis as jest.Mock;
const mockGet = getAnalysis as jest.Mock;

const app = express();
app.use(express.json());
app.use('/analyses', analysesRouter);
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation error' });
    return;
  }
  if (err.message?.startsWith('Validation error:')) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: 'Internal server error.' });
});

describe('POST /analyses', () => {
  it('returns 400 when required fields missing', async () => {
    const res = await request(app).post('/analyses').send({ userId: 'u1' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with id+status on success', async () => {
    mockCreate.mockResolvedValue({ id: 'a1', status: 'pending' });
    const res = await request(app)
      .post('/analyses')
      .send({ userId: 'u1', preImageId: 'img-pre', postImageId: 'img-post' });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 'a1', status: 'pending' });
  });
});

describe('GET /analyses/:id', () => {
  it('returns 404 when not found', async () => {
    mockGet.mockResolvedValue(null);
    const res = await request(app).get('/analyses/missing');
    expect(res.status).toBe(404);
  });

  it('returns 200 with analysis when found', async () => {
    mockGet.mockResolvedValue({
      id: 'a1',
      user_id: 'u1',
      pre_image_id: 'img-pre',
      post_image_id: 'img-post',
      status: 'running',
      created_at: new Date(),
      completed_at: null,
    });
    const res = await request(app).get('/analyses/a1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('a1');
    expect(res.body.status).toBe('running');
  });
});
