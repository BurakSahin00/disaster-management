// src/app.ts
import express, { Request, Response, NextFunction } from 'express';
import { jobsRouter } from './jobs/jobs.router';

export const app = express();

app.use(express.json());
app.use('/jobs', jobsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err.message?.startsWith('Invalid file type')) {
    res.status(400).json({ error: err.message });
    return;
  }
  if ((err as any).code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large. Maximum allowed size is 2 GB.' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});
