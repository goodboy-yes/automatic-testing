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

export interface RunCaseRow {
  id: string;
  run_id: string;
  test_case_id: string;
  run_order: number;
  status: string;
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
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  screenshot_path: string | null;
  raw_result_json: string | null;
}

export interface CreateRunInput {
  projectId: string;
  environmentId: string;
  scopeType: string;
  scopeId?: string;
  caseIds?: string[];
}

export function createRunsRepository(db: DatabaseConnection) {
  function findById(runId: string): RunRow | undefined {
    return db.prepare<[string], RunRow>('SELECT * FROM test_runs WHERE id = ?').get(runId);
  }

  function isTerminalStatus(status: string) {
    return status === 'success' || status === 'failed' || status === 'canceled';
  }

  return {
    create(input: CreateRunInput): RunRow {
      const now = new Date().toISOString();
      const caseIds = input.caseIds ?? [];
      const run: RunRow = {
        id: nanoid(),
        project_id: input.projectId,
        environment_id: input.environmentId,
        scope_type: input.scopeType,
        scope_id: input.scopeId ?? null,
        status: 'pending',
        total_cases: caseIds.length,
        passed_cases: 0,
        failed_cases: 0,
        started_at: null,
        finished_at: null,
        duration_ms: null,
        triggered_by: null,
        created_at: now,
      };

      db.transaction(() => {
        db.prepare(
          `INSERT INTO test_runs
            (id, project_id, environment_id, scope_type, scope_id, status, total_cases, passed_cases, failed_cases, started_at, finished_at, duration_ms, triggered_by, created_at)
           VALUES
            (@id, @project_id, @environment_id, @scope_type, @scope_id, @status, @total_cases, @passed_cases, @failed_cases, @started_at, @finished_at, @duration_ms, @triggered_by, @created_at)`,
        ).run(run);

        const insertRunCase = db.prepare(
          `INSERT INTO test_run_cases
            (id, run_id, test_case_id, run_order, status, started_at, finished_at, duration_ms, error_message, artifact_path)
           VALUES
            (@id, @run_id, @test_case_id, @run_order, @status, @started_at, @finished_at, @duration_ms, @error_message, @artifact_path)`,
        );

        caseIds.forEach((caseId, runOrder) => {
          insertRunCase.run({
            id: nanoid(),
            run_id: run.id,
            test_case_id: caseId,
            run_order: runOrder,
            status: 'pending',
            started_at: null,
            finished_at: null,
            duration_ms: null,
            error_message: null,
            artifact_path: null,
          } satisfies RunCaseRow);
        });
      })();

      return run;
    },

    listByProject(projectId: string, filters?: { status?: string; scopeType?: string }): RunRow[] {
      const conditions = ['project_id = ?'];
      const params: unknown[] = [projectId];

      if (filters?.status) {
        conditions.push('status = ?');
        params.push(filters.status);
      }
      if (filters?.scopeType) {
        conditions.push('scope_type = ?');
        params.push(filters.scopeType);
      }

      const where = conditions.join(' AND ');
      return db
        .prepare<unknown[], RunRow>(`SELECT * FROM test_runs WHERE ${where} ORDER BY created_at DESC`)
        .all(...params);
    },

    findById,

    listCases(runId: string): RunCaseRow[] {
      return db
        .prepare<[string], RunCaseRow>('SELECT * FROM test_run_cases WHERE run_id = ? ORDER BY run_order ASC, id ASC')
        .all(runId);
    },

    listSteps(runId: string): RunStepRow[] {
      return db
        .prepare<[string], RunStepRow>(
          `SELECT test_run_steps.*
           FROM test_run_steps
           INNER JOIN test_run_cases ON test_run_cases.id = test_run_steps.run_case_id
           WHERE test_run_cases.run_id = ?
           ORDER BY test_run_cases.run_order ASC, test_run_cases.id ASC, test_run_steps.step_index ASC`,
        )
        .all(runId);
    },

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

    cancel(runId: string): RunRow | undefined {
      const run = findById(runId);
      if (!run) {
        return undefined;
      }

      if (isTerminalStatus(run.status)) {
        return run;
      }

      const now = new Date().toISOString();
      const startedAt = run.started_at ?? now;
      const durationMs = new Date(now).getTime() - new Date(startedAt).getTime();
      db.transaction(() => {
        db.prepare<[string, string, number, string]>(
          `UPDATE test_runs
           SET status = 'canceled',
               started_at = ?,
               finished_at = ?,
               duration_ms = ?
           WHERE id = ?`,
        ).run(startedAt, now, durationMs, runId);

        db.prepare<[string, string, string]>(
          `UPDATE test_run_cases
           SET status = 'canceled',
               started_at = COALESCE(started_at, ?),
               finished_at = ?,
               duration_ms = COALESCE(duration_ms, 0)
           WHERE run_id = ? AND status IN ('pending', 'running')`,
        ).run(now, now, runId);
      })();

      return findById(runId);
    },

    updateTotals(runId: string, input: { status: string; passedCases: number; failedCases: number }): RunRow | undefined {
      const now = new Date().toISOString();
      const run = findById(runId);
      const startedAt = run?.started_at ?? now;
      const durationMs = new Date(now).getTime() - new Date(startedAt).getTime();
      db.prepare<[string, number, number, string, number, string, string]>(
        `UPDATE test_runs
         SET status = ?,
             passed_cases = ?,
             failed_cases = ?,
             finished_at = ?,
             duration_ms = ?,
             started_at = COALESCE(started_at, ?)
         WHERE id = ?`,
      ).run(input.status, input.passedCases, input.failedCases, now, durationMs, startedAt, runId);
      return findById(runId);
    },

    updateRunCase(
      runCaseId: string,
      input: { status: string; errorMessage?: string | null; artifactPath?: string | null },
    ): RunCaseRow | undefined {
      const now = new Date().toISOString();
      db.prepare<[string, string, string, string, string | null, string | null, string]>(
        `UPDATE test_run_cases
         SET status = ?,
             started_at = COALESCE(started_at, ?),
             finished_at = CASE WHEN ? IN ('success', 'failed', 'canceled') THEN ? ELSE finished_at END,
             error_message = ?,
             artifact_path = ?
         WHERE id = ?`,
      ).run(input.status, now, input.status, now, input.errorMessage ?? null, input.artifactPath ?? null, runCaseId);

      const runCase = db.prepare<[string], RunCaseRow>('SELECT * FROM test_run_cases WHERE id = ?').get(runCaseId);
      if (!runCase?.started_at || !runCase?.finished_at) {
        return runCase;
      }

      const durationMs = new Date(runCase.finished_at).getTime() - new Date(runCase.started_at).getTime();
      db.prepare<[number, string]>('UPDATE test_run_cases SET duration_ms = ? WHERE id = ?').run(durationMs, runCaseId);
      return db.prepare<[string], RunCaseRow>('SELECT * FROM test_run_cases WHERE id = ?').get(runCaseId);
    },

    createStep(input: Omit<RunStepRow, 'id'>): RunStepRow {
      const step: RunStepRow = {
        id: nanoid(),
        ...input,
      };

      db.prepare(
        `INSERT INTO test_run_steps
          (id, run_case_id, step_id, step_index, step_title, step_type, status, started_at, finished_at, duration_ms, error_message, screenshot_path, raw_result_json)
         VALUES
          (@id, @run_case_id, @step_id, @step_index, @step_title, @step_type, @status, @started_at, @finished_at, @duration_ms, @error_message, @screenshot_path, @raw_result_json)`,
      ).run(step);

      return step;
    },
  };
}
