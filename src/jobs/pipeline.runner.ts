// src/jobs/pipeline.runner.ts
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config';
import { jobsRepository } from './jobs.repository';

const TIMEOUT_MS = 30 * 60 * 1000;

export async function runPipeline(
  jobId: string,
  prePath: string,
  postPath: string,
  outputDir: string,
): Promise<void> {
  await jobsRepository.updateStatus(jobId, 'running');

  return new Promise((resolve) => {
    const mainPy = path.resolve(__dirname, '..', '..', '..', 'app', 'main.py');
    const args = [
      mainPy,
      '--pre', prePath,
      '--post', postPath,
      '--seg-model', config.segModelPath,
      '--dmg-model', config.dmgModelPath,
      '--output', outputDir,
    ];

    const proc = spawn(config.pythonBin, args);
    let stderr = '';

    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill();
      jobsRepository
        .updateStatus(jobId, 'failed', { error: 'Pipeline timed out after 30 minutes' })
        .then(resolve);
    }, TIMEOUT_MS);

    proc.on('close', async (code) => {
      clearTimeout(timer);

      if (code === 0) {
        try {
          const reportPath = path.join(outputDir, 'report.json');
          const result = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
          await jobsRepository.updateStatus(jobId, 'completed', {
            result,
            completed_at: new Date(),
          });
        } catch (err) {
          await jobsRepository.updateStatus(jobId, 'failed', {
            error: `Could not read report.json: ${(err as Error).message}`,
          });
        }
      } else {
        await jobsRepository.updateStatus(jobId, 'failed', {
          error: stderr || `Process exited with code ${code}`,
        });
      }

      resolve();
    });
  });
}
