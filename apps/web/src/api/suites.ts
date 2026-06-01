import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface SuiteRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  enabled: number;
  case_count?: number;
  run_count?: number;
  last_run_status?: string | null;
  last_run_at?: string | null;
  pass_rate?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateSuiteInput {
  name: string;
  description?: string;
}

export interface UpdateSuiteInput extends CreateSuiteInput {
  enabled: boolean;
}

export function listSuites(projectId: string) {
  return apiGet<SuiteRow[]>(`/api/projects/${projectId}/suites`);
}

export function getSuite(suiteId: string) {
  return apiGet<SuiteRow>(`/api/suites/${suiteId}`);
}

export function createSuite(projectId: string, input: CreateSuiteInput) {
  return apiPost<SuiteRow>(`/api/projects/${projectId}/suites`, input);
}

export function updateSuite(suiteId: string, input: UpdateSuiteInput) {
  return apiPatch<SuiteRow>(`/api/suites/${suiteId}`, input);
}

export function deleteSuite(suiteId: string) {
  return apiDelete<{ ok: true }>(`/api/suites/${suiteId}`);
}
