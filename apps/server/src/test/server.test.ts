import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../app.js';
import { openDatabase, type DatabaseConnection } from '../db/database.js';
import { RunWorker } from '../worker/runWorker.js';

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
  it('initializes the simplified case-centered schema', () => {
    const databasePath = createDatabasePath();
    const db = openDatabase(databasePath);
    openConnections.push(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(tables).toEqual(['artifacts', 'test_cases', 'test_runs']);
  });

  it('reports health with database availability', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const response = await app.inject({ method: 'GET', url: '/api/health' });
    await app.close();

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, database: true });
  });
});

describe('case API', () => {
  it('creates, lists, fetches, updates, and deletes YAML cases', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/cases',
      payload: { name: '登录成功', description: '有效账号登录', yamlText: validYaml('登录成功') },
    });
    const created = createResponse.json<TestCaseResponse>();
    const listResponse = await app.inject({ method: 'GET', url: '/api/cases' });
    const getResponse = await app.inject({ method: 'GET', url: `/api/cases/${created.id}` });
    const updateResponse = await app.inject({
      method: 'PATCH',
      url: `/api/cases/${created.id}`,
      payload: { name: '登录失败提示', description: '校验错误提示', yamlText: validYaml('登录失败提示') },
    });
    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/cases/${created.id}` });
    const missingResponse = await app.inject({ method: 'GET', url: `/api/cases/${created.id}` });
    await app.close();

    expect(createResponse.statusCode).toBe(201);
    expect(created).toMatchObject({
      name: '登录成功',
      description: '有效账号登录',
      yaml_text: validYaml('登录成功'),
    });
    expect(listResponse.json<TestCaseListItem[]>()).toEqual([
      expect.objectContaining({ id: created.id, latest_run_id: null, latest_run_status: null }),
    ]);
    expect(getResponse.json()).toEqual(created);
    expect(updateResponse.json()).toMatchObject({
      id: created.id,
      name: '登录失败提示',
      yaml_text: validYaml('登录失败提示'),
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json()).toEqual({ ok: true });
    expect(missingResponse.statusCode).toBe(404);
  });

  it('rejects empty or invalid YAML when creating and updating cases', async () => {
    const { app, db } = await createTestApp();
    openConnections.push(db);
    const testCase = await createCase(app);

    const emptyResponse = await app.inject({
      method: 'POST',
      url: '/api/cases',
      payload: { name: '空 YAML', yamlText: '   ' },
    });
    const invalidResponse = await app.inject({
      method: 'PATCH',
      url: `/api/cases/${testCase.id}`,
      payload: { yamlText: 'web:\n  url: [broken' },
    });
    await app.close();

    expect(emptyResponse.statusCode).toBe(400);
    expect(invalidResponse.statusCode).toBe(400);
  });
});

describe('run API and worker', () => {
  it('creates a single-case run and exposes run detail', async () => {
    const { app, db, enqueuedJobs } = await createTestApp();
    openConnections.push(db);
    const testCase = await createCase(app);

    const createResponse = await app.inject({ method: 'POST', url: `/api/cases/${testCase.id}/runs` });
    const run = createResponse.json<RunResponse>();
    const listResponse = await app.inject({ method: 'GET', url: `/api/cases/${testCase.id}/runs` });
    const detailResponse = await app.inject({ method: 'GET', url: `/api/runs/${run.id}` });
    await app.close();

    expect(createResponse.statusCode).toBe(201);
    expect(run).toMatchObject({ case_id: testCase.id, status: 'pending', exit_code: null });
    expect(enqueuedJobs).toEqual([{ runId: run.id }]);
    expect(listResponse.json<RunResponse[]>()).toEqual([run]);
    expect(detailResponse.json<RunDetailResponse>()).toEqual({ run, artifacts: [] });
  });

  it('runs the saved Midscene YAML, stores artifacts, and serves the visual report', async () => {
    const artifactRoot = createArtifactRoot();
    const { app, db } = await createTestApp({ artifactsDir: artifactRoot });
    openConnections.push(db);
    const testCase = await createCase(app, { yamlText: validYaml('打开首页') });
    const createResponse = await app.inject({ method: 'POST', url: `/api/cases/${testCase.id}/runs` });
    const run = createResponse.json<RunResponse>();
    const worker = new RunWorker({
      db,
      artifactsDir: artifactRoot,
      executeMidscene: async ({ outputDir }) => {
        fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify({ pass: 1 }), 'utf8');
        fs.writeFileSync(path.join(outputDir, 'visual-report.html'), '<html>report</html>', 'utf8');
        return { status: 'success', exitCode: 0, stdout: 'ok', stderr: '', summaryPath: 'summary.json' };
      },
    });

    await worker.run({ runId: run.id });
    const detailResponse = await app.inject({ method: 'GET', url: `/api/runs/${run.id}` });
    const reportResponse = await app.inject({
      method: 'GET',
      url: `/api/runs/${run.id}/artifacts/visual-report.html`,
    });
    await app.close();

    const detail = detailResponse.json<RunDetailResponse>();
    expect(detail.run).toMatchObject({ id: run.id, status: 'success', exit_code: 0 });
    expect(detail.artifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'midscene_yaml', path: 'midscene.yaml' }),
        expect.objectContaining({ type: 'visual_report', path: 'visual-report.html' }),
        expect.objectContaining({ type: 'summary_json', path: 'summary.json' }),
      ]),
    );
    expect(fs.readFileSync(path.join(artifactRoot, 'runs', run.id, 'midscene.yaml'), 'utf8')).toBe(validYaml('打开首页'));
    expect(reportResponse.statusCode).toBe(200);
    expect(reportResponse.headers['content-type']).toContain('text/html');
    expect(reportResponse.body).toContain('report');
  });

  it('marks failed and canceled runs with exit code and error message', async () => {
    const { app, db, canceledRunIds } = await createTestApp();
    openConnections.push(db);
    const testCase = await createCase(app);
    const createResponse = await app.inject({ method: 'POST', url: `/api/cases/${testCase.id}/runs` });
    const run = createResponse.json<RunResponse>();
    const cancelResponse = await app.inject({ method: 'POST', url: `/api/runs/${run.id}/cancel` });
    const worker = new RunWorker({
      db,
      artifactsDir: createArtifactRoot(),
      executeMidscene: async () => {
        throw new Error('should not execute canceled run');
      },
    });

    await worker.run({ runId: run.id });
    await app.close();

    expect(cancelResponse.statusCode).toBe(200);
    expect(cancelResponse.json<RunResponse>()).toMatchObject({ id: run.id, status: 'canceled' });
    expect(canceledRunIds).toEqual([run.id]);
    expect(db.prepare<[string], RunResponse>('SELECT * FROM test_runs WHERE id = ?').get(run.id)?.status).toBe(
      'canceled',
    );
  });

  it('deletes a case with its runs, artifacts, and artifact directories', async () => {
    const artifactRoot = createArtifactRoot();
    const { app, db } = await createTestApp({ artifactsDir: artifactRoot });
    openConnections.push(db);
    const testCase = await createCase(app);
    const createResponse = await app.inject({ method: 'POST', url: `/api/cases/${testCase.id}/runs` });
    const run = createResponse.json<RunResponse>();
    const runDir = path.join(artifactRoot, 'runs', run.id);
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'visual-report.html'), '<html></html>', 'utf8');

    const deleteResponse = await app.inject({ method: 'DELETE', url: `/api/cases/${testCase.id}` });
    await app.close();

    expect(deleteResponse.statusCode).toBe(200);
    expect(db.prepare('SELECT * FROM test_runs WHERE case_id = ?').all(testCase.id)).toEqual([]);
    expect(db.prepare('SELECT * FROM artifacts WHERE run_id = ?').all(run.id)).toEqual([]);
    expect(fs.existsSync(runDir)).toBe(false);
  });
});

interface TestCaseResponse {
  id: string;
  name: string;
  description: string;
  yaml_text: string;
  created_at: string;
  updated_at: string;
}

interface TestCaseListItem extends TestCaseResponse {
  latest_run_id: string | null;
  latest_run_status: string | null;
  latest_visual_report_path: string | null;
}

interface RunResponse {
  id: string;
  case_id: string;
  status: string;
  exit_code: number | null;
  error_message: string | null;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number | null;
  created_at: string;
}

interface RunDetailResponse {
  run: RunResponse;
  artifacts: Array<{
    id: string;
    run_id: string;
    type: string;
    path: string;
    created_at: string;
  }>;
}

interface EnqueuedRunJob {
  runId: string;
}

async function createTestApp(options: { artifactsDir?: string } = {}) {
  const databasePath = createDatabasePath();
  const db = openDatabase(databasePath);
  const enqueuedJobs: EnqueuedRunJob[] = [];
  const canceledRunIds: string[] = [];
  const runQueue = {
    enqueue(job: EnqueuedRunJob) {
      enqueuedJobs.push(job);
    },
    cancel(runId: string) {
      canceledRunIds.push(runId);
      const queuedIndex = enqueuedJobs.findIndex((job) => job.runId === runId);
      if (queuedIndex >= 0) {
        enqueuedJobs.splice(queuedIndex, 1);
      }
      return queuedIndex >= 0;
    },
  };
  const app = await buildApp({ db, runQueue, artifactsDir: options.artifactsDir });
  return { app, db, enqueuedJobs, canceledRunIds };
}

async function createCase(
  app: Awaited<ReturnType<typeof buildApp>>,
  overrides: { name?: string; description?: string; yamlText?: string } = {},
): Promise<TestCaseResponse> {
  const response = await app.inject({
    method: 'POST',
    url: '/api/cases',
    payload: {
      name: overrides.name ?? '登录成功',
      description: overrides.description ?? '',
      yamlText: overrides.yamlText ?? validYaml(overrides.name ?? '登录成功'),
    },
  });
  return response.json<TestCaseResponse>();
}

function validYaml(name: string) {
  return ['web:', '  url: https://example.com', 'tasks:', `  - name: ${name}`, '    flow:', '      - aiAssert: 页面加载成功', ''].join('\n');
}

function createDatabasePath() {
  const databasePath = path.join(os.tmpdir(), `automatic-testing-${crypto.randomUUID()}.sqlite`);
  databasePaths.push(databasePath);
  return databasePath;
}

function createArtifactRoot() {
  const artifactRoot = path.join(os.tmpdir(), `automatic-testing-artifacts-${crypto.randomUUID()}`);
  artifactPaths.push(artifactRoot);
  return artifactRoot;
}
