// src/jobs/pipeline.runner.ts
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config';
import { jobsRepository } from './jobs.repository';
import {
  persistBuildingsGeoJSONToPostGIS,
  recomputeRegionsAndClusters,
} from '../geodata/geodata.service';
import { realtimeHub } from '../realtime/ws';

const TIMEOUT_MS = 30 * 60 * 1000;

export async function runPipeline(
  jobId: string,
  prePath: string,
  postPath: string,
  outputDir: string,
): Promise<void> {
  await jobsRepository.updateStatus(jobId, 'running');
  realtimeHub.publishToJob(jobId, { type: 'job.status', jobId, status: 'running' });

  return new Promise((resolve) => {
    const mainPy = path.resolve(__dirname, '..', '..', '..', 'app', 'main.py');
    const args = [
      mainPy,
      '--pre',
      prePath,
      '--post',
      postPath,
      '--seg-model',
      config.segModelPath,
      '--dmg-model',
      config.dmgModelPath,
      '--output',
      outputDir,
    ];

    const proc = spawn(config.pythonBin, args);
    let stderr = '';
    let settled = false;

    proc.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    proc.stdout.on('data', (chunk: Buffer) => {
      process.stdout.write(chunk);
    });

    const timer = setTimeout(() => {
      settled = true;
      proc.kill();
      jobsRepository
        .updateStatus(jobId, 'failed', { error: 'Pipeline timed out after 30 minutes' })
        .then(resolve)
        .catch((err) => {
          console.error('Failed to mark job timed-out:', err);
          resolve();
        });
    }, TIMEOUT_MS);

    proc.on('close', async (code) => {
      clearTimeout(timer);
      if (settled) {
        resolve();
        return;
      }

      if (code === 0) {
        try {
          const reportPath = path.join(outputDir, 'report.json');
          const result = JSON.parse(await fs.promises.readFile(reportPath, 'utf-8'));

          // Best-effort: persist geospatial features to PostGIS if analysis_id is set.
          try {
            const job = await jobsRepository.findById(jobId);
            const analysisId = job?.analysis_id ?? null;
            if (analysisId) {
              const geoPath = path.join(outputDir, 'buildings.geojson');
              const geojson = JSON.parse(await fs.promises.readFile(geoPath, 'utf-8'));
              await persistBuildingsGeoJSONToPostGIS({ analysisId, featureCollection: geojson });
              await recomputeRegionsAndClusters({ analysisId });
            }
          } catch (err) {
            console.error('Geodata persist skipped/failed:', err);
          }

          await jobsRepository.updateStatus(jobId, 'completed', {
            result,
            completed_at: new Date(),
          });
          realtimeHub.publishToJob(jobId, {
            type: 'job.completed',
            jobId,
            analysisId: (await jobsRepository.findById(jobId))?.analysis_id ?? null,
          });
        } catch (err) {
          await jobsRepository.updateStatus(jobId, 'failed', {
            error: `Could not read report.json: ${(err as Error).message}`,
          });
          realtimeHub.publishToJob(jobId, {
            type: 'job.failed',
            jobId,
            error: (err as Error).message,
          });
        }
      } else {
        try {
          await jobsRepository.updateStatus(jobId, 'failed', {
            error: stderr || `Process exited with code ${code}`,
          });
          realtimeHub.publishToJob(jobId, {
            type: 'job.failed',
            jobId,
            error: stderr || `Process exited with code ${code}`,
          });
        } catch (err) {
          console.error('Failed to mark job failed:', err);
        }
      }

      resolve();
    });
  });
}
