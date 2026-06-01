import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

export interface CaseRow {
  id: string;
  project_id: string;
  suite_id: string;
  name: string;
  description: string;
  enabled: number;
  tags_json: string;
  steps_json: string;
  created_at: string;
  updated_at: string;
}

export interface CreateCaseInput {
  projectId: string;
  suiteId: string;
  name: string;
  description?: string;
}

export interface UpdateCaseInput {
  name?: string;
  description?: string;
  enabled?: boolean;
  tags?: string[];
}

export function createCaseRepository(db: DatabaseConnection) {
  function findById(caseId: string): CaseRow | undefined {
    return db.prepare<[string], CaseRow>('SELECT * FROM test_cases WHERE id = ?').get(caseId);
  }

  return {
    listBySuite(suiteId: string): CaseRow[] {
      return db
        .prepare<[string], CaseRow>('SELECT * FROM test_cases WHERE suite_id = ? ORDER BY updated_at DESC')
        .all(suiteId);
    },

    findById,

    create(input: CreateCaseInput): CaseRow {
      const now = new Date().toISOString();
      const testCase: CaseRow = {
        id: nanoid(),
        project_id: input.projectId,
        suite_id: input.suiteId,
        name: input.name,
        description: input.description ?? '',
        enabled: 1,
        tags_json: JSON.stringify([]),
        steps_json: JSON.stringify([]),
        created_at: now,
        updated_at: now,
      };

      db.prepare(
        `INSERT INTO test_cases
          (id, project_id, suite_id, name, description, enabled, tags_json, steps_json, created_at, updated_at)
         VALUES
          (@id, @project_id, @suite_id, @name, @description, @enabled, @tags_json, @steps_json, @created_at, @updated_at)`,
      ).run(testCase);

      return testCase;
    },

    updateSteps(caseId: string, steps: unknown[]): CaseRow | undefined {
      const now = new Date().toISOString();
      db.prepare<[string, string, string]>('UPDATE test_cases SET steps_json = ?, updated_at = ? WHERE id = ?').run(
        JSON.stringify(steps),
        now,
        caseId,
      );
      return findById(caseId);
    },

    update(caseId: string, input: UpdateCaseInput): CaseRow | undefined {
      const testCase = findById(caseId);
      if (!testCase) {
        return undefined;
      }

      const updatedCase: CaseRow = {
        ...testCase,
        name: input.name ?? testCase.name,
        description: input.description ?? testCase.description,
        enabled: input.enabled === undefined ? testCase.enabled : input.enabled ? 1 : 0,
        tags_json: input.tags ? JSON.stringify(input.tags) : testCase.tags_json,
        updated_at: new Date().toISOString(),
      };

      db.prepare(
        `UPDATE test_cases
         SET name = @name,
             description = @description,
             enabled = @enabled,
             tags_json = @tags_json,
             updated_at = @updated_at
         WHERE id = @id`,
      ).run(updatedCase);

      return findById(caseId);
    },

    delete(caseId: string): boolean {
      const result = db.prepare<[string]>('DELETE FROM test_cases WHERE id = ?').run(caseId);
      return result.changes > 0;
    },
  };
}
