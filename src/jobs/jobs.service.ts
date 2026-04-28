// src/jobs/jobs.service.ts
import * as crypto from 'crypto';
import * as path from 'path';
import { promises as fsPromises } from 'fs';
import { config } from '../config';
import { jobsRepository, Job } from './jobs.repository';
import { runPipeline } from './pipeline.runner';

export async function createJob(
  preFile: Express.Multer.File,
  postFile: Express.Multer.File,
  analysisId?: string,
): Promise<Pick<Job, 'id' | 'status'>> {
  const jobId = crypto.randomUUID();

  const preDest = path.join(config.uploadDir, `${jobId}_pre.tif`);
  const postDest = path.join(config.uploadDir, `${jobId}_post.tif`);
  const outputDir = path.join(config.outputDir, jobId);

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
      try { await fsPromises.unlink(p); } catch { /* ignore */ }
    }
    try { await fsPromises.rm(outputDir, { recursive: true }); } catch { /* ignore */ }
    throw err;
  }

  // Fire-and-forget: caller gets job_id immediately
  runPipeline(jobId, preDest, postDest, outputDir).catch(async (err) => {
    console.error('Unexpected pipeline error for job', jobId, err);
    try {
      await jobsRepository.updateStatus(jobId, 'failed', {
        error: `Unexpected error: ${(err as Error).message ?? String(err)}`,
      });
    } catch (dbErr) {
      console.error('Failed to mark job as failed after unexpected error:', dbErr);
    }
  });

  return { id: job.id, status: job.status };
}

export async function getJob(id: string): Promise<Job | null> {
  return jobsRepository.findById(id);
}
