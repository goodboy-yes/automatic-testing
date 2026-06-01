import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database.js';

export interface ArtifactRow {
  id: string;
  run_id: string;
  run_case_id: string | null;
  type: string;
  path: string;
  created_at: string;
}

export interface CreateArtifactInput {
  runId: string;
  runCaseId?: string | null;
  type: string;
  path: string;
}

export function createArtifactsRepository(db: DatabaseConnection) {
  return {
    create(input: CreateArtifactInput): ArtifactRow {
      const artifact: ArtifactRow = {
        id: nanoid(),
        run_id: input.runId,
        run_case_id: input.runCaseId ?? null,
        type: input.type,
        path: input.path,
        created_at: new Date().toISOString(),
      };

      db.prepare(
        `INSERT INTO artifacts (id, run_id, run_case_id, type, path, created_at)
         VALUES (@id, @run_id, @run_case_id, @type, @path, @created_at)`,
      ).run(artifact);

      return artifact;
    },

    listByRun(runId: string): ArtifactRow[] {
      return db
        .prepare<[string], ArtifactRow>('SELECT * FROM artifacts WHERE run_id = ? ORDER BY created_at ASC, id ASC')
        .all(runId);
    },
  };
}
