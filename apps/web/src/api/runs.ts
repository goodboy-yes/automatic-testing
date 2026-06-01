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

export interface RunArtifactRow {
  id: string;
  run_id: string;
  run_case_id: string | null;
  type: 'midscene_yaml' | 'summary_json' | 'result_json' | 'visual_report' | 'screenshot' | 'log';
  path: string;
  created_at: string;
}

export interface RunDetailResponse {
  run: RunRow;
  cases: RunCaseRow[];
  steps: RunStepRow[];
  artifacts: RunArtifactRow[];
}

export interface RunEvent {
  runId: string;
  type: 'status' | 'log';
  payload: unknown;
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

export function listRuns(projectId: string, filters?: { status?: string; scopeType?: string }) {
  const params = new URLSearchParams();
  if (filters?.status) {
    params.set('status', filters.status);
  }
  if (filters?.scopeType) {
    params.set('scopeType', filters.scopeType);
  }
  const query = params.toString();
  return apiGet<RunRow[]>(`/api/projects/${projectId}/runs${query ? `?${query}` : ''}`);
}

export function getRun(runId: string) {
  return apiGet<RunDetailResponse>(`/api/runs/${runId}`);
}

export function cancelRun(runId: string) {
  return apiPost<RunRow>(`/api/runs/${runId}/cancel`, {});
}

export function getRunArtifactUrl(runId: string, artifactPath: string) {
  const encodedPath = artifactPath
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join('/');

  return `/api/runs/${encodeURIComponent(runId)}/artifacts/${encodedPath}`;
}

export function subscribeRunEvents(runId: string, onEvent: (event: RunEvent) => void) {
  const eventSource = new EventSource(`/api/runs/${encodeURIComponent(runId)}/events`);
  eventSource.onmessage = (message) => {
    const event = parseRunEvent(message.data);
    if (event) {
      onEvent(event);
    }
  };

  return () => eventSource.close();
}

function parseRunEvent(data: string): RunEvent | null {
  try {
    const parsed: unknown = JSON.parse(data);
    if (!isRecord(parsed)) {
      return null;
    }

    const runId = parsed.runId;
    const type = parsed.type;
    if (typeof runId !== 'string' || (type !== 'status' && type !== 'log')) {
      return null;
    }

    return {
      runId,
      type,
      payload: parsed.payload,
    };
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
