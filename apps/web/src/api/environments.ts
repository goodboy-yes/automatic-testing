import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export type BrowserType = 'chromium' | 'firefox' | 'webkit';

export interface EnvironmentRow {
  id: string;
  project_id: string;
  name: string;
  base_url: string;
  browser_type: BrowserType;
  viewport_width: number;
  viewport_height: number;
  default_timeout_ms: number;
  is_default: number;
  created_at?: string;
  updated_at?: string;
}

export interface SaveEnvironmentInput {
  name: string;
  baseUrl: string;
  browserType: BrowserType;
  viewportWidth: number;
  viewportHeight: number;
  defaultTimeoutMs: number;
  isDefault: boolean;
}

export function listEnvironments(projectId: string) {
  return apiGet<EnvironmentRow[]>(`/api/projects/${projectId}/environments`);
}

export function createEnvironment(projectId: string, input: SaveEnvironmentInput) {
  return apiPost<EnvironmentRow>(`/api/projects/${projectId}/environments`, input);
}

export function updateEnvironment(environmentId: string, input: SaveEnvironmentInput) {
  return apiPatch<EnvironmentRow>(`/api/environments/${environmentId}`, input);
}

export function deleteEnvironment(environmentId: string) {
  return apiDelete<{ ok: true }>(`/api/environments/${environmentId}`);
}
