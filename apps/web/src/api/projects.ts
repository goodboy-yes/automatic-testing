import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  default_environment_id?: string | null;
  created_at?: string;
  updated_at?: string;
  updatedAt?: string;
}

export interface SaveProjectInput {
  name: string;
  description?: string;
}

export function listProjects() {
  return apiGet<ProjectRow[]>('/api/projects');
}

export function getProject(projectId: string) {
  return apiGet<ProjectRow>(`/api/projects/${projectId}`);
}

export function createProject(input: SaveProjectInput) {
  return apiPost<ProjectRow>('/api/projects', input);
}

export function updateProject(projectId: string, input: SaveProjectInput) {
  return apiPatch<ProjectRow>(`/api/projects/${projectId}`, input);
}

export function deleteProject(projectId: string) {
  return apiDelete<{ ok: true }>(`/api/projects/${projectId}`);
}
