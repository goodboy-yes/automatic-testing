import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

export interface RunRow {
  id: string;
  case_id: string;
  status: string;
  exit_code: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface CreateRunInput {
  caseId: string;
}

export function createRunsRepository(db: DatabaseConnection) {
  function findById(runId: string): RunRow | undefined {
    return db.prepare<[string], RunRow>('SELECT * FROM test_runs WHERE id = ?').get(runId);
  }

  function isTerminalStatus(status: string) {
    return status === 'success' || status === 'failed' || status === 'canceled';
  }

  function updateStatus(
    runId: string,
    input: { status: string; exitCode?: number | null; errorMessage?: string | null },
  ): RunRow | undefined {
    const now = new Date().toISOString();
    const run = findById(runId);
    if (!run) {
      return undefined;
    }

    const startedAt = input.status === 'running' && !run.started_at ? now : run.started_at;
    const finishedAt = isTerminalStatus(input.status) ? now : run.finished_at;
    const durationMs =
      startedAt && finishedAt ? new Date(finishedAt).getTime() - new Date(startedAt).getTime() : run.duration_ms;

    db.prepare<[string, number | null, string | null, string | null, string | null, number | null, string]>(
      `UPDATE test_runs
       SET status = ?,
           exit_code = ?,
           error_message = ?,
           started_at = ?,
           finished_at = ?,
           duration_ms = ?
       WHERE id = ?`,
    ).run(
      input.status,
      input.exitCode === undefined ? run.exit_code : input.exitCode,
      input.errorMessage === undefined ? run.error_message : input.errorMessage,
      startedAt,
      finishedAt,
      durationMs,
      runId,
    );

    return findById(runId);
  }

  return {
    create(input: CreateRunInput): RunRow {
      const now = new Date().toISOString();
      const run: RunRow = {
        id: nanoid(),
        case_id: input.caseId,
        status: 'pending',
        exit_code: null,
        error_message: null,
        started_at: null,
        finished_at: null,
        duration_ms: null,
        created_at: now,
      };

      db.prepare(
        `INSERT INTO test_runs
          (id, case_id, status, exit_code, error_message, started_at, finished_at, duration_ms, created_at)
         VALUES
          (@id, @case_id, @status, @exit_code, @error_message, @started_at, @finished_at, @duration_ms, @created_at)`,
      ).run(run);

      return run;
    },

    listByCase(caseId: string): RunRow[] {
      return db
        .prepare<[string], RunRow>('SELECT * FROM test_runs WHERE case_id = ? ORDER BY created_at DESC, id DESC')
        .all(caseId);
    },

    listByCaseIds(caseIds: string[]): RunRow[] {
      if (caseIds.length === 0) {
        return [];
      }
      const placeholders = caseIds.map(() => '?').join(', ');
      return db.prepare<string[], RunRow>(`SELECT * FROM test_runs WHERE case_id IN (${placeholders})`).all(...caseIds);
    },

    findById,

    updateStatus,

    cancel(runId: string): RunRow | undefined {
      const run = findById(runId);
      if (!run) {
        return undefined;
      }

      if (isTerminalStatus(run.status)) {
        return run;
      }

      return updateStatus(runId, { status: 'canceled', exitCode: null, errorMessage: 'Run canceled' });
    },
  };
}
