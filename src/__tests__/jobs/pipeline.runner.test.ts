// src/__tests__/jobs/pipeline.runner.test.ts
import { EventEmitter } from 'events';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    ...jest.requireActual('fs').promises,
    readFile: jest.fn().mockResolvedValue('{"total_buildings": 3}'),
  },
}));

jest.mock('child_process');
jest.mock('../../jobs/jobs.repository', () => ({
  jobsRepository: { updateStatus: jest.fn() },
}));

import { spawn } from 'child_process';
import { jobsRepository } from '../../jobs/jobs.repository';
import { runPipeline } from '../../jobs/pipeline.runner';

const mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
const mockUpdateStatus = jobsRepository.updateStatus as jest.Mock;

function makeMockProcess(exitCode: number) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn();
  setImmediate(() => {
    if (exitCode !== 0) proc.stderr.emit('data', Buffer.from('some error'));
    proc.emit('close', exitCode, null);
  });
  return proc;
}

describe('runPipeline', () => {
  beforeEach(() => jest.clearAllMocks());

  it('marks job running then completed on exit 0', async () => {
    mockSpawn.mockReturnValue(makeMockProcess(0) as any);

    await runPipeline('job1', '/pre.tif', '/post.tif', '/outputs/job1');

    expect(mockUpdateStatus).toHaveBeenNthCalledWith(1, 'job1', 'running');
    expect(mockUpdateStatus).toHaveBeenNthCalledWith(
      2,
      'job1',
      'completed',
      expect.objectContaining({ completed_at: expect.any(Date) }),
    );
  });

  it('marks job failed on non-zero exit', async () => {
    mockSpawn.mockReturnValue(makeMockProcess(1) as any);

    await runPipeline('job1', '/pre.tif', '/post.tif', '/outputs/job1');

    expect(mockUpdateStatus).toHaveBeenLastCalledWith(
      'job1',
      'failed',
      expect.objectContaining({ error: expect.any(String) }),
    );
  });
});
