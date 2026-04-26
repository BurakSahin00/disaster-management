// src/jobs/jobs.service.ts
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config';
import { jobsRepository, Job } from './jobs.repository';
import { runPipeline } from './pipeline.runner';

export async function createJob(
  preFile: Express.Multer.File,
  postFile: Express.Multer.File,
): Promise<Pick<Job, 'id' | 'status'>> {
  const jobId = crypto.randomUUID();

  const preDest = path.join(config.uploadDir, `${jobId}_pre.tif`);
  const postDest = path.join(config.uploadDir, `${jobId}_post.tif`);
  const outputDir = path.join(config.outputDir, jobId);

  fs.renameSync(preFile.path, preDest);
  fs.renameSync(postFile.path, postDest);
  fs.mkdirSync(outputDir, { recursive: true });

  const job = await jobsRepository.create({
    id: jobId,
    pre_path: preDest,
    post_path: postDest,
    output_dir: outputDir,
  });

  // Fire-and-forget: caller gets job_id immediately
  runPipeline(jobId, preDest, postDest, outputDir).catch(console.error);

  return { id: job.id, status: job.status };
}

export async function getJob(id: string): Promise<Job | null> {
  return jobsRepository.findById(id);
}
