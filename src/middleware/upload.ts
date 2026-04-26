import multer from 'multer';
import * as path from 'path';
import { config } from '../config';

const storage = multer.diskStorage({
  destination: config.uploadDir,
  filename: (_req, file, cb) => {
    cb(null, `${Date.now()}_${file.originalname}`);
  },
});

const fileFilter: multer.Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ext === '.tif' || ext === '.tiff') {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${ext}. Only .tif and .tiff are allowed.`));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB
});
