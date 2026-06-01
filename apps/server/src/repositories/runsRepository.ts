import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

export interface RunRow {
  id: string;
  project_id: string;
  environment_id: string;
  scope_type: string;
  scope_id: string | null;
  status: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  triggered_by: string | null;
  created_at: string;
}

export interface CreateRunInput {
  projectId: string;
  environmentId: string;
  scopeType: string;
  scopeId?: string;
}

export function createRunsRepository(db: DatabaseConnection) {
  function findById(runId: string): RunRow | undefined {
    return db.prepare<[string], RunRow>('SELECT * FROM test_runs WHERE id = ?').get(runId);
  }

  return {
    create(input: CreateRunInput): RunRow {
      const now = new Date().toISOString();
      const run: RunRow = {
        id: nanoid(),
        project_id: input.projectId,
        environment_id: input.environmentId,
        scope_type: input.scopeType,
        scope_id: input.scopeId ?? null,
        status: 'pending',
        total_cases: 0,
        passed_cases: 0,
        failed_cases: 0,
        started_at: null,
        finished_at: null,
        duration_ms: null,
        triggered_by: null,
        created_at: now,
      };

      db.prepare(
        `INSERT INTO test_runs
          (id, project_id, environment_id, scope_type, scope_id, status, total_cases, passed_cases, failed_cases, started_at, finished_at, duration_ms, triggered_by, created_at)
         VALUES
          (@id, @project_id, @environment_id, @scope_type, @scope_id, @status, @total_cases, @passed_cases, @failed_cases, @started_at, @finished_at, @duration_ms, @triggered_by, @created_at)`,
      ).run(run);

      return run;
    },

    listByProject(projectId: string): RunRow[] {
      return db
        .prepare<[string], RunRow>('SELECT * FROM test_runs WHERE project_id = ? ORDER BY created_at DESC')
        .all(projectId);
    },

    findById,

    updateStatus(runId: string, status: string): RunRow | undefined {
      const now = new Date().toISOString();
      db.prepare<[string, string, string, string, string, string]>(
        `UPDATE test_runs
         SET status = ?,
             started_at = CASE WHEN started_at IS NULL AND ? = 'running' THEN ? ELSE started_at END,
             finished_at = CASE WHEN ? IN ('success', 'failed', 'canceled') THEN ? ELSE finished_at END
         WHERE id = ?`,
      ).run(status, status, now, status, now, runId);

      const run = findById(runId);
      if (!run?.started_at || !run?.finished_at) {
        return run;
      }

      const durationMs = new Date(run.finished_at).getTime() - new Date(run.started_at).getTime();
      db.prepare<[number, string]>('UPDATE test_runs SET duration_ms = ? WHERE id = ?').run(durationMs, runId);
      return findById(runId);
    },
  };
}
