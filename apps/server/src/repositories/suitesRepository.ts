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
}

export interface CreateSuiteInput {
  projectId: string;
  name: string;
  description?: string;
}

export function createSuiteRepository(db: DatabaseConnection) {
  return {
    listByProject(projectId: string): SuiteRow[] {
      return db
        .prepare<[string], SuiteRow>('SELECT * FROM test_suites WHERE project_id = ? ORDER BY updated_at DESC')
        .all(projectId);
    },

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
  };
}
