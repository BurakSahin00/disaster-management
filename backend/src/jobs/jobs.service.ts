// src/jobs/jobs.service.ts
import * as crypto from 'crypto';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { config } from '../config';
import { getAnalysis } from '../analyses/analyses.service';
import { jobsRepository, Job } from './jobs.repository';
import { runPipeline } from './pipeline.runner';
import { validateGeoTiffs } from './geotiff.validator';

export async function createJob(
  preFile: Express.Multer.File,
  postFile: Express.Multer.File,
  analysisId?: string,
): Promise<Pick<Job, 'id' | 'status'>> {
  const jobId = crypto.randomUUID();

  if (analysisId) {
    const analysis = await getAnalysis(analysisId);
    if (!analysis) {
      throw new Error(
        'Validation error: analysisId is not in the analyses table. POST /analyses first with a real userId, preImageId, postImageId, then use the returned id in the job request.',
      );
    }
  }

  const preDest = path.join(config.uploadDir, `${jobId}_pre.tif`);
  const postDest = path.join(config.uploadDir, `${jobId}_post.tif`);
  const outputDir = path.join(config.outputDir, jobId);

  // Validate before renaming to keep the filesystem tidy on invalid uploads.
  await validateGeoTiffs({ prePath: preFile.path, postPath: postFile.path });

  await fsPromises.rename(preFile.path, preDest);
  await fsPromises.rename(postFile.path, postDest);
  await fsPromises.mkdir(outputDir, { recursive: true });

  let job: Awaited<ReturnType<typeof jobsRepository.create>>;
  try {
    job = await jobsRepository.create({
      id: jobId,
      analysis_id: analysisId ?? null,
      pre_path: preDest,
      post_path: postDest,
      output_dir: outputDir,
    });
  } catch (err) {
    for (const p of [preDest, postDest]) {
      try {
        await fsPromises.unlink(p);
      } catch {
        /* ignore */
      }
    }
    throw err;
  }

  // Fire-and-forget: caller gets job_id immediately
  runPipeline(jobId, preDest, postDest, outputDir).catch(console.error);

  return { id: job.id, status: job.status };
}

export async function getJob(id: string): Promise<Job | null> {
  return jobsRepository.findById(id);
}
