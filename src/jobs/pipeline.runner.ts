// src/jobs/pipeline.runner.ts
import { spawn } from 'child_process';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { analysesRepository } from '../analyses/analyses.repository';
import { changeMapsRepository } from '../changemaps/changemaps.repository';
import { config } from '../config';
import { jobsRepository } from './jobs.repository';
import {
  persistBuildingsGeoJSONToPostGIS,
  recomputeRegionsAndClusters,
} from '../geodata/geodata.service';
import { realtimeHub } from '../realtime/ws';

const TIMEOUT_MS = 30 * 60 * 1000;

function resolvePipelineEntrypoint(): string {
  if (config.pipelineEntrypoint && config.pipelineEntrypoint.trim().length > 0) {
    return path.resolve(config.pipelineEntrypoint);
  }

  // Support running from both tsx (src/) and compiled JS (dist/).
  const candidates = [
    // When running via tsx, __dirname is typically backend/src/jobs
    path.resolve(__dirname, '..', '..', '..', 'pipeline', 'main.py'),
    // When running compiled, __dirname is typically backend/dist/jobs
    path.resolve(__dirname, '..', '..', '..', '..', 'pipeline', 'main.py'),
  ];

  const found = candidates.find((p) => fs.existsSync(p));
  if (found) return found;

  // Keep the error message actionable and include attempted paths.
  throw new Error(
    `Pipeline entrypoint not found. Set PIPELINE_ENTRYPOINT or create pipeline at one of:\n- ${candidates.join(
      '\n- ',
    )}`,
  );
}

export async function runPipeline(
  jobId: string,
  prePath: string,
  postPath: string,
  outputDir: string,
): Promise<void> {
  await jobsRepository.updateStatus(jobId, 'running');
  realtimeHub.publishToJob(jobId, { type: 'job.status', jobId, status: 'running' });

  const jobAtStart = await jobsRepository.findById(jobId);
  if (jobAtStart?.analysis_id) {
    await analysesRepository.updateStatus(jobAtStart.analysis_id, 'running');
  }

  return new Promise((resolve) => {
    const mainPy = resolvePipelineEntrypoint();
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
        .findById(jobId)
        .then(async (job) => {
          if (job?.analysis_id) {
            await analysesRepository.updateStatus(job.analysis_id, 'failed', new Date());
          }
          await jobsRepository.updateStatus(jobId, 'failed', {
            error: 'Pipeline timed out after 30 minutes',
          });
        })
        .then(() => resolve())
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

          const job = await jobsRepository.findById(jobId);
          const analysisId = job?.analysis_id ?? null;
          let ingestOk = true;

          if (analysisId) {
            try {
              const geoPath = path.join(outputDir, 'buildings.geojson');
              if (!fs.existsSync(geoPath)) {
                ingestOk = false;
              } else {
                let changeMapId: string | null = null;
                const rasterPath = path.join(outputDir, 'damage_map.tif');
                const metaPath = path.join(outputDir, 'change_map_meta.json');
                if (fs.existsSync(rasterPath)) {
                  const uri = pathToFileURL(rasterPath).href;
                  let crsWkt: string | null = null;
                  let bbox4326GeoJSON: Record<string, unknown> | null = null;
                  let rasterFilename = 'damage_map.tif';
                  if (fs.existsSync(metaPath)) {
                    const sidecar = JSON.parse(
                      await fs.promises.readFile(metaPath, 'utf-8'),
                    ) as Record<string, unknown>;
                    if (typeof sidecar.crsWkt === 'string') crsWkt = sidecar.crsWkt;
                    if (sidecar.bbox4326GeoJSON && typeof sidecar.bbox4326GeoJSON === 'object') {
                      bbox4326GeoJSON = sidecar.bbox4326GeoJSON as Record<string, unknown>;
                    }
                    if (typeof sidecar.rasterFilename === 'string')
                      rasterFilename = sidecar.rasterFilename;
                  }
                  const cm = await changeMapsRepository.create({
                    id: crypto.randomUUID(),
                    analysisId,
                    uri,
                    crsWkt,
                    bbox4326GeoJSON,
                    meta: { jobId, rasterFilename },
                  });
                  changeMapId = cm.id;
                }

                const geojson = JSON.parse(await fs.promises.readFile(geoPath, 'utf-8'));
                await persistBuildingsGeoJSONToPostGIS({
                  analysisId,
                  featureCollection: geojson,
                  changeMapId,
                });
                await recomputeRegionsAndClusters({ analysisId });
              }
            } catch (err) {
              ingestOk = false;
              console.error('Geodata persist skipped/failed:', err);
            }
            await analysesRepository.updateStatus(
              analysisId,
              ingestOk ? 'completed' : 'failed',
              new Date(),
            );
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
          const jobFail = await jobsRepository.findById(jobId);
          if (jobFail?.analysis_id) {
            await analysesRepository.updateStatus(jobFail.analysis_id, 'failed', new Date());
          }
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
          const jobFail = await jobsRepository.findById(jobId);
          if (jobFail?.analysis_id) {
            await analysesRepository.updateStatus(jobFail.analysis_id, 'failed', new Date());
          }
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
