import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase, type DatabaseConnection } from '../db/database.js';

const openConnections: DatabaseConnection[] = [];
const databasePaths: string[] = [];
const artifactPaths: string[] = [];

afterEach(() => {
  for (const db of openConnections.splice(0)) {
    db.close();
  }
  for (const databasePath of databasePaths.splice(0)) {
    fs.rmSync(databasePath, { force: true });
  }
  for (const artifactPath of artifactPaths.splice(0)) {
    fs.rmSync(artifactPath, { recursive: true, force: true });
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

  it('fetches, updates, and deletes a project', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);
    const project = await createProject(app);
    const environment = await createEnvironment(app, project.id);
    const suite = await createSuite(app, project.id);
    const testCase = await createCase(app, suite.id);
    await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        projectId: project.id,
        environmentId: environment.id,
        scopeType: 'case',
        scopeId: testCase.id,
      },
    });

    const getResponse = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${project.id}`,
      payload: { name: 'Web 回归', description: '更新后的项目' },
    });
    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/projects/${project.id}` });
    const missingResponse = await app.inject({ method: 'GET', url: `/api/projects/${project.id}` });
    const runsResponse = await app.inject({ method: 'GET', url: `/api/projects/${project.id}/runs` });
    await app.close();

    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json()).toMatchObject({ id: project.id, name: 'Web 自动化' });
    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json()).toMatchObject({
      id: project.id,
      name: 'Web 回归',
      description: '更新后的项目',
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ ok: true });
    expect(missingResponse.statusCode).toBe(404);
    expect(runsResponse.statusCode).toBe(200);
    expect(runsResponse.json()).toEqual([]);
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

  it('previews generated Midscene YAML for a case and environment', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);
    const project = await createProject(app);
    const environment = await createEnvironment(app, project.id);
    const suite = await createSuite(app, project.id);
    const testCase = await createCase(app, suite.id);

    db.prepare<[string, string]>('UPDATE test_cases SET steps_json = ? WHERE id = ?').run(
      JSON.stringify([
        {
          id: 'step_1',
          type: 'navigate',
          title: '打开登录页',
          enabled: true,
          params: { path: '/login' },
        },
        {
          id: 'step_2',
          type: 'aiTap',
          title: '点击登录',
          enabled: true,
          params: { locate: '登录按钮' },
        },
      ]),
      testCase.id,
    );

    const response = await app.inject({
      method: 'POST',
      url: `/api/cases/${testCase.id}/preview-midscene-yaml`,
      payload: { environmentId: environment.id },
    });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json<PreviewYamlResponse>().yaml).toContain('url: https://example.com/login');
    expect(response.json<PreviewYamlResponse>().yaml).toContain('aiTap: 登录按钮');
  });
});

describe('run API and worker', () => {
  it('creates a run, enqueues it, and lists runs for the project', async () => {
    const { app, db, enqueuedJobs } = await createTestApp();
    openConnections.push(db);
    const project = await createProject(app);
    const environment = await createEnvironment(app, project.id);
    const suite = await createSuite(app, project.id);
    const testCase = await createCase(app, suite.id);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        projectId: project.id,
        environmentId: environment.id,
        scopeType: 'case',
        scopeId: testCase.id,
      },
    });
    const run = createResponse.json<RunResponse>();
    const listResponse = await app.inject({
      method: 'GET',
      url: `/api/projects/${project.id}/runs`,
    });
    await app.close();

    expect(createResponse.statusCode).toBe(201);
    expect(run).toMatchObject({
      project_id: project.id,
      environment_id: environment.id,
      scope_type: 'case',
      scope_id: testCase.id,
      status: 'pending',
    });
    expect(enqueuedJobs).toEqual([{ runId: run.id }]);
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toEqual([run]);
  });

  it('generates a Midscene YAML artifact and marks the run successful', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);
    const project = await createProject(app);
    const environment = await createEnvironment(app, project.id);
    const suite = await createSuite(app, project.id);
    const testCase = await createCase(app, suite.id);
    const artifactRoot = path.join(os.tmpdir(), `automatic-testing-artifacts-${crypto.randomUUID()}`);
    artifactPaths.push(artifactRoot);

    db.prepare<[string, string]>('UPDATE test_cases SET steps_json = ? WHERE id = ?').run(
      JSON.stringify([
        {
          id: 'step_1',
          type: 'navigate',
          title: '打开登录页',
          enabled: true,
          params: { path: '/login' },
        },
        {
          id: 'step_2',
          type: 'aiTap',
          title: '点击登录',
          enabled: true,
          params: { locate: '登录按钮' },
        },
      ]),
      testCase.id,
    );

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: {
        projectId: project.id,
        environmentId: environment.id,
        scopeType: 'case',
        scopeId: testCase.id,
      },
    });
    const run = createResponse.json<RunResponse>();
    const { RunWorker } = await import('../worker/runWorker.js');
    const worker = new RunWorker({ db, artifactsDir: artifactRoot });

    await worker.run({ runId: run.id });
    const completedRun = db.prepare<[string], RunResponse>('SELECT * FROM test_runs WHERE id = ?').get(run.id);
    await app.close();

    expect(completedRun?.status).toBe('success');
    expect(fs.readFileSync(path.join(artifactRoot, 'runs', run.id, 'midscene.yaml'), 'utf8')).toContain(
      'url: https://example.com/login',
    );
    expect(fs.readFileSync(path.join(artifactRoot, 'runs', run.id, 'logs', 'run.log'), 'utf8')).toContain(
      'Generated Midscene YAML',
    );
  });
});

interface ProjectResponse {
  id: string;
}

interface EnvironmentResponse {
  id: string;
}

interface SuiteResponse {
  id: string;
}

interface TestCaseResponse {
  id: string;
}

interface RunResponse {
  id: string;
  project_id: string;
  environment_id: string;
  scope_type: string;
  scope_id: string | null;
  status: string;
}

interface PreviewYamlResponse {
  yaml: string;
}

interface EnqueuedRunJob {
  runId: string;
}

async function createTestApp() {
  const databasePath = path.join(os.tmpdir(), `automatic-testing-${crypto.randomUUID()}.sqlite`);
  databasePaths.push(databasePath);
  const db = openDatabase(databasePath);
  const enqueuedJobs: EnqueuedRunJob[] = [];
  const runQueue = {
    enqueue(job: EnqueuedRunJob) {
      enqueuedJobs.push(job);
    },
  };
  const app = await buildApp({ db, runQueue });
  return { app, db, enqueuedJobs };
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

async function createEnvironment(
  app: Awaited<ReturnType<typeof buildApp>>,
  projectId: string,
): Promise<EnvironmentResponse> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/environments`,
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
  return response.json<EnvironmentResponse>();
}

async function createCase(app: Awaited<ReturnType<typeof buildApp>>, suiteId: string): Promise<TestCaseResponse> {
  const response = await app.inject({
    method: 'POST',
    url: `/api/suites/${suiteId}/cases`,
    payload: { name: '登录成功' },
  });
  return response.json<TestCaseResponse>();
}
