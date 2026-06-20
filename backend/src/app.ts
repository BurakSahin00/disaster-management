// src/app.ts
import cors from 'cors';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import swaggerUi from 'swagger-ui-express';
import { ZodError } from 'zod';
import { config } from './config';
import { jobsRouter } from './jobs/jobs.router';
import { analysesRouter } from './analyses/analyses.router';
import { imagesRouter } from './images/images.router';
import { geodataRouter } from './geodata/geodata.router';
import { ogcRouter } from './ogc/ogc.router';
import { projectsRouter } from './projects/projects.router';
import { authRouter } from './auth/auth.router';
import { openapiSpec } from './openapi';

export const app = express();

app.use(
  cors({
    origin: config.corsOrigin,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
  }),
);
app.use(express.json());
app.get('/openapi.json', (_req, res) => res.json(openapiSpec));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapiSpec));
app.use('/auth', authRouter);
app.use('/jobs', jobsRouter);
app.use('/analyses', analysesRouter);
app.use('/images', imagesRouter);
app.use('/projects', projectsRouter);
app.use('/', geodataRouter);
app.use('/ogc', ogcRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation error',
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }
  if (
    err.message?.startsWith('Validation error:') ||
    err.message?.startsWith('Invalid GeoTIFFs:')
  ) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err.message?.startsWith('Invalid file type')) {
    res.status(400).json({ error: err.message });
    return;
  }
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: 'File too large. Maximum allowed size is 2 GB.' });
    return;
  }
  // body-parser JSON syntax (e.g. unescaped Windows backslashes in strings)
  if (
    typeof err === 'object' &&
    err !== null &&
    'type' in err &&
    (err as { type: unknown }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      error:
        'Invalid JSON in request body. In JSON strings, backslashes must be escaped (use \\\\ before each \\) or use forward slashes in file URIs, e.g. file:///D:/path/to/file.tif.',
    });
    return;
  }
  // PostgreSQL foreign key violation (e.g. jobs.analysis_id → analyses.id)
  if (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === '23503'
  ) {
    const detail = 'detail' in err ? String((err as { detail?: unknown }).detail ?? '') : '';
    res.status(400).json({
      error: 'Belirtilen kayıt bulunamadı (yabancı anahtar ihlali).',
      ...(detail ? { detail } : {}),
    });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Sunucu hatası oluştu. Lütfen tekrar deneyin.' });
});
