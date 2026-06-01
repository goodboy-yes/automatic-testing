import { apiGet, apiPost } from './client';

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  updated_at?: string;
  updatedAt?: string;
}

export function listProjects() {
  return apiGet<ProjectRow[]>('/api/projects');
}

export function createProject(input: { name: string; description?: string }) {
  return apiPost<ProjectRow>('/api/projects', input);
}
