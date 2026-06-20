// src/jobs/jobs.router.ts
import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/upload';
import { createJob, getJob } from './jobs.service';
import { requireApiKey } from '../middleware/apiKey';
import { createAnalysis } from '../analyses/analyses.service';

export const jobsRouter = Router();

const ALLOWED_FILES = new Set([
  'damage_overlay.png',
  'building_mask.png',
  'damage_map.tif',
  'report.json',
  'buildings.geojson',
  'change_map_meta.json',
]);

const OUTPUT_CONTENT_TYPE: Record<string, string> = {
  'damage_overlay.png': 'image/png',
  'building_mask.png': 'image/png',
  'damage_map.tif': 'image/tiff',
  'report.json': 'application/json',
  'buildings.geojson': 'application/geo+json',
  'change_map_meta.json': 'application/json',
};

jobsRouter.post(
  '/',
  requireApiKey,
  upload.fields([
    { name: 'pre', maxCount: 1 },
    { name: 'post', maxCount: 1 },
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const preFile = files?.pre?.[0];
      const postFile = files?.post?.[0];

      if (!preFile || !postFile) {
        res.status(400).json({ error: 'Both "pre" and "post" TIFF files are required.' });
        return;
      }

      const analysisIdRaw = (req.body?.analysisId ?? req.body?.analysis_id) as unknown;
      let analysisId =
        typeof analysisIdRaw === 'string' && analysisIdRaw.length > 0 ? analysisIdRaw : undefined;

      // Auto-create an analysis linked to seed defaults when none is provided.
      if (!analysisId) {
        const analysis = await createAnalysis({
          userId: 'system',
          preImageId: 'image-pre',
          postImageId: 'image-post',
        });
        analysisId = analysis.id;
      }

      const job = await createJob(preFile, postFile, analysisId);
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

jobsRouter.get('/:id/files/:file', async (req: Request, res: Response, next: NextFunction) => {
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

    const ct = OUTPUT_CONTENT_TYPE[file];
    if (ct) res.type(ct);

    res.sendFile(file, { root: job.output_dir }, (err) => {
      if (err) res.status(404).json({ error: 'Output file not found.' });
    });
  } catch (err) {
    next(err);
  }
});
