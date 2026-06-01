import type { RunScopeType, RunStatus } from '@automatic-testing/shared';
import { apiGet, apiPost } from './client';

export interface RunRow {
  id: string;
  project_id: string;
  environment_id: string;
  scope_type: RunScopeType;
  scope_id: string | null;
  status: RunStatus;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  triggered_by: string | null;
  created_at: string;
}

export interface RunCaseRow {
  id: string;
  run_id: string;
  test_case_id: string;
  run_order: number;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  artifact_path: string | null;
}

export interface RunStepRow {
  id: string;
  run_case_id: string;
  step_id: string;
  step_index: number;
  step_title: string;
  step_type: string;
  status: RunStatus;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  screenshot_path: string | null;
  raw_result_json: string | null;
}

export interface RunDetailResponse {
  run: RunRow;
  cases: RunCaseRow[];
  steps: RunStepRow[];
}

export type CreateRunInput =
  | {
      projectId: string;
      environmentId: string;
      scopeType: 'case';
      scopeId: string;
    }
  | {
      projectId: string;
      environmentId: string;
      scopeType: 'suite';
      scopeId: string;
    }
  | {
      projectId: string;
      environmentId: string;
      scopeType: 'selection';
      scopeId?: string;
      caseIds: string[];
    };

export function createRun(input: CreateRunInput) {
  return apiPost<RunRow>('/api/runs', input);
}

export function listRuns(projectId: string) {
  return apiGet<RunRow[]>(`/api/projects/${projectId}/runs`);
}

export function getRun(runId: string) {
  return apiGet<RunDetailResponse>(`/api/runs/${runId}`);
}

export function getRunArtifactUrl(runId: string, artifactPath: string) {
  const encodedPath = artifactPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');

  return `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodedPath}`;
}
