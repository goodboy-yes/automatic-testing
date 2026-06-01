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

export interface UpdateProjectInput {
  name?: string;
  description?: string;
}

export function createProjectRepository(db: DatabaseConnection) {
  function findById(projectId: string): ProjectRow | undefined {
    return db.prepare<[string], ProjectRow>('SELECT * FROM projects WHERE id = ?').get(projectId);
  }

  return {
    list(): ProjectRow[] {
      return db.prepare<[], ProjectRow>('SELECT * FROM projects ORDER BY updated_at DESC').all();
    },

    findById,

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

    update(projectId: string, input: UpdateProjectInput): ProjectRow | undefined {
      const project = findById(projectId);
      if (!project) {
        return undefined;
      }

      const updatedProject: ProjectRow = {
        ...project,
        name: input.name ?? project.name,
        description: input.description ?? project.description,
        updated_at: new Date().toISOString(),
      };

      db.prepare(
        `UPDATE projects
         SET name = @name,
             description = @description,
             updated_at = @updated_at
         WHERE id = @id`,
      ).run(updatedProject);

      return updatedProject;
    },

    delete(projectId: string): boolean {
      const deleteProject = db.transaction((id: string) => {
        db.prepare<[string]>('DELETE FROM test_runs WHERE project_id = ?').run(id);
        return db.prepare<[string]>('DELETE FROM projects WHERE id = ?').run(id);
      });
      const result = deleteProject(projectId);
      return result.changes > 0;
    },
  };
}
