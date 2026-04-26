// src/config.ts
import * as dotenv from 'dotenv';
dotenv.config();
import * as path from 'path';

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? '',
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  outputDir: path.resolve(process.env.OUTPUT_DIR ?? 'outputs'),
  segModelPath: process.env.SEG_MODEL_PATH ?? '',
  dmgModelPath: process.env.DMG_MODEL_PATH ?? '',
  pythonBin: process.env.PYTHON_BIN ?? 'python',
};
