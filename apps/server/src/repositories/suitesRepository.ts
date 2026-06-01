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
                  COUNT(test_cases.id) AS case_count
           FROM test_suites
           LEFT JOIN test_cases ON test_cases.suite_id = test_suites.id
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
