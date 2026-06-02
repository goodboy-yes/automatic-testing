# Midscene Remaining Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 补齐当前平台还没做或不完整的执行闭环能力，让队列真正调用 Midscene CLI、沉淀可追踪产物、支持进程级取消，并完善运行历史与套件运行指标。

**Architecture:** 保持现有 monorepo 和边界：`packages/midscene-runner` 负责 YAML 执行与产物解析，`apps/server` 负责任务生命周期、数据库写入、取消信号和产物访问，`apps/web` 只通过已有 API 层展示运行状态、筛选与报告入口。明确不做项目概览改造；项目概览页继续保持现状，除非用户后续重新要求。

**Tech Stack:** pnpm workspace, TypeScript, Node.js `child_process`, Fastify, SQLite/better-sqlite3, React, Ant Design v6, React Query, Vitest, Midscene CLI (`midscene ./file.yaml`, `--summary`).

---

## Scope

### Included

- 真正调用 Midscene YAML runner，而不是只生成 YAML 后模拟成功。
- 捕获 stdout/stderr、summary JSON、单 YAML 结果 JSON、visual report HTML、截图和日志。
- 将产物写入 `artifacts` 表，并在报告页提供 visual report / JSON / 截图入口。
- 从 Midscene result JSON 中解析可用的步骤状态、错误信息和截图路径；如果真实 JSON 缺字段，仅用平台步骤定义做 fallback。
- 运行取消时终止当前 Midscene 子进程，并把未完成 case/step 保持为 `canceled`。
- 运行历史筛选：状态、范围、创建时间。
- 套件列表增强：最近运行状态、最近通过率。

### Excluded

- 项目概览动态化：用户已明确不需要。
- 登录、角色权限、密钥管理页面、定时任务、CI API、分布式 Worker、多执行器 UI。
- 新增复杂依赖。除 Midscene CLI 运行所需依赖外，不引入新包。

### External Reference

- Midscene 官方 YAML runner 文档说明命令为 `midscene ./bing-search.yaml`，项目安装时可用 `npx midscene ./bing-search.yaml`。
- 文档也说明执行后输出目录包含 `--summary` 指定的 JSON summary、每个 YAML 文件对应的 JSON result 和 visual report HTML。

---

## File Structure

### Runner Package

- Create: `packages/midscene-runner/src/executor.ts`
  - 负责启动 Midscene CLI、传入 YAML 文件路径和输出目录、捕获 stdout/stderr、支持 `AbortSignal` 取消、返回退出码和产物路径。
- Create: `packages/midscene-runner/src/executor.test.ts`
  - 使用注入式 fake process runner 验证命令参数、summary 路径、stdout/stderr、非 0 退出、取消。
- Create: `packages/midscene-runner/src/artifacts.ts`
  - 负责扫描 Midscene 输出目录，解析 summary/result JSON，识别 visual report HTML、截图和日志，并将 result JSON 中的步骤结果规范化。
- Create: `packages/midscene-runner/src/artifacts.test.ts`
  - 使用临时目录构造 summary/result/report/screenshot，验证解析结果。
- Modify: `packages/midscene-runner/src/index.ts`
  - 导出 executor 和 artifact parser。
- Modify: `packages/midscene-runner/package.json`
  - 添加 Midscene CLI 依赖或脚本说明。优先使用 `@midscene/cli` 作为 dev/runtime 可用依赖；若安装验证表明包名不同，以官方文档对应包为准。

### Server

- Create: `apps/server/src/repositories/artifactsRepository.ts`
  - 封装 `artifacts` 表的 create/list/find。
- Create: `apps/server/src/worker/runCancellation.ts`
  - 管理 runId 到 `AbortController` 的注册、取消、清理。
- Modify: `apps/server/src/worker/runWorker.ts`
  - 用 runner executor 替换模拟结果；逐 case 执行；解析产物后写入 run case、step、artifact。
- Modify: `apps/server/src/repositories/runsRepository.ts`
  - 增加运行筛选查询；增加按 result 写入 step 的辅助能力；必要时支持清理/覆盖 stale steps。
- Modify: `apps/server/src/repositories/suitesRepository.ts`
  - 套件列表查询补充最近运行状态和最近通过率。
- Modify: `apps/server/src/routes/runsRoutes.ts`
  - `GET /api/projects/:projectId/runs` 支持 query 筛选。
  - `POST /api/runs/:runId/cancel` 调用 cancellation registry。
  - `GET /api/runs/:runId` 返回 artifacts。
  - 保持并回归验证 `GET /api/runs/:runId/artifacts/*` 的 run-scoped 文件访问和路径穿越防护。
- Modify: `apps/server/src/app.ts`
  - 将 cancellation registry 注入 routes。
- Modify: `apps/server/src/index.ts`
  - 创建并共享 cancellation registry 给 worker 和 app。
- Modify: `apps/server/src/test/server.test.ts`
  - 覆盖真实执行器集成、产物表、取消清理、筛选、套件指标。

### Web

- Modify: `apps/web/src/api/runs.ts`
  - `listRuns(projectId, filters?)` 支持状态、范围、起止时间。
  - `RunDetailResponse` 增加 artifacts。
- Modify: `apps/web/src/api/suites.ts`
  - `SuiteRow` 增加 `latest_run_status`、`latest_success_rate`。
- Modify: `apps/web/src/pages/RunListPage.tsx`
  - 增加筛选控件并传给 API。
- Modify: `apps/web/src/pages/RunListPage.test.tsx`
  - 验证筛选参数和渲染。
- Modify: `apps/web/src/pages/RunReportPage.tsx`
  - 展示 visual report、summary/result JSON、截图链接。
- Modify: `apps/web/src/pages/RunReportPage.test.tsx`
  - 验证 artifact links。
- Modify: `apps/web/src/pages/SuiteListPage.tsx`
  - 展示最近运行状态和最近通过率。
- Modify: `apps/web/src/pages/SuiteListPage.test.tsx`
  - 验证指标展示。

### Docs

- Modify: `README.md`
  - 增加 Midscene CLI 安装/环境变量/运行产物说明。

---

## Task 1: Add Midscene CLI Executor

**Files:**
- Create: `packages/midscene-runner/src/executor.ts`
- Create: `packages/midscene-runner/src/executor.test.ts`
- Modify: `packages/midscene-runner/src/index.ts`
- Modify: `packages/midscene-runner/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing executor tests**

Create `packages/midscene-runner/src/executor.test.ts`:

```ts
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runMidsceneYaml, type ProcessRunner } from './executor.js';

describe('runMidsceneYaml', () => {
  it('runs the Midscene CLI with yaml path, output dir, and summary file', async () => {
    const runProcess = vi.fn<ProcessRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    });

    const outputDir = path.resolve('tmp', 'case');
    const yamlPath = path.join(outputDir, 'midscene.yaml');

    const result = await runMidsceneYaml({
      yamlPath,
      outputDir,
      runProcess,
    });

    expect(runProcess.mock.calls?.[0]?.[0]).toMatchObject({
      command: 'midscene',
      args: [yamlPath, '--summary', 'summary.json'],
      cwd: outputDir,
    });
    expect(result).toMatchObject({
      status: 'success',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      summaryPath: 'summary.json',
    });
  });

  it('marks non-zero CLI exits as failed', async () => {
    const runProcess = vi.fn<ProcessRunner>().mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'failed',
    });

    const result = await runMidsceneYaml({
      yamlPath: '/tmp/case/midscene.yaml',
      outputDir: '/tmp/case',
      runProcess,
    });

    expect(result.status).toBe('failed');
    expect(result.stderr).toBe('failed');
  });

  it('passes AbortSignal to the process runner', async () => {
    const controller = new AbortController();
    const runProcess = vi.fn<ProcessRunner>().mockResolvedValue({
      exitCode: null,
      stdout: '',
      stderr: 'aborted',
    });

    const result = await runMidsceneYaml({
      yamlPath: '/tmp/case/midscene.yaml',
      outputDir: '/tmp/case',
      signal: controller.signal,
      runProcess,
    });

    expect(runProcess.mock.calls?.[0]?.[0]?.signal).toBe(controller.signal);
    expect(result.status).toBe('canceled');
  });
});
```

- [ ] **Step 2: Run executor tests and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/executor.test.ts
```

Expected: FAIL because `./executor.js` does not exist.

- [ ] **Step 3: Implement executor**

Create `packages/midscene-runner/src/executor.ts`:

```ts
import { spawn } from 'node:child_process';
import path from 'node:path';

export type MidsceneExecutionStatus = 'success' | 'failed' | 'canceled';

export interface RunProcessInput {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
}

export interface RunProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type ProcessRunner = (input: RunProcessInput) => Promise<RunProcessResult>;

export interface RunMidsceneYamlInput {
  yamlPath: string;
  outputDir: string;
  command?: string;
  summaryFilename?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  runProcess?: ProcessRunner;
}

export interface RunMidsceneYamlResult extends RunProcessResult {
  status: MidsceneExecutionStatus;
  summaryPath: string;
}

export async function runMidsceneYaml(input: RunMidsceneYamlInput): Promise<RunMidsceneYamlResult> {
  const summaryPath = input.summaryFilename ?? 'summary.json';
  const cwd = path.resolve(input.outputDir);
  const runProcess = input.runProcess ?? spawnProcess;
  const processResult = await runProcess({
    command: input.command ?? 'midscene',
    args: [path.resolve(input.yamlPath), '--summary', summaryPath],
    cwd,
    env: input.env,
    signal: input.signal,
  });

  return {
    ...processResult,
    summaryPath,
    status: getExecutionStatus(processResult),
  };
}

export function spawnProcess(input: RunProcessInput): Promise<RunProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      shell: process.platform === 'win32',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    input.signal?.addEventListener(
      'abort',
      () => {
        child.kill('SIGTERM');
      },
      { once: true },
    );
    child.on('error', (error) => {
      stderr += error.message;
    });
    child.on('close', (exitCode) => {
      resolve({ exitCode, stdout, stderr });
    });
  });
}

function getExecutionStatus(result: RunProcessResult): MidsceneExecutionStatus {
  if (result.exitCode === null) {
    return 'canceled';
  }
  return result.exitCode === 0 ? 'success' : 'failed';
}
```

Modify `packages/midscene-runner/src/index.ts`:

```ts
export * from './yamlGenerator.js';
export * from './executor.js';
```

Add CLI dependency in `packages/midscene-runner/package.json` after verifying package name:

```json
"dependencies": {
  "@automatic-testing/shared": "workspace:*",
  "@midscene/cli": "^0.25.0",
  "yaml": "^2.6.0"
}
```

If the latest compatible package version differs, use the version resolved by `pnpm add @midscene/cli --filter @automatic-testing/midscene-runner`.

- [ ] **Step 4: Verify the real CLI binary is available**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec midscene --help
```

Expected: command exits 0 and prints Midscene CLI help. If this fails, stop and correct the package name/bin name before continuing. Do not proceed with fake-runner-only confidence.

- [ ] **Step 5: Run executor tests and verify pass**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/executor.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run runner package verification**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner typecheck
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner test
```

Expected: both commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add packages/midscene-runner package.json pnpm-lock.yaml
git commit -m "功能：添加 Midscene CLI 执行器"
```

---

## Task 2: Parse Midscene Artifacts

**Files:**
- Create: `packages/midscene-runner/src/artifacts.ts`
- Create: `packages/midscene-runner/src/artifacts.test.ts`
- Modify: `packages/midscene-runner/src/index.ts`

- [ ] **Step 1: Write failing artifact parser tests**

Create `packages/midscene-runner/src/artifacts.test.ts`:

```ts
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectMidsceneArtifacts, parseMidsceneStepResults } from './artifacts.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('collectMidsceneArtifacts', () => {
  it('finds summary, result json, visual report, screenshots, and logs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midscene-artifacts-'));
    tempDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ pass: 1, fail: 0 }), 'utf8');
    fs.writeFileSync(path.join(dir, 'result-login.json'), JSON.stringify({ tasks: [] }), 'utf8');
    fs.writeFileSync(path.join(dir, 'visual-report.html'), '<html></html>', 'utf8');
    fs.writeFileSync(path.join(dir, 'screenshots', 'step-1.png'), 'png', 'utf8');
    fs.writeFileSync(path.join(dir, 'run.log'), 'log', 'utf8');

    const artifacts = collectMidsceneArtifacts(dir);

    expect(artifacts.map((artifact) => artifact.type)).toEqual([
      'summary_json',
      'result_json',
      'visual_report',
      'screenshot',
      'log',
    ]);
    expect(artifacts.map((artifact) => artifact.path)).toContain('visual-report.html');
  });
});

describe('parseMidsceneStepResults', () => {
  it('normalizes step status, error, raw result, and screenshot from result json', () => {
    const steps = parseMidsceneStepResults({
      tasks: [
        {
          title: '点击登录',
          type: 'aiTap',
          status: 'passed',
          screenshot: 'screenshots/step-1.png',
          output: { locate: '登录按钮' },
        },
        {
          title: '检查首页',
          type: 'aiAssert',
          status: 'failed',
          error: '找不到首页',
        },
      ],
    });

    expect(steps).toEqual([
      {
        index: 0,
        title: '点击登录',
        type: 'aiTap',
        status: 'success',
        errorMessage: null,
        screenshotPath: 'screenshots/step-1.png',
        rawResultJson: JSON.stringify({
          title: '点击登录',
          type: 'aiTap',
          status: 'passed',
          screenshot: 'screenshots/step-1.png',
          output: { locate: '登录按钮' },
        }),
      },
      {
        index: 1,
        title: '检查首页',
        type: 'aiAssert',
        status: 'failed',
        errorMessage: '找不到首页',
        screenshotPath: null,
        rawResultJson: JSON.stringify({
          title: '检查首页',
          type: 'aiAssert',
          status: 'failed',
          error: '找不到首页',
        }),
      },
    ]);
  });
});
```

- [ ] **Step 2: Run parser tests and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/artifacts.test.ts
```

Expected: FAIL because `./artifacts.js` does not exist.

- [ ] **Step 3: Implement artifact parser**

Create `packages/midscene-runner/src/artifacts.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

export type MidsceneArtifactType = 'summary_json' | 'result_json' | 'visual_report' | 'screenshot' | 'log';

export interface MidsceneArtifact {
  type: MidsceneArtifactType;
  path: string;
}

export interface MidsceneStepResult {
  index: number;
  title: string;
  type: string;
  status: 'success' | 'failed';
  errorMessage: string | null;
  screenshotPath: string | null;
  rawResultJson: string;
}

export function collectMidsceneArtifacts(outputDir: string): MidsceneArtifact[] {
  const files = walkFiles(outputDir).map((filePath) => path.relative(outputDir, filePath).replace(/\\/g, '/'));
  const artifacts: MidsceneArtifact[] = [];

  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower === 'summary.json' || lower === 'index.json') {
      artifacts.push({ type: 'summary_json', path: file });
    } else if (lower.endsWith('.json')) {
      artifacts.push({ type: 'result_json', path: file });
    } else if (lower.endsWith('.html')) {
      artifacts.push({ type: 'visual_report', path: file });
    } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      artifacts.push({ type: 'screenshot', path: file });
    } else if (lower.endsWith('.log') || lower.endsWith('.txt')) {
      artifacts.push({ type: 'log', path: file });
    }
  }

  return artifacts.sort((left, right) => artifactRank(left.type) - artifactRank(right.type));
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function artifactRank(type: MidsceneArtifactType) {
  const ranks: Record<MidsceneArtifactType, number> = {
    summary_json: 0,
    result_json: 1,
    visual_report: 2,
    screenshot: 3,
    log: 4,
  };
  return ranks[type];
}

export function parseMidsceneStepResults(result: unknown): MidsceneStepResult[] {
  const rawSteps = findStepArray(result);
  if (!rawSteps) {
    return [];
  }

  return rawSteps.map((rawStep, index) => {
    const record = isRecord(rawStep) ? rawStep : {};
    const statusText = stringValue(record.status) ?? stringValue(record.result) ?? '';
    return {
      index,
      title: stringValue(record.title) ?? stringValue(record.name) ?? `Step ${index + 1}`,
      type: stringValue(record.type) ?? stringValue(record.action) ?? 'unknown',
      status: statusText === 'failed' || statusText === 'fail' || record.error ? 'failed' : 'success',
      errorMessage: stringValue(record.error) ?? stringValue(record.errorMessage) ?? null,
      screenshotPath: stringValue(record.screenshot) ?? stringValue(record.screenshotPath) ?? null,
      rawResultJson: JSON.stringify(rawStep),
    };
  });
}

export function readJsonFile(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function findStepArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['steps', 'tasks', 'actions']) {
    const child = value[key];
    if (Array.isArray(child)) {
      return child;
    }
  }

  for (const child of Object.values(value)) {
    const nested = findStepArray(child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
```

Modify `packages/midscene-runner/src/index.ts`:

```ts
export * from './yamlGenerator.js';
export * from './executor.js';
export * from './artifacts.js';
```

- [ ] **Step 4: Run parser tests and package tests**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/artifacts.test.ts
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/midscene-runner/src
git commit -m "功能：解析 Midscene 执行产物"
```

---

## Task 3: Persist Artifacts and Expose Them in Run Detail

**Files:**
- Create: `apps/server/src/repositories/artifactsRepository.ts`
- Modify: `apps/server/src/routes/runsRoutes.ts`
- Modify: `apps/server/src/test/server.test.ts`
- Modify: `apps/web/src/api/runs.ts`

- [ ] **Step 1: Write failing server test for artifact persistence**

Add to `apps/server/src/test/server.test.ts`:

```ts
it('returns persisted run artifacts in run detail', async () => {
  const { app, db } = await createTestApp();
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

  db.prepare(
    `INSERT INTO artifacts (id, run_id, run_case_id, type, path, created_at)
     VALUES ('artifact_1', ?, NULL, 'visual_report', 'visual-report.html', '2026-06-01T00:00:00.000Z')`,
  ).run(run.id);

  const response = await app.inject({ method: 'GET', url: `/api/runs/${run.id}` });
  await app.close();

  expect(response.statusCode).toBe(200);
  expect(response.json<RunDetailResponse>().artifacts).toEqual([
    {
      id: 'artifact_1',
      run_id: run.id,
      run_case_id: null,
      type: 'visual_report',
      path: 'visual-report.html',
      created_at: '2026-06-01T00:00:00.000Z',
    },
  ]);
});
```

Extend test interface:

```ts
interface RunDetailResponse {
  run: RunResponse;
  cases: Array<{ id: string; test_case_id: string; run_order: number; status: string }>;
  steps: Array<{ id: string; run_case_id: string; step_id: string; status: string }>;
  artifacts: Array<{
    id: string;
    run_id: string;
    run_case_id: string | null;
    type: string;
    path: string;
    created_at: string;
  }>;
}
```

- [ ] **Step 2: Run server test and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "persisted run artifacts"
```

Expected: FAIL because `artifacts` is missing from run detail.

- [ ] **Step 3: Write artifact serving regression test**

Add to `apps/server/src/test/server.test.ts`:

```ts
it('serves persisted artifact files through the run-scoped endpoint', async () => {
  const artifactRoot = path.join(os.tmpdir(), `automatic-testing-artifacts-${crypto.randomUUID()}`);
  artifactPaths.push(artifactRoot);
  const { app, db } = await createTestApp({ artifactsDir: artifactRoot });
  openConnections.push(db);
  const project = await createProject(app);
  const environment = await createEnvironment(app, project.id);
  const suite = await createSuite(app, project.id);
  const testCase = await createCase(app, suite.id);
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'case', scopeId: testCase.id },
  });
  const run = createResponse.json<RunResponse>();
  const reportDir = path.join(artifactRoot, 'runs', run.id);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'visual-report.html'), '<html>report</html>', 'utf8');

  const response = await app.inject({ method: 'GET', url: `/api/runs/${run.id}/artifacts/visual-report.html` });
  const traversalResponse = await app.inject({ method: 'GET', url: `/api/runs/${run.id}/artifacts/..%2Fschema.sql` });
  await app.close();

  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toContain('text/html');
  expect(response.body).toContain('report');
  expect(traversalResponse.statusCode).toBe(404);
});
```

Expected when run before implementation: existing route may already pass. If it passes, keep it as a regression test and continue.

- [ ] **Step 4: Implement artifacts repository**

Create `apps/server/src/repositories/artifactsRepository.ts`:

```ts
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
```

- [ ] **Step 5: Return artifacts in run detail route**

Modify `apps/server/src/routes/runsRoutes.ts`:

```ts
import { createArtifactsRepository } from '../repositories/artifactsRepository.js';

const artifacts = createArtifactsRepository(db);

return {
  run,
  cases: runs.listCases(run.id),
  steps: runs.listSteps(run.id),
  artifacts: artifacts.listByRun(run.id),
};
```

- [ ] **Step 6: Update web run API types**

Modify `apps/web/src/api/runs.ts`:

```ts
export interface RunArtifactRow {
  id: string;
  run_id: string;
  run_case_id: string | null;
  type: 'midscene_yaml' | 'summary_json' | 'result_json' | 'visual_report' | 'screenshot' | 'log';
  path: string;
  created_at: string;
}

export interface RunDetailResponse {
  run: RunRow;
  cases: RunCaseRow[];
  steps: RunStepRow[];
  artifacts: RunArtifactRow[];
}
```

- [ ] **Step 7: Verify**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "persisted run artifacts"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "serves persisted artifact files"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server typecheck
npx --yes pnpm@9.15.9 --filter @automatic-testing/web typecheck
```

Expected: all commands exit 0.

- [ ] **Step 8: Commit**

```powershell
git add apps/server/src/repositories/artifactsRepository.ts apps/server/src/routes/runsRoutes.ts apps/server/src/test/server.test.ts apps/web/src/api/runs.ts
git commit -m "功能：持久化运行产物索引"
```

---

## Task 4: Integrate Real Runner into Worker

**Files:**
- Modify: `apps/server/src/worker/runWorker.ts`
- Modify: `apps/server/src/test/server.test.ts`
- Modify: `apps/server/src/repositories/runsRepository.ts`

- [ ] **Step 1: Write failing worker integration test with fake executor**

Add to `apps/server/src/test/server.test.ts`:

```ts
it('executes each run case through the runner and stores artifacts', async () => {
  const artifactRoot = path.join(os.tmpdir(), `automatic-testing-artifacts-${crypto.randomUUID()}`);
  artifactPaths.push(artifactRoot);
  const { app, db } = await createTestApp({ artifactsDir: artifactRoot });
  openConnections.push(db);
  const project = await createProject(app);
  const environment = await createEnvironment(app, project.id);
  const suite = await createSuite(app, project.id);
  const testCase = await createCase(app, suite.id);
  db.prepare<[string, string]>('UPDATE test_cases SET steps_json = ? WHERE id = ?').run(
    JSON.stringify([{ id: 'step_1', type: 'aiAssert', title: '检查首页', enabled: true, params: { prompt: '首页存在' } }]),
    testCase.id,
  );
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'case', scopeId: testCase.id },
  });
  const run = createResponse.json<RunResponse>();
  const { RunWorker } = await import('../worker/runWorker.js');
  const worker = new RunWorker({
    db,
    artifactsDir: artifactRoot,
    executeMidscene: async ({ outputDir }) => {
      fs.writeFileSync(path.join(outputDir, 'summary.json'), JSON.stringify({ pass: 1, fail: 0 }), 'utf8');
      fs.writeFileSync(
        path.join(outputDir, 'result-login.json'),
        JSON.stringify({
          tasks: [
            {
              title: '检查首页',
              type: 'aiAssert',
              status: 'failed',
              error: '首页不存在',
              screenshot: 'screenshots/step-1.png',
            },
          ],
        }),
        'utf8',
      );
      fs.writeFileSync(path.join(outputDir, 'visual-report.html'), '<html></html>', 'utf8');
      return { status: 'failed', exitCode: 1, stdout: 'done', stderr: 'assert failed', summaryPath: 'summary.json' };
    },
  });

  await worker.run({ runId: run.id });
  const detailResponse = await app.inject({ method: 'GET', url: `/api/runs/${run.id}` });
  await app.close();

  const detail = detailResponse.json<RunDetailResponse>();
  expect(detail.run.status).toBe('failed');
  expect(detail.artifacts.map((artifact) => artifact.type)).toContain('visual_report');
  expect(detail.artifacts.map((artifact) => artifact.type)).toContain('summary_json');
  expect(detail.steps).toEqual([
    expect.objectContaining({
      step_title: '检查首页',
      step_type: 'aiAssert',
      status: 'failed',
      error_message: '首页不存在',
      screenshot_path: 'cases/' + detail.cases[0]?.id + '/screenshots/step-1.png',
    }),
  ]);
  expect(detail.steps[0]?.raw_result_json).toContain('首页不存在');
});
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "executes each run case"
```

Expected: FAIL because `RunWorkerOptions.executeMidscene` is unsupported and artifacts are not stored.

- [ ] **Step 3: Add executor injection to worker**

Modify `apps/server/src/worker/runWorker.ts`:

```ts
import {
  collectMidsceneArtifacts,
  parseMidsceneStepResults,
  readJsonFile,
  runMidsceneYaml,
  type RunMidsceneYamlInput,
  type RunMidsceneYamlResult,
} from '@automatic-testing/midscene-runner';
import { createArtifactsRepository } from '../repositories/artifactsRepository.js';

export type ExecuteMidscene = (input: RunMidsceneYamlInput) => Promise<RunMidsceneYamlResult>;

export interface RunWorkerOptions {
  db: DatabaseConnection;
  artifactsDir: string;
  executeMidscene?: ExecuteMidscene;
}
```

In constructor:

```ts
private readonly artifacts: ReturnType<typeof createArtifactsRepository>;
private readonly executeMidscene: ExecuteMidscene;

constructor(private readonly options: RunWorkerOptions) {
  this.runs = createRunsRepository(options.db);
  this.artifacts = createArtifactsRepository(options.db);
  this.executeMidscene = options.executeMidscene ?? runMidsceneYaml;
}
```

Replace per-case simulated success with:

```ts
const execution = await this.executeMidscene({
  yamlPath: writeTextArtifact(artifactDir, `${caseArtifactPath}/midscene.yaml`, yaml),
  outputDir: path.join(artifactDir, caseArtifactPath),
});

writeTextArtifact(artifactDir, `${caseArtifactPath}/logs/stdout.log`, execution.stdout);
writeTextArtifact(artifactDir, `${caseArtifactPath}/logs/stderr.log`, execution.stderr);

for (const artifact of collectMidsceneArtifacts(path.join(artifactDir, caseArtifactPath))) {
  this.artifacts.create({
    runId: run.id,
    runCaseId: runCase.id,
    type: artifact.type,
    path: `${caseArtifactPath}/${artifact.path}`,
  });
}

const parsedStepCount = createStepsFromResultJsonOrDefinition(...);

if (execution.status === 'success') {
  this.runs.updateRunCase(runCase.id, { status: 'success', artifactPath: caseArtifactPath });
  passedCases += 1;
} else {
  this.runs.updateRunCase(runCase.id, { status: execution.status, errorMessage: execution.stderr || 'Midscene execution failed', artifactPath: caseArtifactPath });
  failedCases += execution.status === 'failed' ? 1 : 0;
}
```

Implement `createStepsFromResultJsonOrDefinition(...)` in `runWorker.ts`: read the first collected `result_json` file with `readJsonFile`, map it through `parseMidsceneStepResults`, and create `test_run_steps` from that data for success, failed, and canceled executions. If no parseable step result exists, fall back to the enabled platform steps with status derived from `execution.status`: only `success` executions may create `success` fallback steps; `failed` creates `failed` fallback steps; `canceled` creates `canceled` fallback steps with `error_message: 'Run canceled'` and `raw_result_json: JSON.stringify({ generated: true, status: 'canceled' })`. Prefix parsed screenshot paths with the case artifact path before storing them, e.g. `cases/{runCaseId}/screenshots/step-1.png`.

- [ ] **Step 4: Ensure run-level artifacts are still present**

When the first case writes case YAML, keep existing run-level `midscene.yaml` behavior and add artifact rows:

```ts
this.artifacts.create({ runId: run.id, type: 'midscene_yaml', path: 'midscene.yaml' });
this.artifacts.create({ runId: run.id, runCaseId: runCase.id, type: 'midscene_yaml', path: `${caseArtifactPath}/midscene.yaml` });
```

- [ ] **Step 5: Verify**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "executes each run case"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server test
```

Expected: all server tests pass.

- [ ] **Step 6: Commit**

```powershell
git add apps/server/src/worker/runWorker.ts apps/server/src/repositories/runsRepository.ts apps/server/src/test/server.test.ts
git commit -m "功能：接入真实运行执行器"
```

---

## Task 5: Add Running-Process Cancellation

**Files:**
- Modify: `packages/midscene-runner/src/executor.ts`
- Modify: `packages/midscene-runner/src/executor.test.ts`
- Create: `apps/server/src/worker/runCancellation.ts`
- Modify: `apps/server/src/worker/runWorker.ts`
- Modify: `apps/server/src/routes/runsRoutes.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/index.ts`
- Modify: `apps/server/src/test/server.test.ts`

- [ ] **Step 1: Write failing executor process-tree cancellation test**

Add to `packages/midscene-runner/src/executor.test.ts`:

```ts
it('terminates the spawned process tree when aborted', async () => {
  const killedCommands: string[] = [];
  const controller = new AbortController();
  const resultPromise = spawnProcess({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 30000)'],
    cwd: process.cwd(),
    shell: false,
    signal: controller.signal,
    killProcessTree: async (pid) => {
      killedCommands.push(String(pid));
      process.kill(pid, 'SIGTERM');
    },
  });
  controller.abort();

  const result = await Promise.race([
    resultPromise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('spawnProcess did not resolve after abort')), 2000);
    }),
  ]);

  expect(killedCommands).toHaveLength(1);
  expect(result.exitCode).toBeNull();
});

it('terminates immediately when the signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const killedCommands: string[] = [];

  const resultPromise = spawnProcess({
    command: process.execPath,
    args: ['-e', 'setTimeout(() => {}, 30000)'],
    cwd: process.cwd(),
    shell: false,
    signal: controller.signal,
    killProcessTree: async (pid) => {
      killedCommands.push(String(pid));
      process.kill(pid, 'SIGTERM');
    },
  });

  const result = await Promise.race([
    resultPromise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('spawnProcess did not resolve for an already-aborted signal')), 2000);
    }),
  ]);

  expect(killedCommands).toHaveLength(1);
  expect(result.exitCode).toBeNull();
});
```

Update `RunProcessInput` in `packages/midscene-runner/src/executor.ts` to accept `shell?: boolean` and `killProcessTree?: (pid: number) => Promise<void>`. The tests use `shell: false` with `process.execPath` so Windows does not wrap the child in `cmd.exe`; production CLI execution may keep the Windows shell default for `.cmd` binaries.

- [ ] **Step 2: Run executor cancellation test and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/executor.test.ts -t "terminates the spawned process tree"
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/executor.test.ts -t "already aborted"
```

Expected: FAIL because `killProcessTree` support is missing.

- [ ] **Step 3: Write failing cancellation registry unit test in server test**

Add a test that creates a worker with fake executor and cancels during execution:

```ts
it('aborts the active runner process when a running run is canceled', async () => {
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
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'case', scopeId: testCase.id },
  });
  const run = createResponse.json<RunResponse>();
  const { createRunCancellationRegistry } = await import('../worker/runCancellation.js');
  const { RunWorker } = await import('../worker/runWorker.js');
  const cancellation = createRunCancellationRegistry();
  let signalFromExecutor: AbortSignal | undefined;
  let resolveExecution: (() => void) | undefined;
  const worker = new RunWorker({
    db,
    artifactsDir: path.join(os.tmpdir(), `automatic-testing-artifacts-${crypto.randomUUID()}`),
    cancellation,
    executeMidscene: async ({ signal }) => {
      signalFromExecutor = signal;
      await new Promise<void>((resolve) => {
        resolveExecution = resolve;
        signal?.addEventListener('abort', resolve, { once: true });
      });
      return { status: signal?.aborted ? 'canceled' : 'success', exitCode: null, stdout: '', stderr: '', summaryPath: 'summary.json' };
    },
  });

  const running = worker.run({ runId: run.id });
  await vi.waitFor(() => expect(signalFromExecutor).toBeDefined());
  cancellation.cancel(run.id);
  resolveExecution?.();
  await running;

  expect(signalFromExecutor?.aborted).toBe(true);
  expect(db.prepare<[string], RunResponse>('SELECT * FROM test_runs WHERE id = ?').get(run.id)?.status).toBe('canceled');
  const steps = db
    .prepare<[string], { status: string }>(
      `SELECT test_run_steps.status
       FROM test_run_steps
       INNER JOIN test_run_cases ON test_run_cases.id = test_run_steps.run_case_id
       WHERE test_run_cases.run_id = ?
       ORDER BY test_run_steps.step_index ASC`,
    )
    .all(run.id);
  expect(steps.map((step) => step.status)).toEqual(['canceled', 'canceled']);
  await app.close();
});
```

- [ ] **Step 4: Add multi-case cancellation test**

Add to `apps/server/src/test/server.test.ts`:

```ts
it('marks unstarted run cases canceled when a multi-case run is canceled', async () => {
  const { app, db } = await createTestApp();
  openConnections.push(db);
  const project = await createProject(app);
  const environment = await createEnvironment(app, project.id);
  const suite = await createSuite(app, project.id);
  const firstCase = await createCase(app, suite.id);
  const secondCase = await createCase(app, suite.id);
  for (const testCase of [firstCase, secondCase]) {
    db.prepare<[string, string]>('UPDATE test_cases SET steps_json = ? WHERE id = ?').run(
      JSON.stringify([
        {
          id: `${testCase.id}_step_1`,
          type: 'aiAssert',
          title: '检查首页',
          enabled: true,
          params: { prompt: '页面展示首页' },
        },
      ]),
      testCase.id,
    );
  }
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'suite', scopeId: suite.id },
  });
  const run = createResponse.json<RunResponse>();
  const cancelResponse = await app.inject({ method: 'POST', url: `/api/runs/${run.id}/cancel` });
  const cases = db.prepare<[string], { status: string }>('SELECT status FROM test_run_cases WHERE run_id = ? ORDER BY run_order').all(run.id);
  await app.close();

  expect(cancelResponse.statusCode).toBe(200);
  expect(cases.map((runCase) => runCase.status)).toEqual(['canceled', 'canceled']);
});

it('cancels a running suite and keeps the remaining case canceled', async () => {
  const { app, db } = await createTestApp();
  openConnections.push(db);
  const project = await createProject(app);
  const environment = await createEnvironment(app, project.id);
  const suite = await createSuite(app, project.id);
  const firstCase = await createCase(app, suite.id);
  const secondCase = await createCase(app, suite.id);
  for (const testCase of [firstCase, secondCase]) {
    db.prepare<[string, string]>('UPDATE test_cases SET steps_json = ? WHERE id = ?').run(
      JSON.stringify([
        {
          id: `${testCase.id}_step_1`,
          type: 'aiAssert',
          title: '检查首页',
          enabled: true,
          params: { prompt: '页面展示首页' },
        },
      ]),
      testCase.id,
    );
  }
  const createResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'suite', scopeId: suite.id },
  });
  const run = createResponse.json<RunResponse>();
  const { createRunCancellationRegistry } = await import('../worker/runCancellation.js');
  const { RunWorker } = await import('../worker/runWorker.js');
  const cancellation = createRunCancellationRegistry();
  let signalFromExecutor: AbortSignal | undefined;
  const worker = new RunWorker({
    db,
    artifactsDir: path.join(os.tmpdir(), `automatic-testing-artifacts-${crypto.randomUUID()}`),
    cancellation,
    executeMidscene: async ({ signal }) => {
      signalFromExecutor = signal;
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', resolve, { once: true });
      });
      return { status: 'canceled', exitCode: null, stdout: '', stderr: '', summaryPath: 'summary.json' };
    },
  });

  const running = worker.run({ runId: run.id });
  await vi.waitFor(() => expect(signalFromExecutor).toBeDefined());
  cancellation.cancel(run.id);
  await running;

  const cases = db.prepare<[string], { status: string }>('SELECT status FROM test_run_cases WHERE run_id = ? ORDER BY run_order').all(run.id);
  const steps = db
    .prepare<[string], { status: string }>(
      `SELECT test_run_steps.status
       FROM test_run_steps
       INNER JOIN test_run_cases ON test_run_cases.id = test_run_steps.run_case_id
       WHERE test_run_cases.run_id = ?
       ORDER BY test_run_cases.run_order ASC, test_run_steps.step_index ASC`,
    )
    .all(run.id);

  expect(cases.map((runCase) => runCase.status)).toEqual(['canceled', 'canceled']);
  expect(steps.map((step) => step.status)).toEqual(['canceled', 'canceled']);
  await app.close();
});
```

- [ ] **Step 5: Run server cancellation tests and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "aborts the active runner"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "multi-case run is canceled"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "cancels a running suite"
```

Expected: FAIL because registry does not exist.

- [ ] **Step 6: Implement robust process-tree termination**

Modify `packages/midscene-runner/src/executor.ts`:

```ts
export interface RunProcessInput {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  signal?: AbortSignal;
  killProcessTree?: (pid: number) => Promise<void>;
}

async function defaultKillProcessTree(pid: number) {
  if (process.platform === 'win32') {
    await spawnProcess({ command: 'taskkill', args: ['/pid', String(pid), '/T', '/F'], cwd: process.cwd() });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    process.kill(pid, 'SIGTERM');
  }
}
```

In `spawnProcess`, create a detached process group outside Windows and abort via `killProcessTree`:

```ts
const child = spawn(input.command, input.args, {
  cwd: input.cwd,
  env: { ...process.env, ...input.env },
  shell: input.shell ?? (process.platform === 'win32'),
  detached: process.platform !== 'win32',
  windowsHide: true,
});
let aborted = false;
const abortListener = () => {
  aborted = true;
  if (child.pid) {
    void (input.killProcessTree ?? defaultKillProcessTree)(child.pid);
  }
};
if (input.signal?.aborted) {
  abortListener();
} else {
  input.signal?.addEventListener('abort', abortListener, { once: true });
}
child.on('close', (exitCode) => {
  input.signal?.removeEventListener('abort', abortListener);
  resolve({ exitCode: aborted ? null : exitCode, stdout, stderr });
});
```

If `taskkill` fails in tests, do not make tests depend on the OS command; use injected `killProcessTree`.

- [ ] **Step 7: Implement cancellation registry**

Create `apps/server/src/worker/runCancellation.ts`:

```ts
export interface RunCancellationRegistry {
  register(runId: string): AbortController;
  cancel(runId: string): boolean;
  unregister(runId: string): void;
}

export function createRunCancellationRegistry(): RunCancellationRegistry {
  const controllers = new Map<string, AbortController>();

  return {
    register(runId: string) {
      const controller = new AbortController();
      controllers.set(runId, controller);
      return controller;
    },
    cancel(runId: string) {
      const controller = controllers.get(runId);
      if (!controller) {
        return false;
      }
      controller.abort();
      return true;
    },
    unregister(runId: string) {
      controllers.delete(runId);
    },
  };
}
```

- [ ] **Step 8: Wire registry into worker**

Modify `RunWorkerOptions`:

```ts
import type { RunCancellationRegistry } from './runCancellation.js';

export interface RunWorkerOptions {
  db: DatabaseConnection;
  artifactsDir: string;
  executeMidscene?: ExecuteMidscene;
  cancellation?: RunCancellationRegistry;
}
```

For each run:

```ts
const controller = this.options.cancellation?.register(job.runId) ?? new AbortController();
try {
  // pass controller.signal to executeMidscene
} finally {
  this.options.cancellation?.unregister(job.runId);
}
```

Update the per-case execution branch so canceled executions never create successful fallback steps:

```ts
createStepsFromResultJsonOrDefinition({
  runCaseId: runCase.id,
  testCase: mappedTestCase,
  collectedArtifacts,
  caseArtifactPath,
  fallbackStatus: execution.status,
});

if (execution.status === 'canceled') {
  this.runs.updateRunCase(runCase.id, {
    status: 'canceled',
    errorMessage: 'Run canceled',
    artifactPath: caseArtifactPath,
  });
  markRemainingCasesAndStepsCanceled(runCases.slice(index + 1));
  this.runs.updateStatus(job.runId, 'canceled');
  emitRunEvent({ runId: job.runId, type: 'status', payload: { status: 'canceled' } });
  return;
}
```

Add a local helper in `runWorker.ts` for unstarted cases. It should load each case's enabled steps and create `test_run_steps` with `status: 'canceled'`, `started_at` and `finished_at` set to the same timestamp, `duration_ms: 0`, `error_message: 'Run canceled'`, `screenshot_path: null`, and `raw_result_json: JSON.stringify({ generated: true, status: 'canceled' })`. If a current case already has parsed steps, do not duplicate them; only fill missing enabled steps as canceled. This keeps report detail consistent: a canceled run must not show successful fallback steps.

- [ ] **Step 9: Wire registry into routes**

Modify `apps/server/src/app.ts`:

```ts
import type { RunCancellationRegistry } from './worker/runCancellation.js';

export interface BuildAppOptions {
  db: DatabaseConnection;
  runQueue?: RunQueuePort;
  artifactsDir?: string;
  cancellation?: RunCancellationRegistry;
}
```

Modify `registerRunsRoutes` signature to accept registry and call it:

```ts
queue.cancel?.(run.id);
cancellation?.cancel(run.id);
const canceledRun = runs.cancel(run.id);
```

Modify `apps/server/src/index.ts`:

```ts
const cancellation = createRunCancellationRegistry();
const worker = new RunWorker({ db, artifactsDir: config.artifactsDir, cancellation });
const app = await buildApp({ db, runQueue, artifactsDir: config.artifactsDir, cancellation });
```

- [ ] **Step 10: Verify**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/executor.test.ts -t "terminates the spawned process tree"
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner exec vitest run src/executor.test.ts -t "already aborted"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "aborts the active runner"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "multi-case run is canceled"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "cancels a running suite"
npx --yes pnpm@9.15.9 --filter @automatic-testing/midscene-runner test
npx --yes pnpm@9.15.9 --filter @automatic-testing/server test
```

Expected: all server tests pass.

- [ ] **Step 11: Commit**

```powershell
git add packages/midscene-runner/src/executor.ts packages/midscene-runner/src/executor.test.ts apps/server/src/worker/runCancellation.ts apps/server/src/worker/runWorker.ts apps/server/src/routes/runsRoutes.ts apps/server/src/app.ts apps/server/src/index.ts apps/server/src/test/server.test.ts
git commit -m "功能：取消运行时终止执行进程"
```

---

## Task 6: Improve Report Artifact Display

**Files:**
- Modify: `apps/web/src/pages/RunReportPage.tsx`
- Modify: `apps/web/src/pages/RunReportPage.test.tsx`
- Modify: `apps/web/src/api/runs.ts`

- [ ] **Step 1: Write failing report UI test**

Add to `apps/web/src/pages/RunReportPage.test.tsx`:

```ts
it('renders visual report and structured artifact links', async () => {
  mockedGetRun.mockResolvedValue(
    createRunDetail({
      artifacts: [
        createArtifactRow({ type: 'visual_report', path: 'cases/run_case_1/visual-report.html' }),
        createArtifactRow({ type: 'summary_json', path: 'cases/run_case_1/summary.json' }),
        createArtifactRow({ type: 'result_json', path: 'cases/run_case_1/result-login.json' }),
      ],
    }),
  );

  renderRunReportPage();

  expect(await screen.findByRole('link', { name: '可视化报告' })).toHaveAttribute(
    'href',
    '/api/runs/run_1/artifacts/cases/run_case_1/visual-report.html',
  );
  expect(screen.getByRole('link', { name: 'Summary JSON' })).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Result JSON' })).toBeTruthy();
});
```

Ensure existing test helper accepts `artifacts`:

```ts
function createArtifactRow(overrides: Partial<RunArtifactRow> = {}): RunArtifactRow {
  return {
    id: 'artifact_1',
    run_id: 'run_1',
    run_case_id: null,
    type: 'visual_report',
    path: 'visual-report.html',
    created_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}
```

- [ ] **Step 2: Run test and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/web exec vitest run src/pages/RunReportPage.test.tsx -t "visual report"
```

Expected: FAIL because links are not rendered.

- [ ] **Step 3: Render artifact links**

Modify `apps/web/src/pages/RunReportPage.tsx`:

```tsx
function renderArtifactGallery(runId: string, artifacts: RunArtifactRow[]) {
  if (!artifacts?.length || !runId) {
    return <Typography.Text type="secondary">暂无产物</Typography.Text>;
  }

  const labels: Record<RunArtifactRow['type'], string> = {
    midscene_yaml: '运行 YAML',
    summary_json: 'Summary JSON',
    result_json: 'Result JSON',
    visual_report: '可视化报告',
    screenshot: '截图',
    log: '日志',
  };

  return (
    <Space wrap>
      {artifacts.map((artifact) => (
        <Typography.Link key={artifact.id} href={getRunArtifactUrl(runId, artifact.path)} target="_blank" rel="noreferrer">
          {labels[artifact.type] ?? artifact.type}
        </Typography.Link>
      ))}
    </Space>
  );
}
```

Replace current static artifact links in logs tab with:

```tsx
{renderArtifactGallery(runArtifactId, runQuery.data?.artifacts ?? [])}
```

- [ ] **Step 4: Verify**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/web exec vitest run src/pages/RunReportPage.test.tsx
npx --yes pnpm@9.15.9 --filter @automatic-testing/web typecheck
rg -n "Midscene" apps\web\src apps\web\index.html apps\web\dist
```

Expected: vitest/typecheck PASS. `rg` should exit 1 with no output; if it finds frontend page or dist wording, replace display text before committing.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/api/runs.ts apps/web/src/pages/RunReportPage.tsx apps/web/src/pages/RunReportPage.test.tsx
git commit -m "功能：完善报告产物入口"
```

---

## Task 7: Add Run History Filters

**Files:**
- Modify: `apps/server/src/repositories/runsRepository.ts`
- Modify: `apps/server/src/routes/runsRoutes.ts`
- Modify: `apps/server/src/test/server.test.ts`
- Modify: `apps/web/src/api/runs.ts`
- Modify: `apps/web/src/pages/RunListPage.tsx`
- Modify: `apps/web/src/pages/RunListPage.test.tsx`

- [ ] **Step 1: Write failing server filter test**

Add to `apps/server/src/test/server.test.ts`:

```ts
it('filters project runs by status and scope type', async () => {
  const { app, db } = await createTestApp();
  openConnections.push(db);
  const project = await createProject(app);
  const environment = await createEnvironment(app, project.id);
  const suite = await createSuite(app, project.id);
  const testCase = await createCase(app, suite.id);
  await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'case', scopeId: testCase.id },
  });
  const suiteRunResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'suite', scopeId: suite.id },
  });
  const suiteRun = suiteRunResponse.json<RunResponse>();
  db.prepare<[string, string]>('UPDATE test_runs SET status = ? WHERE id = ?').run('success', suiteRun.id);

  const response = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/runs?status=success&scopeType=suite`,
  });
  await app.close();

  expect(response.statusCode).toBe(200);
  expect(response.json<RunResponse[]>()).toEqual([expect.objectContaining({ id: suiteRun.id })]);
});

it('filters project runs by created time range', async () => {
  const { app, db } = await createTestApp();
  openConnections.push(db);
  const project = await createProject(app);
  const environment = await createEnvironment(app, project.id);
  const suite = await createSuite(app, project.id);
  const testCase = await createCase(app, suite.id);
  const oldRunResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'case', scopeId: testCase.id },
  });
  const newRunResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'case', scopeId: testCase.id },
  });
  const oldRun = oldRunResponse.json<RunResponse>();
  const newRun = newRunResponse.json<RunResponse>();
  db.prepare<[string, string]>('UPDATE test_runs SET created_at = ? WHERE id = ?').run('2026-05-01T00:00:00.000Z', oldRun.id);
  db.prepare<[string, string]>('UPDATE test_runs SET created_at = ? WHERE id = ?').run('2026-06-01T00:00:00.000Z', newRun.id);

  const response = await app.inject({
    method: 'GET',
    url: `/api/projects/${project.id}/runs?createdFrom=2026-06-01T00:00:00.000Z&createdTo=2026-06-30T23:59:59.999Z`,
  });
  await app.close();

  expect(response.statusCode).toBe(200);
  expect(response.json<RunResponse[]>()).toEqual([expect.objectContaining({ id: newRun.id })]);
});
```

- [ ] **Step 2: Run server filter test and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "filters project runs"
```

Expected: FAIL because filters are ignored.

- [ ] **Step 3: Implement repository filtering**

Modify `apps/server/src/repositories/runsRepository.ts`:

```ts
export interface ListRunsFilter {
  status?: string;
  scopeType?: string;
  createdFrom?: string;
  createdTo?: string;
}

listByProject(projectId: string, filter: ListRunsFilter = {}): RunRow[] {
  const clauses = ['project_id = ?'];
  const params: string[] = [projectId];

  if (filter.status) {
    clauses.push('status = ?');
    params.push(filter.status);
  }
  if (filter.scopeType) {
    clauses.push('scope_type = ?');
    params.push(filter.scopeType);
  }
  if (filter.createdFrom) {
    clauses.push('created_at >= ?');
    params.push(filter.createdFrom);
  }
  if (filter.createdTo) {
    clauses.push('created_at <= ?');
    params.push(filter.createdTo);
  }

  return db.prepare<string[], RunRow>(`SELECT * FROM test_runs WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`).all(...params);
}
```

- [ ] **Step 4: Parse query in route**

Modify `apps/server/src/routes/runsRoutes.ts`:

```ts
const listRunsQuerySchema = z.object({
  status: runStatusSchema.optional(),
  scopeType: runScopeTypeSchema.optional(),
  createdFrom: z.string().optional(),
  createdTo: z.string().optional(),
});

app.get<{ Params: { projectId: string }; Querystring: unknown }>('/api/projects/:projectId/runs', async (request, reply) => {
  const query = listRunsQuerySchema.safeParse(request.query);
  if (!query.success) {
    return reply.code(400).send({ message: 'Invalid run filters' });
  }
  return runs.listByProject(request.params.projectId, query.data);
});
```

- [ ] **Step 5: Write failing web filter test**

Add to `apps/web/src/pages/RunListPage.test.tsx`:

```ts
it('filters runs by status and scope type', async () => {
  mockedListRuns.mockResolvedValue([]);
  renderRunListPage();

  await userEvent.click(await screen.findByLabelText('状态筛选'));
  await userEvent.click(await screen.findByTitle('成功'));
  await userEvent.click(screen.getByLabelText('范围筛选'));
  await userEvent.click(await screen.findByTitle('套件'));

  await waitFor(() => {
    expect(mockedListRuns).toHaveBeenLastCalledWith('project_1', {
      status: 'success',
      scopeType: 'suite',
    });
  });
});

it('filters runs by created time range', async () => {
  mockedListRuns.mockResolvedValue([]);
  renderRunListPage();

  await userEvent.click(await screen.findByLabelText('创建时间筛选'));
  await userEvent.click(await screen.findByText('1'));
  await userEvent.click(await screen.findByText('30'));

  await waitFor(() => {
    expect(mockedListRuns.mock.calls.at(-1)?.[1]).toMatchObject({
      createdFrom: expect.stringContaining('T00:00:00'),
      createdTo: expect.stringContaining('T23:59:59'),
    });
  });
});
```

- [ ] **Step 6: Implement web filters**

Modify `apps/web/src/api/runs.ts`:

```ts
export interface ListRunsFilter {
  status?: RunStatus;
  scopeType?: RunScopeType;
  createdFrom?: string;
  createdTo?: string;
}

export function listRuns(projectId: string, filter: ListRunsFilter = {}) {
  const searchParams = new URLSearchParams();
  if (filter.status) searchParams.set('status', filter.status);
  if (filter.scopeType) searchParams.set('scopeType', filter.scopeType);
  if (filter.createdFrom) searchParams.set('createdFrom', filter.createdFrom);
  if (filter.createdTo) searchParams.set('createdTo', filter.createdTo);
  const query = searchParams.toString();
  return apiGet<RunRow[]>(`/api/projects/${projectId}/runs${query ? `?${query}` : ''}`);
}
```

Modify `apps/web/src/pages/RunListPage.tsx`:

```tsx
import type { Dayjs } from 'dayjs';
import { Button, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';

const [statusFilter, setStatusFilter] = useState<RunStatus | undefined>();
const [scopeTypeFilter, setScopeTypeFilter] = useState<RunScopeType | undefined>();
const [createdRange, setCreatedRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
const filters = useMemo(
  () => ({
    status: statusFilter,
    scopeType: scopeTypeFilter,
    createdFrom: createdRange?.[0]?.startOf('day').toISOString(),
    createdTo: createdRange?.[1]?.endOf('day').toISOString(),
  }),
  [createdRange, scopeTypeFilter, statusFilter],
);
const { data = [], isLoading } = useQuery({
  queryKey: ['runs', projectId, filters],
  queryFn: () => listRuns(projectId ?? '', filters),
  enabled: Boolean(projectId),
});
```

Add controls above table:

```tsx
<Space>
  <Select
    allowClear
    aria-label="状态筛选"
    placeholder="状态"
    value={statusFilter}
    onChange={setStatusFilter}
    options={[
      { label: '排队中', value: 'pending' },
      { label: '运行中', value: 'running' },
      { label: '成功', value: 'success' },
      { label: '失败', value: 'failed' },
      { label: '已取消', value: 'canceled' },
    ]}
    style={{ width: 140 }}
  />
  <Select
    allowClear
    aria-label="范围筛选"
    placeholder="范围"
    value={scopeTypeFilter}
    onChange={setScopeTypeFilter}
    options={[
      { label: '用例', value: 'case' },
      { label: '套件', value: 'suite' },
      { label: '选中用例', value: 'selection' },
    ]}
    style={{ width: 140 }}
  />
  <DatePicker.RangePicker
    aria-label="创建时间筛选"
    value={createdRange}
    onChange={setCreatedRange}
  />
</Space>
```

- [ ] **Step 7: Verify**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "filters project runs"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "created time range"
npx --yes pnpm@9.15.9 --filter @automatic-testing/web exec vitest run src/pages/RunListPage.test.tsx -t "filters runs"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server typecheck
npx --yes pnpm@9.15.9 --filter @automatic-testing/web typecheck
rg -n "Midscene" apps\web\src apps\web\index.html apps\web\dist
```

Expected: test/typecheck commands exit 0. `rg` exits 1 with no output.

- [ ] **Step 8: Commit**

```powershell
git add apps/server/src/repositories/runsRepository.ts apps/server/src/routes/runsRoutes.ts apps/server/src/test/server.test.ts apps/web/src/api/runs.ts apps/web/src/pages/RunListPage.tsx apps/web/src/pages/RunListPage.test.tsx
git commit -m "功能：添加运行历史筛选"
```

---

## Task 8: Add Suite Run Metrics

**Files:**
- Modify: `apps/server/src/repositories/suitesRepository.ts`
- Modify: `apps/server/src/test/server.test.ts`
- Modify: `apps/web/src/api/suites.ts`
- Modify: `apps/web/src/pages/SuiteListPage.tsx`
- Modify: `apps/web/src/pages/SuiteListPage.test.tsx`

- [ ] **Step 1: Write failing server suite metric test**

Add to `apps/server/src/test/server.test.ts`:

```ts
it('lists suites with latest run status and success rate', async () => {
  const { app, db } = await createTestApp();
  openConnections.push(db);
  const project = await createProject(app);
  const environment = await createEnvironment(app, project.id);
  const suite = await createSuite(app, project.id);
  await createCase(app, suite.id);
  const runResponse = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { projectId: project.id, environmentId: environment.id, scopeType: 'suite', scopeId: suite.id },
  });
  const run = runResponse.json<RunResponse>();
  db.prepare<[string, number, number, string]>('UPDATE test_runs SET status = ?, passed_cases = ?, failed_cases = ? WHERE id = ?').run(
    'failed',
    1,
    1,
    run.id,
  );

  const response = await app.inject({ method: 'GET', url: `/api/projects/${project.id}/suites` });
  await app.close();

  expect(response.statusCode).toBe(200);
  expect(response.json<SuiteRowForTest[]>()).toEqual([
    expect.objectContaining({
      id: suite.id,
      latest_run_status: 'failed',
      latest_success_rate: 50,
    }),
  ]);
});
```

- [ ] **Step 2: Run server test and verify failure**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "latest run status"
```

Expected: FAIL because fields are missing.

- [ ] **Step 3: Implement suite query metrics**

Modify `apps/server/src/repositories/suitesRepository.ts`:

```ts
export interface SuiteRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  case_count?: number;
  latest_run_status?: string | null;
  latest_success_rate?: number | null;
}
```

Update `listByProject` SQL:

```sql
SELECT test_suites.*,
       COUNT(test_cases.id) AS case_count,
       latest_runs.status AS latest_run_status,
       CASE
         WHEN latest_runs.total_cases > 0 THEN ROUND(CAST(latest_runs.passed_cases AS REAL) / latest_runs.total_cases * 100)
         ELSE NULL
       END AS latest_success_rate
FROM test_suites
LEFT JOIN test_cases ON test_cases.suite_id = test_suites.id
LEFT JOIN test_runs latest_runs
  ON latest_runs.id = (
    SELECT id
    FROM test_runs
    WHERE scope_type = 'suite' AND scope_id = test_suites.id
    ORDER BY created_at DESC
    LIMIT 1
  )
WHERE test_suites.project_id = ?
GROUP BY test_suites.id
ORDER BY test_suites.updated_at DESC
```

- [ ] **Step 4: Write failing web suite metric test**

Add to `apps/web/src/pages/SuiteListPage.test.tsx`:

```ts
it('renders latest run status and success rate', async () => {
  mockedListSuites.mockResolvedValue([
    createSuiteRow({
      name: '冒烟测试',
      latest_run_status: 'failed',
      latest_success_rate: 50,
    }),
  ]);

  renderSuiteListPage();

  expect(await screen.findByText('失败')).toBeTruthy();
  expect(screen.getByText('50%')).toBeTruthy();
});
```

- [ ] **Step 5: Implement web display**

Modify `apps/web/src/api/suites.ts`:

```ts
latest_run_status?: RunStatus | null;
latest_success_rate?: number | null;
```

Modify `apps/web/src/pages/SuiteListPage.tsx` columns:

```tsx
{
  title: '最近运行',
  dataIndex: 'latest_run_status',
  render: (status: SuiteRow['latest_run_status']) => (status ? renderRunStatusTag(status) : '-'),
},
{
  title: '最近通过率',
  dataIndex: 'latest_success_rate',
  render: (value: number | null | undefined) => (typeof value === 'number' ? `${value}%` : '-'),
},
```

- [ ] **Step 6: Verify**

Run:

```powershell
npx --yes pnpm@9.15.9 --filter @automatic-testing/server exec vitest run src/test/server.test.ts -t "latest run status"
npx --yes pnpm@9.15.9 --filter @automatic-testing/web exec vitest run src/pages/SuiteListPage.test.tsx -t "latest run status"
npx --yes pnpm@9.15.9 --filter @automatic-testing/server typecheck
npx --yes pnpm@9.15.9 --filter @automatic-testing/web typecheck
rg -n "Midscene" apps\web\src apps\web\index.html apps\web\dist
```

Expected: test/typecheck commands exit 0. `rg` exits 1 with no output.

- [ ] **Step 7: Commit**

```powershell
git add apps/server/src/repositories/suitesRepository.ts apps/server/src/test/server.test.ts apps/web/src/api/suites.ts apps/web/src/pages/SuiteListPage.tsx apps/web/src/pages/SuiteListPage.test.tsx
git commit -m "功能：补充套件运行指标"
```

---

## Task 9: Update Documentation and Final Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README with runner setup**

Add:

```md
## Midscene 执行配置

平台通过 Midscene CLI 执行生成的 YAML。运行前需要配置模型环境变量：

```bash
MIDSCENE_MODEL_BASE_URL=...
MIDSCENE_MODEL_API_KEY=...
MIDSCENE_MODEL_NAME=...
MIDSCENE_MODEL_FAMILY=...
```

本地运行时确认 CLI 可用：

```bash
pnpm --filter @automatic-testing/midscene-runner exec midscene --help
```

执行产物会写入后端 `ARTIFACTS_DIR`，默认是仓库根目录下的 `artifacts/runs/{runId}`。
```

- [ ] **Step 2: Run complete verification**

Run:

```powershell
npx --yes pnpm@9.15.9 typecheck
npx --yes pnpm@9.15.9 test
npx --yes pnpm@9.15.9 build
git diff --check
rg -n "Midscene" apps\web\src apps\web\index.html apps\web\dist
```

Expected:

- `typecheck`, `test`, `build`, and `git diff --check` exit 0.
- `rg -n "Midscene" ...` exits 1 with no output. That means frontend page source and dist do not contain the forbidden product wording.
- Vite chunk-size warning is acceptable if build exits 0.

- [ ] **Step 3: Commit docs**

```powershell
git add README.md
git commit -m "文档：补充执行器配置说明"
```

- [ ] **Step 4: Report remaining deferred items**

After this plan completes, remaining deferred items should be explicitly reported as out of current scope:

- 项目概览动态化：用户已明确不需要。
- 定时任务。
- CI API。
- 登录和角色权限。
- 密钥与变量管理页面。
- 分布式 Worker。
- 多执行器 UI。

---

## Task Execution Notes

- 每个任务结束都执行提交步骤，按用户在本线程中明确要求“每个任务末尾执行提交步骤，先不管 AGENTS”处理。
- 不修改与当前任务无关的代码。
- 测试遵循 TDD：先写失败测试，再实现，再跑目标测试和相关完整测试。
- 前端页面和 `apps/web/dist` 不允许出现 `Midscene` 字样，最终验证必须运行 `rg`。
- 不要把本地 `apps/server/artifacts` 产物提交到 git。
- 如果真实 Midscene CLI 安装或命令参数与官方文档不一致，停止并更新 Task 1 的执行器计划，不要硬编码猜测。
