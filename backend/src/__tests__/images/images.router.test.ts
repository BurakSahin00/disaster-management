import request from 'supertest';
import express from 'express';
import { ZodError } from 'zod';

jest.mock('../../../src/images/images.repository', () => ({
  imagesRepository: { create: jest.fn(), findById: jest.fn() },
}));

import { imagesRepository } from '../../../src/images/images.repository';
import { imagesRouter } from '../../../src/images/images.router';

const mockCreate = imagesRepository.create as jest.Mock;
const mockFindById = imagesRepository.findById as jest.Mock;

const app = express();
app.use(express.json());
app.use('/images', imagesRouter);
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

describe('POST /images', () => {
  it('returns 400 when uri missing', async () => {
    const res = await request(app).post('/images').send({});
    expect(res.status).toBe(400);
  });

  it('returns 201 with id on success', async () => {
    mockCreate.mockResolvedValue({ id: 'img1' });
    const res = await request(app).post('/images').send({ uri: 'file:///uploads/pre.tif' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('img1');
  });
});

describe('GET /images/:id', () => {
  it('returns 404 when not found', async () => {
    mockFindById.mockResolvedValue(null);
    const res = await request(app).get('/images/missing');
    expect(res.status).toBe(404);
  });

  it('returns 200 with image row when found', async () => {
    mockFindById.mockResolvedValue({ id: 'img1', uri: 'file:///uploads/pre.tif' });
    const res = await request(app).get('/images/img1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('img1');
  });
});
