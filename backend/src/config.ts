// src/config.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

/** CORS `origin`: `true` = yansıt (dev); tek URL string; veya virgülle ayrılmış izin listesi. `*` veya boş = `true`. */
function parseCorsOrigin(): boolean | string | string[] {
  const raw = process.env.CORS_ORIGIN?.trim();
  if (!raw || raw === '*') return true;
  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) return true;
  if (parts.length === 1) return parts[0] as string;
  return parts;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? '',
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  outputDir: path.resolve(process.env.OUTPUT_DIR ?? 'outputs'),
  segModelPath: process.env.SEG_MODEL_PATH ?? '',
  dmgModelPath: process.env.DMG_MODEL_PATH ?? '',
  pythonBin: process.env.PYTHON_BIN ?? 'python',
  pipelineEntrypoint: process.env.PIPELINE_ENTRYPOINT,
  apiKey: process.env.API_KEY,
  // Compiled to dist/config.js — one level up is backend/, scripts/ lives there
  geotiffValidatorPath:
    process.env.GEOTIFF_VALIDATOR_PATH ??
    path.resolve(__dirname, '..', 'scripts', 'validate_geotiff.py'),
  corsOrigin: parseCorsOrigin(),
  jwtSecret: process.env.JWT_SECRET ?? 'disastersense-dev-secret-change-in-production',
};
