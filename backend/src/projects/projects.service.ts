import { projectsRepository } from './projects.repository';

export async function upsertProject(input: { userId: string; name: string }) {
  const name = input.name.trim();
  if (!name) {
    throw new Error('Validation error: project name is required.');
  }
  return projectsRepository.upsertByUserAndName({ userId: input.userId, name });
}

export async function getProjectById(id: string) {
  return projectsRepository.findById(id);
}

export async function listProjectsForUser(userId: string) {
  return projectsRepository.listByUserId(userId);
}

export async function getProjectForUser(projectId: string, userId: string) {
  return projectsRepository.findByIdAndUser(projectId, userId);
}

export async function getProjectAnalysesForUser(projectId: string, userId: string) {
  const project = await projectsRepository.findByIdAndUser(projectId, userId);
  if (!project) {
    return null;
  }
  const items = await projectsRepository.listAnalysesWithLatestJob(projectId);
  return { project, items };
}
