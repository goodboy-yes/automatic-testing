import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase, type DatabaseConnection } from '../db/database.js';

const openConnections: DatabaseConnection[] = [];
const databasePaths: string[] = [];

afterEach(() => {
  for (const db of openConnections.splice(0)) {
    db.close();
  }
  for (const databasePath of databasePaths.splice(0)) {
    fs.rmSync(databasePath, { force: true });
  }
});

describe('server bootstrap', () => {
  it('initializes the database schema and enables foreign keys', () => {
    const databasePath = path.join(os.tmpdir(), `automatic-testing-${crypto.randomUUID()}.sqlite`);
    databasePaths.push(databasePath);
    const db = openDatabase(databasePath);
    openConnections.push(db);

    const foreignKeys = db.pragma('foreign_keys', { simple: true });
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(foreignKeys).toBe(1);
    expect(tables).toEqual([
      'artifacts',
      'environments',
      'projects',
      'test_cases',
      'test_run_cases',
      'test_run_steps',
      'test_runs',
      'test_suites',
    ]);
  });

  it('reports health with database availability', async () => {
    const databasePath = path.join(os.tmpdir(), `automatic-testing-${crypto.randomUUID()}.sqlite`);
    databasePaths.push(databasePath);
    const db = openDatabase(databasePath);
    openConnections.push(db);
    const app = await buildApp({ db });

    const response = await app.inject({ method: 'GET', url: '/api/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, database: true });
  });
});
