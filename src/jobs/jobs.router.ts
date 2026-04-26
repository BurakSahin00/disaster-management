// src/jobs/jobs.router.ts
import { Router, Request, Response, NextFunction } from 'express';
import * as path from 'path';
import { upload } from '../middleware/upload';
import { createJob, getJob } from './jobs.service';

export const jobsRouter = Router();

const ALLOWED_FILES = new Set(['damage_overlay.png', 'building_mask.png']);

jobsRouter.post(
  '/',
  upload.fields([{ name: 'pre', maxCount: 1 }, { name: 'post', maxCount: 1 }]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const preFile = files?.pre?.[0];
      const postFile = files?.post?.[0];

      if (!preFile || !postFile) {
        res.status(400).json({ error: 'Both "pre" and "post" TIFF files are required.' });
        return;
      }

      const job = await createJob(preFile, postFile);
      res.status(202).json(job);
    } catch (err) {
      next(err);
    }
  },
);

jobsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await getJob(req.params['id'] as string);
    if (!job) {
      res.status(404).json({ error: 'Job not found.' });
      return;
    }
    res.json(job);
  } catch (err) {
    next(err);
  }
});

jobsRouter.get(
  '/:id/files/:file',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const file = req.params['file'] as string;

      if (!ALLOWED_FILES.has(file)) {
        res.status(400).json({
          error: `File not allowed. Valid options: ${[...ALLOWED_FILES].join(', ')}`,
        });
        return;
      }

      const job = await getJob(req.params['id'] as string);
      if (!job) {
        res.status(404).json({ error: 'Job not found.' });
        return;
      }

      res.sendFile(path.join(job.output_dir, file));
    } catch (err) {
      next(err);
    }
  },
);
