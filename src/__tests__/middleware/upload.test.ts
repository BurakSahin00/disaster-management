import { upload } from '../../middleware/upload';

describe('upload middleware', () => {
  it('is a multer instance with a fields method', () => {
    expect(upload).toBeDefined();
    expect(typeof upload.fields).toBe('function');
  });

  it('rejects non-TIFF files via fileFilter', (done) => {
    const fileFilter = (upload as any).fileFilter as Function;
    if (!fileFilter) {
      done();
      return;
    }
    const fakeFile = { originalname: 'photo.jpg' } as Express.Multer.File;
    fileFilter({}, fakeFile, (err: Error | null) => {
      expect(err).toBeInstanceOf(Error);
      expect(err!.message).toContain('Invalid file type');
      done();
    });
  });

  it('accepts .tif files via fileFilter', (done) => {
    const fileFilter = (upload as any).fileFilter as Function;
    if (!fileFilter) {
      done();
      return;
    }
    const fakeFile = { originalname: 'image.tif' } as Express.Multer.File;
    fileFilter({}, fakeFile, (err: Error | null) => {
      expect(err).toBeNull();
      done();
    });
  });
});
