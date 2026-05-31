import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  default_environment_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export function createProjectRepository(db: DatabaseConnection) {
  return {
    list(): ProjectRow[] {
      return db.prepare<[], ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC').all();
    },

    findById(projectId: string): ProjectRow | undefined {
      return db.prepare<[string], ProjectRow>('SELECT * FROM projects WHERE id = ?').get(projectId);
    },

    create(input: CreateProjectInput): ProjectRow {
      const now = new Date().toISOString();
      const project: ProjectRow = {
        id: nanoid(),
        name: input.name,
        description: input.description ?? '',
        default_environment_id: null,
        created_at: now,
        updated_at: now,
      };

      db.prepare(
        `INSERT INTO projects
          (id, name, description, default_environment_id, created_at, updated_at)
         VALUES
          (@id, @name, @description, @default_environment_id, @created_at, @updated_at)`,
      ).run(project);

      return project;
    },
  };
}
