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

describe('test asset API', () => {
  it('creates and lists projects', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'Web 自动化', description: '核心项目' },
    });
    const listResponse = await app.inject({ method: 'GET', url: '/api/projects' });
    await app.close();

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      name: 'Web 自动化',
      description: '核心项目',
      default_environment_id: null,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([createResponse.json()]);
  });

  it('creates and lists environments for a project', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);
    const project = await createProject(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/environments`,
      payload: {
        name: '本地环境',
        baseUrl: 'https://example.com',
        browserType: 'chromium',
        viewportWidth: 1280,
        viewportHeight: 720,
        defaultTimeoutMs: 10000,
        isDefault: true,
      },
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/environments`,
    });
    await app.close();

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      project_id: project.id,
      name: '本地环境',
      base_url: 'https://example.com',
      browser_type: 'chromium',
      viewport_width: 1280,
      viewport_height: 720,
      default_timeout_ms: 10000,
      is_default: 1,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([createResponse.json()]);
  });

  it('creates and lists suites for a project', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);
    const project = await createProject(app);

    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/suites`,
      payload: { name: '冒烟测试', description: '关键路径' },
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/suites`,
    });
    await app.close();

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      project_id: project.id,
      name: '冒烟测试',
      description: '关键路径',
      enabled: 1,
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([createResponse.json()]);
  });

  it('creates, lists, and fetches cases for a suite', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);
    const project = await createProject(app);
    const suite = await createSuite(app, project.id);

    const createResponse = await app.inject({
      method: 'POST',
      url: `/api/suites/${suite.id}/cases`,
      payload: { projectId: 'different-project', name: '登录成功', description: '使用有效账号登录' },
    });
    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/suites/${suite.id}/cases`,
    });
    const getResponse = await app.inject({
      method: 'GET',
      url: `/api/cases/${createResponse.json<TestCaseResponse>().id}`,
    });
    await app.close();

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json()).toMatchObject({
      project_id: project.id,
      suite_id: suite.id,
      name: '登录成功',
      description: '使用有效账号登录',
      enabled: 1,
      tags_json: '[]',
      steps_json: '[]',
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([createResponse.json()]);
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toEqual(createResponse.json());
  });

  it('returns 404 when fetching a missing case', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const response = await app.inject({ method: 'GET', url: '/api/cases/missing-case' });
    await app.close();

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ message: 'Test case not found' });
  });

  it('returns 400 when creating a project without a name', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { description: '缺少名称' },
    });
    await app.close();

    expect(response.statusCode).toBe(400);
  });

  it('returns 404 when creating an environment under a missing project', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/missing-project/environments',
      payload: {
        name: '本地环境',
        baseUrl: 'https://example.com',
        browserType: 'chromium',
        viewportWidth: 1280,
        viewportHeight: 720,
        defaultTimeoutMs: 10000,
        isDefault: true,
      },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when creating a suite under a missing project', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const response = await app.inject({
      method: 'POST',
      url: '/api/projects/missing-project/suites',
      payload: { name: '冒烟测试' },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });

  it('returns 404 when creating a case under a missing suite', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const response = await app.inject({
      method: 'POST',
      url: '/api/suites/missing-suite/cases',
      payload: { name: '登录成功' },
    });
    await app.close();

    expect(response.statusCode).toBe(404);
  });
});

interface ProjectResponse {
  id: string;
}

interface SuiteResponse {
  id: string;
}

interface TestCaseResponse {
  id: string;
}

async function createTestApp() {
  const databasePath = path.join(os.tmpdir(), `automatic-testing-${crypto.randomUUID()}.sqlite`);
  databasePaths.push(databasePath);
  const db = openDatabase(databasePath);
  const app = await buildApp({ db });
  return { app, db };
}

async function createProject(app: Awaited<ReturnType<typeof buildApp>>): Promise<ProjectResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/projects',
    payload: { name: 'Web 自动化' },
  });
  return response.json<ProjectResponse>();
}

async function createSuite(app: Awaited<ReturnType<typeof buildApp>>, projectId: string): Promise<SuiteResponse> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/suites`,
    payload: { name: '冒烟测试' },
  });
  return response.json<SuiteResponse>();
}
