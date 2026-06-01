import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface CaseRow {
  id: string;
  project_id: string;
  suite_id: string;
  name: string;
  description: string;
  enabled: number;
  tags_json: string;
  steps_json: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCaseInput {
  name: string;
  description?: string;
}

export interface UpdateCaseInput extends CreateCaseInput {
  enabled: boolean;
  tags: string[];
}

export function listCases(suiteId: string) {
  return apiGet<CaseRow[]>(`/api/suites/${suiteId}/cases`);
}

export function getCase(caseId: string) {
  return apiGet<CaseRow>(`/api/cases/${caseId}`);
}

export function createCase(suiteId: string, input: CreateCaseInput) {
  return apiPost<CaseRow>(`/api/suites/${suiteId}/cases`, input);
}

export function updateCase(caseId: string, input: UpdateCaseInput) {
  return apiPatch<CaseRow>(`/api/cases/${caseId}`, input);
}

export function deleteCase(caseId: string) {
  return apiDelete<{ ok: true }>(`/api/cases/${caseId}`);
}
