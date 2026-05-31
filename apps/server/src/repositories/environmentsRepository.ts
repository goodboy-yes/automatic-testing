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

export function createEnvironmentRepository(db: DatabaseConnection) {
  return {
    listByProject(projectId: string): EnvironmentRow[] {
      return db
        .prepare<[string], EnvironmentRow>('SELECT * FROM environments WHERE project_id = ? ORDER BY updated_at DESC')
        .all(projectId);
    },

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

      return environment;
    },
  };
}
