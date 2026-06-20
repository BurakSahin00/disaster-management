import * as crypto from 'crypto';
import { analysesRepository, Analysis } from './analyses.repository';

export async function createAnalysis(input: {
  userId: string;
  preImageId: string;
  postImageId: string;
}): Promise<Pick<Analysis, 'id' | 'status'>> {
  const id = crypto.randomUUID();
  const analysis = await analysesRepository.create({
    id,
    user_id: input.userId,
    pre_image_id: input.preImageId,
    post_image_id: input.postImageId,
    status: 'pending',
  });
  return { id: analysis.id, status: analysis.status };
}

export async function getAnalysis(id: string): Promise<Analysis | null> {
  return analysesRepository.findById(id);
}
