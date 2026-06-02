import { apiGet, apiPost } from './client';

export type RunStatus = 'pending' | 'running' | 'success' | 'failed' | 'canceled';

export interface RunRow {
  id: string;
  case_id: string;
  status: RunStatus;
  exit_code: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface RunArtifactRow {
  id: string;
  run_id: string;
  type: 'midscene_yaml' | 'summary_json' | 'result_json' | 'visual_report' | 'screenshot' | 'log';
  path: string;
  created_at: string;
}

export interface RunDetailResponse {
  run: RunRow;
  artifacts: RunArtifactRow[];
}

export interface RunEvent {
  runId: string;
  type: 'status' | 'log';
  payload: unknown;
}

export function createCaseRun(caseId: string) {
  return apiPost<RunRow>(`/api/cases/${encodeURIComponent(caseId)}/runs`, {});
}

export function listCaseRuns(caseId: string) {
  return apiGet<RunRow[]>(`/api/cases/${encodeURIComponent(caseId)}/runs`);
}

export function getRun(runId: string) {
  return apiGet<RunDetailResponse>(`/api/runs/${encodeURIComponent(runId)}`);
}

export function cancelRun(runId: string) {
  return apiPost<RunRow>(`/api/runs/${encodeURIComponent(runId)}/cancel`, {});
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
