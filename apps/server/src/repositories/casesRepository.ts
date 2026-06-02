import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

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

export function createCaseRepository(db: DatabaseConnection) {
  function findById(caseId: string): CaseRow | undefined {
    return db.prepare<[string], CaseRow>('SELECT * FROM test_cases WHERE id = ?').get(caseId);
  }

  return {
    list(): CaseListItem[] {
      return db
        .prepare<[], CaseListItem>(
          `SELECT
             test_cases.*,
             latest_run.id AS latest_run_id,
             latest_run.status AS latest_run_status,
             latest_visual_report.path AS latest_visual_report_path,
             latest_log.path AS latest_log_path
           FROM test_cases
           LEFT JOIN test_runs AS latest_run
             ON latest_run.id = (
               SELECT id
               FROM test_runs
               WHERE test_runs.case_id = test_cases.id
               ORDER BY created_at DESC, id DESC
               LIMIT 1
             )
           LEFT JOIN artifacts AS latest_visual_report
             ON latest_visual_report.id = (
               SELECT id
               FROM artifacts
               WHERE artifacts.run_id = latest_run.id AND artifacts.type = 'visual_report'
               ORDER BY created_at ASC, id ASC
               LIMIT 1
             )
           LEFT JOIN artifacts AS latest_log
             ON latest_log.id = (
               SELECT id
               FROM artifacts
               WHERE artifacts.run_id = latest_run.id AND artifacts.type = 'log'
               ORDER BY
                 CASE artifacts.path
                   WHEN 'logs/stdout.log' THEN 0
                   WHEN 'logs/stderr.log' THEN 1
                   ELSE 2
                 END,
                 created_at ASC,
                 id ASC
               LIMIT 1
             )
           ORDER BY test_cases.updated_at DESC, test_cases.id DESC`,
        )
        .all();
    },

    findById,

    create(input: CreateCaseInput): CaseRow {
      const now = new Date().toISOString();
      const testCase: CaseRow = {
        id: nanoid(),
        name: input.name,
        description: input.description ?? '',
        yaml_text: input.yamlText,
        created_at: now,
        updated_at: now,
      };

      db.prepare(
        `INSERT INTO test_cases (id, name, description, yaml_text, created_at, updated_at)
         VALUES (@id, @name, @description, @yaml_text, @created_at, @updated_at)`,
      ).run(testCase);

      return testCase;
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
        yaml_text: input.yamlText ?? testCase.yaml_text,
        updated_at: new Date().toISOString(),
      };

      db.prepare(
        `UPDATE test_cases
         SET name = @name,
             description = @description,
             yaml_text = @yaml_text,
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
