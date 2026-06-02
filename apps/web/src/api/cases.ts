import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface CaseRow {
  id: string;
  name: string;
  description: string;
  yaml_text: string;
  created_at: string;
  updated_at: string;
}

export interface CaseListItem extends CaseRow {
  latest_run_id: string | null;
  latest_run_status: string | null;
  latest_visual_report_path: string | null;
  latest_log_path: string | null;
}

export interface CreateCaseInput {
  name: string;
  description?: string;
  yamlText: string;
}

export interface UpdateCaseInput {
  name?: string;
  description?: string;
  yamlText?: string;
}

export function listCases() {
  return apiGet<CaseListItem[]>('/api/cases');
}

export function getCase(caseId: string) {
  return apiGet<CaseRow>(`/api/cases/${encodeURIComponent(caseId)}`);
}

export function createCase(input: CreateCaseInput) {
  return apiPost<CaseRow>('/api/cases', input);
}

export function updateCase(caseId: string, input: UpdateCaseInput) {
  return apiPatch<CaseRow>(`/api/cases/${encodeURIComponent(caseId)}`, input);
}

export function deleteCase(caseId: string) {
  return apiDelete<{ ok: true }>(`/api/cases/${encodeURIComponent(caseId)}`);
}
