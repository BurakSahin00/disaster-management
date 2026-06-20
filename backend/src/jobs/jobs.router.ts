// src/jobs/jobs.router.ts
import { Router, Request, Response, NextFunction } from 'express';
import { upload } from '../middleware/upload';
import { createJob, getJob } from './jobs.service';
import { requireApiKey } from '../middleware/apiKey';
import { createAnalysis } from '../analyses/analyses.service';
import { getProjectById, upsertProject } from '../projects/projects.service';

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
        res.status(400).json({ error: '"pre" ve "post" TIFF dosyalarının ikisi de zorunludur.' });
        return;
      }

      const analysisIdRaw = (req.body?.analysisId ?? req.body?.analysis_id) as unknown;
      let analysisId =
        typeof analysisIdRaw === 'string' && analysisIdRaw.length > 0 ? analysisIdRaw : undefined;

      // Auto-create an analysis linked to seed defaults when none is provided.
      if (!analysisId) {
        const userIdRaw = (req.body?.userId ?? req.body?.user_id) as unknown;
        const userId =
          typeof userIdRaw === 'string' && userIdRaw.trim().length > 0 ? userIdRaw.trim() : 'system';

        const projectNameRaw = (req.body?.projectName ?? req.body?.project_name) as unknown;
        const projectName =
          typeof projectNameRaw === 'string' && projectNameRaw.trim().length > 0
            ? projectNameRaw.trim()
            : '';

        const projectIdRaw = (req.body?.projectId ?? req.body?.project_id) as unknown;
        const projectIdStr =
          typeof projectIdRaw === 'string' && projectIdRaw.trim().length > 0
            ? projectIdRaw.trim()
            : '';

        let projectId: string | undefined;
        if (projectIdStr) {
          const existing = await getProjectById(projectIdStr);
          if (!existing) {
            throw new Error('Validation error: Belirtilen proje bulunamadı.');
          }
          projectId = existing.id;
        } else if (projectName) {
          const p = await upsertProject({ userId, name: projectName });
          projectId = p.id;
        }

        const analysis = await createAnalysis({
          userId,
          preImageId: 'image-pre',
          postImageId: 'image-post',
          projectId,
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
      res.status(404).json({ error: 'İş bulunamadı.' });
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
        error: `Geçersiz dosya adı. İzin verilen dosyalar: ${[...ALLOWED_FILES].join(', ')}`,
      });
      return;
    }

    const job = await getJob(req.params['id'] as string);
    if (!job) {
      res.status(404).json({ error: 'İş bulunamadı.' });
      return;
    }

    const ct = OUTPUT_CONTENT_TYPE[file];
    if (ct) res.type(ct);

    res.sendFile(file, { root: job.output_dir }, (err) => {
      if (err) res.status(404).json({ error: 'Çıktı dosyası henüz oluşturulmamış veya bulunamadı.' });
    });
  } catch (err) {
    next(err);
  }
});
