import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

export interface EnvironmentRow {
  id: string;
  project_id: string;
  name: string;
  base_url: string;
  browser_type: string;
  viewport_width: number;
  viewport_height: number;
  default_timeout_ms: number;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface CreateEnvironmentInput {
  projectId: string;
  name: string;
  baseUrl: string;
  browserType: string;
  viewportWidth: number;
  viewportHeight: number;
  defaultTimeoutMs: number;
  isDefault: boolean;
}

export interface UpdateEnvironmentInput {
  name?: string;
  baseUrl?: string;
  browserType?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  defaultTimeoutMs?: number;
  isDefault?: boolean;
}

export function createEnvironmentRepository(db: DatabaseConnection) {
  function findById(environmentId: string): EnvironmentRow | undefined {
    return db.prepare<[string], EnvironmentRow>('SELECT * FROM environments WHERE id = ?').get(environmentId);
  }

  function syncProjectDefault(environment: EnvironmentRow, now: string) {
    if (environment.is_default) {
      db.prepare<[string, string, string]>(
        'UPDATE environments SET is_default = 0, updated_at = ? WHERE project_id = ? AND id <> ?',
      ).run(now, environment.project_id, environment.id);
      db.prepare<[string, string, string]>(
        'UPDATE projects SET default_environment_id = ?, updated_at = ? WHERE id = ?',
      ).run(environment.id, now, environment.project_id);
      return;
    }

    db.prepare<[string, string, string]>(
      `UPDATE projects
       SET default_environment_id = NULL,
           updated_at = ?
       WHERE id = ? AND default_environment_id = ?`,
    ).run(now, environment.project_id, environment.id);
  }

  return {
    listByProject(projectId: string): EnvironmentRow[] {
      return db
        .prepare<[string], EnvironmentRow>('SELECT * FROM environments WHERE project_id = ? ORDER BY updated_at DESC')
        .all(projectId);
    },

    findById,

    create(input: CreateEnvironmentInput): EnvironmentRow {
      const now = new Date().toISOString();
      const environment: EnvironmentRow = {
        id: nanoid(),
        project_id: input.projectId,
        name: input.name,
        base_url: input.baseUrl,
        browser_type: input.browserType,
        viewport_width: input.viewportWidth,
        viewport_height: input.viewportHeight,
        default_timeout_ms: input.defaultTimeoutMs,
        is_default: input.isDefault ? 1 : 0,
        created_at: now,
        updated_at: now,
      };

      db.prepare(
        `INSERT INTO environments
          (id, project_id, name, base_url, browser_type, viewport_width, viewport_height, default_timeout_ms, is_default, created_at, updated_at)
         VALUES
          (@id, @project_id, @name, @base_url, @browser_type, @viewport_width, @viewport_height, @default_timeout_ms, @is_default, @created_at, @updated_at)`,
      ).run(environment);

      syncProjectDefault(environment, now);
      return environment;
    },

    update(environmentId: string, input: UpdateEnvironmentInput): EnvironmentRow | undefined {
      const environment = findById(environmentId);
      if (!environment) {
        return undefined;
      }

      const now = new Date().toISOString();
      const updatedEnvironment: EnvironmentRow = {
        ...environment,
        name: input.name ?? environment.name,
        base_url: input.baseUrl ?? environment.base_url,
        browser_type: input.browserType ?? environment.browser_type,
        viewport_width: input.viewportWidth ?? environment.viewport_width,
        viewport_height: input.viewportHeight ?? environment.viewport_height,
        default_timeout_ms: input.defaultTimeoutMs ?? environment.default_timeout_ms,
        is_default: input.isDefault === undefined ? environment.is_default : input.isDefault ? 1 : 0,
        updated_at: now,
      };

      db.prepare(
        `UPDATE environments
         SET name = @name,
             base_url = @base_url,
             browser_type = @browser_type,
             viewport_width = @viewport_width,
             viewport_height = @viewport_height,
             default_timeout_ms = @default_timeout_ms,
             is_default = @is_default,
             updated_at = @updated_at
         WHERE id = @id`,
      ).run(updatedEnvironment);

      syncProjectDefault(updatedEnvironment, now);
      return findById(environmentId);
    },

    delete(environmentId: string): boolean {
      const environment = findById(environmentId);
      if (!environment) {
        return false;
      }

      const deleteEnvironment = db.transaction((row: EnvironmentRow) => {
        const result = db.prepare<[string]>('DELETE FROM environments WHERE id = ?').run(row.id);
        if (row.is_default) {
          db.prepare<[string, string]>(
            'UPDATE projects SET default_environment_id = NULL, updated_at = ? WHERE id = ?',
          ).run(new Date().toISOString(), row.project_id);
        }
        return result;
      });

      return deleteEnvironment(environment).changes > 0;
    },
  };
}
