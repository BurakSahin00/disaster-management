import { upload, tiffFileFilter } from '../../middleware/upload';
import type multer from 'multer';

type FileFilterFn = NonNullable<multer.Options['fileFilter']>;

describe('upload middleware', () => {
  it('is a multer instance with a fields method', () => {
    expect(upload).toBeDefined();
    expect(typeof upload.fields).toBe('function');
  });

  it('rejects non-TIFF files via tiffFileFilter', (done) => {
    const fakeFile = { originalname: 'photo.jpg' } as Express.Multer.File;
    (tiffFileFilter as FileFilterFn)({} as any, fakeFile, (err: Error | null) => {
      expect(err).toBeInstanceOf(Error);
      expect(err!.message).toContain('Invalid file type');
      done();
    });
  });

  it('accepts .tif files via tiffFileFilter', (done) => {
    const fakeFile = { originalname: 'image.tif' } as Express.Multer.File;
    (tiffFileFilter as FileFilterFn)({} as any, fakeFile, (err: Error | null) => {
      expect(err).toBeNull();
      done();
    });
  });

  it('accepts .tiff files via tiffFileFilter', (done) => {
    const fakeFile = { originalname: 'image.tiff' } as Express.Multer.File;
    (tiffFileFilter as FileFilterFn)({} as any, fakeFile, (err: Error | null) => {
      expect(err).toBeNull();
      done();
    });
  });
});
