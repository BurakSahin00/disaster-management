jest.mock('../../jobs/jobs.repository', () => ({
  jobsRepository: { create: jest.fn(), findById: jest.fn() },
}));
jest.mock('../../jobs/pipeline.runner', () => ({
  runPipeline: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('fs', () => ({
  promises: {
    rename: jest.fn().mockResolvedValue(undefined),
    mkdir: jest.fn().mockResolvedValue(undefined),
    unlink: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../config', () => ({
  config: {
    uploadDir: '/uploads',
    outputDir: '/outputs',
  },
}));

import { jobsRepository } from '../../jobs/jobs.repository';
import { runPipeline } from '../../jobs/pipeline.runner';
import { createJob, getJob } from '../../jobs/jobs.service';

const mockCreate = jobsRepository.create as jest.Mock;
const mockFindById = jobsRepository.findById as jest.Mock;

const fakePreFile = { path: '/uploads/tmp_pre.tif' } as Express.Multer.File;
const fakePostFile = { path: '/uploads/tmp_post.tif' } as Express.Multer.File;

describe('createJob', () => {
  it('creates a db record, fires pipeline, and returns id+status', async () => {
    mockCreate.mockResolvedValue({ id: 'abc', status: 'pending' });

    const result = await createJob(fakePreFile, fakePostFile);

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('abc');
    expect(result.status).toBe('pending');
    expect(runPipeline).toHaveBeenCalledTimes(1);
  });
});

describe('getJob', () => {
  it('delegates to repository.findById', async () => {
    mockFindById.mockResolvedValue({ id: 'abc', status: 'running' });
    const job = await getJob('abc');
    expect(job!.id).toBe('abc');
  });

  it('returns null when job does not exist', async () => {
    mockFindById.mockResolvedValue(null);
    expect(await getJob('missing')).toBeNull();
  });
});
