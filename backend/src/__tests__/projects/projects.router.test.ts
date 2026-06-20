import request from 'supertest';
import express from 'express';
import { ZodError } from 'zod';

jest.mock('../../../src/middleware/apiKey', () => ({
  requireApiKey: (_req: express.Request, _res: express.Response, next: express.NextFunction) =>
    next(),
}));

jest.mock('../../../src/projects/projects.service', () => ({
  upsertProject: jest.fn(),
  listProjectsForUser: jest.fn(),
  getProjectAnalysesForUser: jest.fn(),
}));

import {
  upsertProject,
  listProjectsForUser,
  getProjectAnalysesForUser,
} from '../../../src/projects/projects.service';
import { projectsRouter } from '../../../src/projects/projects.router';

const mockUpsert = upsertProject as jest.Mock;
const mockList = listProjectsForUser as jest.Mock;
const mockAnalyses = getProjectAnalysesForUser as jest.Mock;

const app = express();
app.use(express.json());
app.use('/projects', projectsRouter);
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

describe('POST /projects', () => {
  it('returns 400 when name missing', async () => {
    const res = await request(app).post('/projects').send({ userId: 'u1' });
    expect(res.status).toBe(400);
  });

  it('returns 201 with project', async () => {
    mockUpsert.mockResolvedValue({
      id: 'p1',
      user_id: 'u1',
      name: 'Demo',
      created_at: new Date(),
    });
    const res = await request(app).post('/projects').send({ userId: 'u1', name: 'Demo' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('p1');
    expect(res.body.name).toBe('Demo');
  });
});

describe('GET /projects', () => {
  it('returns 400 without userId', async () => {
    const res = await request(app).get('/projects');
    expect(res.status).toBe(400);
  });

  it('returns 200 with list', async () => {
    mockList.mockResolvedValue([
      { id: 'p1', user_id: 'u1', name: 'A', created_at: new Date(), analysis_count: 2 },
    ]);
    const res = await request(app).get('/projects?userId=u1');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].analysis_count).toBe(2);
  });
});

describe('GET /projects/:projectId/analyses', () => {
  it('returns 404 when project missing', async () => {
    mockAnalyses.mockResolvedValue(null);
    const res = await request(app).get('/projects/p1/analyses?userId=u1');
    expect(res.status).toBe(404);
  });

  it('returns 200 with payload', async () => {
    mockAnalyses.mockResolvedValue({
      project: { id: 'p1', user_id: 'u1', name: 'A', created_at: new Date() },
      items: [],
    });
    const res = await request(app).get('/projects/p1/analyses?userId=u1');
    expect(res.status).toBe(200);
    expect(res.body.project.id).toBe('p1');
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
