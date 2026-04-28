// src/config.ts
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config();

// Varsayılan olarak projenin kökune gore app/main.py'yi isaret eder.
// PYTHON_MAIN_PY ortam degiskeniyle override edilebilir.
const projectRoot = path.resolve(__dirname, '..', '..', '..');

export const config = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? '',
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? 'uploads'),
  outputDir: path.resolve(process.env.OUTPUT_DIR ?? 'outputs'),
  segModelPath: process.env.SEG_MODEL_PATH ?? '',
  dmgModelPath: process.env.DMG_MODEL_PATH ?? '',
  pythonBin: process.env.PYTHON_BIN ?? 'python',
  pythonMainPy: process.env.PYTHON_MAIN_PY
    ?? path.join(projectRoot, 'app', 'main.py'),
};
