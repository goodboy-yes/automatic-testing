import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

export interface SuiteRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  case_count?: number;
  run_count?: number;
  last_run_status?: string | null;
  last_run_at?: string | null;
  pass_rate?: number | null;
}

export interface CreateSuiteInput {
  projectId: string;
  name: string;
  description?: string;
}

export interface UpdateSuiteInput {
  name?: string;
  description?: string;
  enabled?: boolean;
}

export function createSuiteRepository(db: DatabaseConnection) {
  function findById(suiteId: string): SuiteRow | undefined {
    return db.prepare<[string], SuiteRow>('SELECT * FROM test_suites WHERE id = ?').get(suiteId);
  }

  return {
    listByProject(projectId: string): SuiteRow[] {
      return db
        .prepare<[string], SuiteRow>(
          `SELECT test_suites.*,
                  COUNT(DISTINCT test_cases.id) AS case_count,
                  COUNT(DISTINCT recent_runs.id) AS run_count,
                  last_run.status AS last_run_status,
                  last_run.created_at AS last_run_at,
                  CASE
                    WHEN total_runs.total > 0
                    THEN ROUND(CAST(SUM(CASE WHEN recent_runs.status = 'success' THEN 1 ELSE 0 END) AS REAL) / CAST(total_runs.total AS REAL) * 100, 1)
                    ELSE NULL
                  END AS pass_rate
           FROM test_suites
           LEFT JOIN test_cases ON test_cases.suite_id = test_suites.id
           LEFT JOIN test_runs AS recent_runs
             ON recent_runs.scope_type = 'suite'
             AND recent_runs.scope_id = test_suites.id
             AND recent_runs.status IN ('success', 'failed', 'canceled')
           LEFT JOIN test_runs AS last_run
             ON last_run.id = (
               SELECT r.id FROM test_runs r
               WHERE r.scope_type = 'suite' AND r.scope_id = test_suites.id
               AND r.status IN ('success', 'failed', 'canceled')
               ORDER BY r.created_at DESC LIMIT 1
             )
           LEFT JOIN (
             SELECT scope_id, COUNT(*) AS total
             FROM test_runs
             WHERE scope_type = 'suite' AND status IN ('success', 'failed', 'canceled')
             GROUP BY scope_id
           ) AS total_runs ON total_runs.scope_id = test_suites.id
           WHERE test_suites.project_id = ?
           GROUP BY test_suites.id
           ORDER BY test_suites.updated_at DESC`,
        )
        .all(projectId);
    },

    findById,

    create(input: CreateSuiteInput): SuiteRow {
      const now = new Date().toISOString();
      const suite: SuiteRow = {
        id: nanoid(),
        project_id: input.projectId,
        name: input.name,
        description: input.description ?? '',
        enabled: 1,
        created_at: now,
        updated_at: now,
      };

      db.prepare(
        `INSERT INTO test_suites
          (id, project_id, name, description, enabled, created_at, updated_at)
         VALUES
          (@id, @project_id, @name, @description, @enabled, @created_at, @updated_at)`,
      ).run(suite);

      return suite;
    },

    update(suiteId: string, input: UpdateSuiteInput): SuiteRow | undefined {
      const suite = findById(suiteId);
      if (!suite) {
        return undefined;
      }

      const updatedSuite: SuiteRow = {
        ...suite,
        name: input.name ?? suite.name,
        description: input.description ?? suite.description,
        enabled: input.enabled === undefined ? suite.enabled : input.enabled ? 1 : 0,
        updated_at: new Date().toISOString(),
      };

      db.prepare(
        `UPDATE test_suites
         SET name = @name,
             description = @description,
             enabled = @enabled,
             updated_at = @updated_at
         WHERE id = @id`,
      ).run(updatedSuite);

      return findById(suiteId);
    },

    delete(suiteId: string): boolean {
      const result = db.prepare<[string]>('DELETE FROM test_suites WHERE id = ?').run(suiteId);
      return result.changes > 0;
    },
  };
}
