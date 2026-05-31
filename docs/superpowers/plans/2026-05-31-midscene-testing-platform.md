# Midscene 测试平台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建一个基于 Midscene.js 的团队级 Web UI 自动化测试平台，包含 Vite + React + Ant Design v6 前端、Node.js 后端、共享 schema、Midscene YAML 生成与队列化执行闭环。

**Architecture:** 使用 pnpm workspace monorepo，`apps/web` 负责后台管理系统式前端，`apps/server` 负责 REST API、SSE、队列和 Worker，`packages/shared` 提供共享类型与 Zod schema，`packages/midscene-runner` 负责平台 DSL 到 Midscene YAML 的转换、执行封装和产物解析。首版使用 SQLite 作为本地开发数据库以降低启动成本，数据访问层保持 repository 边界，后续可迁移 PostgreSQL。

**Tech Stack:** pnpm workspace, TypeScript, Vite, React, Ant Design v6, React Router, React Query, Zustand, Monaco Editor, React Hook Form, Zod, Node.js, Fastify, better-sqlite3, Vitest, tsx, yaml.

---

## 文件结构

```text
automatic-testing/
  apps/
    web/
      index.html
      package.json
      tsconfig.json
      vite.config.ts
      src/
        main.tsx
        App.tsx
        api/client.ts
        api/projects.ts
        components/AppLayout.tsx
        pages/ProjectListPage.tsx
        pages/ProjectOverviewPage.tsx
        pages/EnvironmentPage.tsx
        pages/SuiteListPage.tsx
        pages/SuiteDetailPage.tsx
        pages/CaseEditorPage.tsx
        pages/RunListPage.tsx
        pages/RunReportPage.tsx
        stores/caseEditorStore.ts
        styles.css
    server/
      package.json
      tsconfig.json
      src/
        index.ts
        app.ts
        config.ts
        db/schema.sql
        db/database.ts
        repositories/projectsRepository.ts
        repositories/environmentsRepository.ts
        repositories/suitesRepository.ts
        repositories/casesRepository.ts
        repositories/runsRepository.ts
        routes/projectsRoutes.ts
        routes/environmentsRoutes.ts
        routes/suitesRoutes.ts
        routes/casesRoutes.ts
        routes/runsRoutes.ts
        queue/runQueue.ts
        worker/runWorker.ts
        events/runEvents.ts
        artifacts/artifacts.ts
        tests/api.test.ts
  packages/
    shared/
      package.json
      tsconfig.json
      src/
        index.ts
        schemas.ts
        types.ts
    midscene-runner/
      package.json
      tsconfig.json
      src/
        index.ts
        yamlGenerator.ts
        executor.ts
        artifacts.ts
        yamlGenerator.test.ts
  docs/
    superpowers/
      specs/2026-05-31-midscene-testing-platform-design.md
      plans/2026-05-31-midscene-testing-platform.md
  .gitignore
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
```

## Task 1: 初始化 pnpm workspace

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`

- [ ] **Step 1: 创建 workspace 配置**

Create `package.json`:

```json
{
  "name": "automatic-testing",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "pnpm --parallel --filter @automatic-testing/server --filter @automatic-testing/web dev",
    "build": "pnpm -r build",
    "test": "pnpm -r test",
    "typecheck": "pnpm -r typecheck"
  },
  "devDependencies": {
    "@types/node": "^20.12.12",
    "typescript": "^5.6.3",
    "vitest": "^2.1.1"
  }
}
```

Create `pnpm-workspace.yaml`:

```yaml
packages:
  - apps/*
  - packages/*
```

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": {
      "@automatic-testing/shared": ["packages/shared/src/index.ts"],
      "@automatic-testing/midscene-runner": ["packages/midscene-runner/src/index.ts"]
    }
  }
}
```

Create `.gitignore`:

```gitignore
node_modules/
dist/
.env
.env.*
artifacts/
data/
*.log
.DS_Store
```

- [ ] **Step 2: 安装根依赖**

Run:

```bash
pnpm install
```

Expected: lockfile is created and install exits with code 0.

- [ ] **Step 3: 验证 workspace 命令可运行**

Run:

```bash
pnpm -r typecheck
```

Expected: command exits with code 0 or reports no projects yet.

- [ ] **Step 4: 提交**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore pnpm-lock.yaml
git commit -m "构建：初始化工作区"
```

## Task 2: 创建 shared 包和测试定义 schema

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: 创建 shared 包配置**

Create `packages/shared/package.json`:

```json
{
  "name": "@automatic-testing/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.1"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "module": "ESNext"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: 定义共享类型**

Create `packages/shared/src/types.ts`:

```ts
import type { z } from 'zod';
import type {
  browserTypeSchema,
  environmentSchema,
  runStatusSchema,
  stepSchema,
  testCaseSchema,
  testSuiteSchema,
  projectSchema,
} from './schemas';

export type BrowserType = z.infer<typeof browserTypeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type TestSuite = z.infer<typeof testSuiteSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type Step = z.infer<typeof stepSchema>;
```

- [ ] **Step 3: 定义 Zod schema**

Create `packages/shared/src/schemas.ts`:

```ts
import { z } from 'zod';

export const browserTypeSchema = z.enum(['chromium', 'firefox', 'webkit']);
export const runStatusSchema = z.enum(['pending', 'running', 'success', 'failed', 'canceled']);
export const runScopeTypeSchema = z.enum(['case', 'suite', 'selection']);

export const idSchema = z.string().min(1);

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().optional().default(''),
  defaultEnvironmentId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const environmentSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  baseUrl: z.string().url(),
  browserType: browserTypeSchema,
  viewportWidth: z.number().int().positive(),
  viewportHeight: z.number().int().positive(),
  defaultTimeoutMs: z.number().int().positive(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const testSuiteSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  description: z.string().optional().default(''),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const stepSchema = z.object({
  id: idSchema,
  type: z.string().min(1),
  title: z.string().min(1),
  enabled: z.boolean().default(true),
  params: z.record(z.unknown()).default({}),
  timeoutMs: z.number().int().positive().optional(),
});

export const testCaseSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  suiteId: idSchema,
  name: z.string().min(1),
  description: z.string().optional().default(''),
  enabled: z.boolean(),
  tags: z.array(z.string()).default([]),
  steps: z.array(stepSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRunSchema = z.object({
  projectId: idSchema,
  environmentId: idSchema,
  scopeType: runScopeTypeSchema,
  scopeId: idSchema.optional(),
  caseIds: z.array(idSchema).optional(),
});
```

- [ ] **Step 4: 导出 shared API**

Create `packages/shared/src/index.ts`:

```ts
export * from './schemas';
export * from './types';
```

- [ ] **Step 5: 验证 shared 包**

Run:

```bash
pnpm --filter @automatic-testing/shared typecheck
```

Expected: exits with code 0.

- [ ] **Step 6: 提交**

```bash
git add packages/shared
git commit -m "功能：添加共享数据模型"
```

## Task 3: 创建 midscene-runner YAML 生成器

**Files:**
- Create: `packages/midscene-runner/package.json`
- Create: `packages/midscene-runner/tsconfig.json`
- Create: `packages/midscene-runner/src/yamlGenerator.ts`
- Create: `packages/midscene-runner/src/index.ts`
- Create: `packages/midscene-runner/src/yamlGenerator.test.ts`

- [ ] **Step 1: 创建 runner 包配置**

Create `packages/midscene-runner/package.json`:

```json
{
  "name": "@automatic-testing/midscene-runner",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@automatic-testing/shared": "workspace:*",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "vitest": "^2.1.1"
  }
}
```

Create `packages/midscene-runner/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "module": "ESNext"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: 先写 YAML 生成测试**

Create `packages/midscene-runner/src/yamlGenerator.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { generateMidsceneYaml } from './yamlGenerator';
import type { Environment, TestCase } from '@automatic-testing/shared';

const environment: Environment = {
  id: 'env_1',
  projectId: 'project_1',
  name: '测试环境',
  baseUrl: 'https://example.com',
  browserType: 'chromium',
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultTimeoutMs: 10000,
  isDefault: true,
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
};

const testCase: TestCase = {
  id: 'case_1',
  projectId: 'project_1',
  suiteId: 'suite_1',
  name: '登录成功',
  description: '',
  enabled: true,
  tags: ['smoke'],
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
  steps: [
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
    {
      id: 'step_3',
      type: 'native',
      title: '悬停头像',
      enabled: true,
      params: { action: 'aiHover', locate: '用户头像' },
    },
  ],
};

describe('generateMidsceneYaml', () => {
  it('converts platform and native steps to Midscene YAML', () => {
    const yaml = generateMidsceneYaml({ environment, testCase });

    expect(yaml).toContain('url: https://example.com/login');
    expect(yaml).toContain('viewportWidth: 1280');
    expect(yaml).toContain('aiTap: 登录按钮');
    expect(yaml).toContain('aiHover: 用户头像');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
pnpm --filter @automatic-testing/midscene-runner test
```

Expected: FAIL because `./yamlGenerator` does not exist.

- [ ] **Step 4: 实现 YAML 生成器**

Create `packages/midscene-runner/src/yamlGenerator.ts`:

```ts
import YAML from 'yaml';
import type { Environment, Step, TestCase } from '@automatic-testing/shared';

export interface GenerateMidsceneYamlInput {
  environment: Environment;
  testCase: TestCase;
}

type MidsceneTask = Record<string, unknown>;

export function generateMidsceneYaml(input: GenerateMidsceneYamlInput): string {
  const { environment, testCase } = input;
  const tasks = testCase.steps.filter((step) => step.enabled).map(convertStep);

  return YAML.stringify({
    web: {
      url: buildUrl(environment.baseUrl, findInitialPath(testCase.steps)),
      viewportWidth: environment.viewportWidth,
      viewportHeight: environment.viewportHeight,
    },
    tasks,
  });
}

function findInitialPath(steps: Step[]): string {
  const navigateStep = steps.find((step) => step.enabled && step.type === 'navigate');
  const path = navigateStep?.params.path;
  return typeof path === 'string' ? path : '/';
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function convertStep(step: Step): MidsceneTask {
  if (step.type === 'navigate') {
    return { sleep: 0 };
  }

  if (step.type === 'wait') {
    const milliseconds = Number(step.params.milliseconds ?? step.params.ms ?? 1000);
    return { sleep: milliseconds };
  }

  if (step.type === 'native') {
    const action = step.params.action;
    if (typeof action !== 'string' || action.length === 0) {
      throw new Error(`Native step ${step.id} requires params.action`);
    }
    const { action: _action, ...rest } = step.params;
    return buildActionTask(action, rest);
  }

  return buildActionTask(step.type, step.params);
}

function buildActionTask(action: string, params: Record<string, unknown>): MidsceneTask {
  if ('prompt' in params && typeof params.prompt === 'string') {
    return { [action]: params.prompt };
  }

  if ('locate' in params && typeof params.locate === 'string') {
    return { [action]: params.locate };
  }

  return { [action]: params };
}
```

Create `packages/midscene-runner/src/index.ts`:

```ts
export * from './yamlGenerator';
```

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
pnpm --filter @automatic-testing/midscene-runner test
```

Expected: PASS.

- [ ] **Step 6: 提交**

```bash
git add packages/midscene-runner
git commit -m "功能：添加 Midscene YAML 生成器"
```

## Task 4: 创建 Node.js 后端骨架和数据库

**Files:**
- Create: `apps/server/package.json`
- Create: `apps/server/tsconfig.json`
- Create: `apps/server/src/config.ts`
- Create: `apps/server/src/db/schema.sql`
- Create: `apps/server/src/db/database.ts`
- Create: `apps/server/src/app.ts`
- Create: `apps/server/src/index.ts`

- [ ] **Step 1: 创建 server 包配置**

Create `apps/server/package.json`:

```json
{
  "name": "@automatic-testing/server",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@automatic-testing/shared": "workspace:*",
    "@automatic-testing/midscene-runner": "workspace:*",
    "@fastify/cors": "^10.0.1",
    "@fastify/static": "^8.0.2",
    "better-sqlite3": "^11.5.0",
    "fastify": "^5.0.0",
    "nanoid": "^5.0.7",
    "yaml": "^2.6.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "tsx": "^4.19.2",
    "typescript": "^5.6.3",
    "vitest": "^2.1.1"
  }
}
```

Create `apps/server/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "ESNext"
  },
  "include": ["src"]
}
```

- [ ] **Step 2: 创建配置文件**

Create `apps/server/src/config.ts`:

```ts
import path from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  artifactsDir: string;
  maxConcurrency: number;
}

export function loadConfig(): ServerConfig {
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4000),
    databasePath: process.env.DATABASE_PATH ?? path.resolve('data', 'automatic-testing.sqlite'),
    artifactsDir: process.env.ARTIFACTS_DIR ?? path.resolve('artifacts'),
    maxConcurrency: Number(process.env.MAX_CONCURRENCY ?? 1),
  };
}
```

- [ ] **Step 3: 创建数据库 schema**

Create `apps/server/src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  default_environment_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS environments (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  browser_type TEXT NOT NULL,
  viewport_width INTEGER NOT NULL,
  viewport_height INTEGER NOT NULL,
  default_timeout_ms INTEGER NOT NULL,
  is_default INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_suites (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_cases (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  suite_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled INTEGER NOT NULL,
  tags_json TEXT NOT NULL,
  steps_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY(suite_id) REFERENCES test_suites(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT,
  status TEXT NOT NULL,
  total_cases INTEGER NOT NULL DEFAULT 0,
  passed_cases INTEGER NOT NULL DEFAULT 0,
  failed_cases INTEGER NOT NULL DEFAULT 0,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  triggered_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS test_run_cases (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  test_case_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  artifact_path TEXT,
  FOREIGN KEY(run_id) REFERENCES test_runs(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS test_run_steps (
  id TEXT PRIMARY KEY,
  run_case_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  step_index INTEGER NOT NULL,
  step_title TEXT NOT NULL,
  step_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  duration_ms INTEGER,
  error_message TEXT,
  screenshot_path TEXT,
  raw_result_json TEXT,
  FOREIGN KEY(run_case_id) REFERENCES test_run_cases(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  run_case_id TEXT,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES test_runs(id) ON DELETE CASCADE
);
```

- [ ] **Step 4: 创建数据库初始化**

Create `apps/server/src/db/database.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type DatabaseConnection = Database.Database;

export function openDatabase(databasePath: string): DatabaseConnection {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  db.pragma('foreign_keys = ON');
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
  return db;
}
```

- [ ] **Step 5: 创建 Fastify 应用**

Create `apps/server/src/app.ts`:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { DatabaseConnection } from './db/database';

export interface BuildAppOptions {
  db: DatabaseConnection;
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({
    ok: true,
    database: Boolean(options.db),
  }));

  return app;
}
```

Create `apps/server/src/index.ts`:

```ts
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/database';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const app = await buildApp({ db });

await app.listen({ host: config.host, port: config.port });
```

- [ ] **Step 6: 验证后端类型**

Run:

```bash
pnpm --filter @automatic-testing/server typecheck
```

Expected: exits with code 0.

- [ ] **Step 7: 提交**

```bash
git add apps/server
git commit -m "功能：添加后端服务骨架"
```

## Task 5: 实现项目、环境、套件、用例 API

**Files:**
- Create: `apps/server/src/repositories/projectsRepository.ts`
- Create: `apps/server/src/repositories/environmentsRepository.ts`
- Create: `apps/server/src/repositories/suitesRepository.ts`
- Create: `apps/server/src/repositories/casesRepository.ts`
- Create: `apps/server/src/routes/projectsRoutes.ts`
- Create: `apps/server/src/routes/environmentsRoutes.ts`
- Create: `apps/server/src/routes/suitesRoutes.ts`
- Create: `apps/server/src/routes/casesRoutes.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 实现 repository 约定**

Create `apps/server/src/repositories/projectsRepository.ts`:

```ts
import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database';

export function createProjectRepository(db: DatabaseConnection) {
  return {
    list() {
      return db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all();
    },
    create(input: { name: string; description?: string }) {
      const now = new Date().toISOString();
      const project = {
        id: nanoid(),
        name: input.name,
        description: input.description ?? '',
        default_environment_id: null,
        created_at: now,
        updated_at: now,
      };
      db.prepare(
        'INSERT INTO projects (id, name, description, default_environment_id, created_at, updated_at) VALUES (@id, @name, @description, @default_environment_id, @created_at, @updated_at)'
      ).run(project);
      return project;
    },
  };
}
```

Create `apps/server/src/repositories/environmentsRepository.ts`:

```ts
import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database';

export function createEnvironmentRepository(db: DatabaseConnection) {
  return {
    listByProject(projectId: string) {
      return db.prepare('SELECT * FROM environments WHERE project_id = ? ORDER BY updated_at DESC').all(projectId);
    },
    create(input: {
      projectId: string;
      name: string;
      baseUrl: string;
      browserType: string;
      viewportWidth: number;
      viewportHeight: number;
      defaultTimeoutMs: number;
      isDefault: boolean;
    }) {
      const now = new Date().toISOString();
      const environment = {
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
        'INSERT INTO environments (id, project_id, name, base_url, browser_type, viewport_width, viewport_height, default_timeout_ms, is_default, created_at, updated_at) VALUES (@id, @project_id, @name, @base_url, @browser_type, @viewport_width, @viewport_height, @default_timeout_ms, @is_default, @created_at, @updated_at)'
      ).run(environment);
      return environment;
    },
  };
}
```

Create `apps/server/src/repositories/suitesRepository.ts`:

```ts
import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database';

export function createSuiteRepository(db: DatabaseConnection) {
  return {
    listByProject(projectId: string) {
      return db.prepare('SELECT * FROM test_suites WHERE project_id = ? ORDER BY updated_at DESC').all(projectId);
    },
    create(input: { projectId: string; name: string; description?: string }) {
      const now = new Date().toISOString();
      const suite = {
        id: nanoid(),
        project_id: input.projectId,
        name: input.name,
        description: input.description ?? '',
        enabled: 1,
        created_at: now,
        updated_at: now,
      };
      db.prepare(
        'INSERT INTO test_suites (id, project_id, name, description, enabled, created_at, updated_at) VALUES (@id, @project_id, @name, @description, @enabled, @created_at, @updated_at)'
      ).run(suite);
      return suite;
    },
  };
}
```

Create `apps/server/src/repositories/casesRepository.ts`:

```ts
import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database';

export function createCaseRepository(db: DatabaseConnection) {
  return {
    listBySuite(suiteId: string) {
      return db.prepare('SELECT * FROM test_cases WHERE suite_id = ? ORDER BY updated_at DESC').all(suiteId);
    },
    findById(caseId: string) {
      return db.prepare('SELECT * FROM test_cases WHERE id = ?').get(caseId);
    },
    create(input: { projectId: string; suiteId: string; name: string; description?: string }) {
      const now = new Date().toISOString();
      const testCase = {
        id: nanoid(),
        project_id: input.projectId,
        suite_id: input.suiteId,
        name: input.name,
        description: input.description ?? '',
        enabled: 1,
        tags_json: JSON.stringify([]),
        steps_json: JSON.stringify([]),
        created_at: now,
        updated_at: now,
      };
      db.prepare(
        'INSERT INTO test_cases (id, project_id, suite_id, name, description, enabled, tags_json, steps_json, created_at, updated_at) VALUES (@id, @project_id, @suite_id, @name, @description, @enabled, @tags_json, @steps_json, @created_at, @updated_at)'
      ).run(testCase);
      return testCase;
    },
    updateSteps(caseId: string, steps: unknown[]) {
      const now = new Date().toISOString();
      db.prepare('UPDATE test_cases SET steps_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(steps), now, caseId);
      return this.findById(caseId);
    },
  };
}
```

- [ ] **Step 2: 创建基础路由并注册**

Create `apps/server/src/routes/projectsRoutes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database';
import { createProjectRepository } from '../repositories/projectsRepository';

export async function registerProjectsRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const projects = createProjectRepository(db);

  app.get('/api/projects', async () => projects.list());

  app.post<{ Body: { name: string; description?: string } }>('/api/projects', async (request) =>
    projects.create(request.body)
  );
}
```

Create `apps/server/src/routes/environmentsRoutes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database';
import { createEnvironmentRepository } from '../repositories/environmentsRepository';

export async function registerEnvironmentsRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const environments = createEnvironmentRepository(db);

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/environments', async (request) =>
    environments.listByProject(request.params.projectId)
  );

  app.post<{ Params: { projectId: string }; Body: any }>('/api/projects/:projectId/environments', async (request) =>
    environments.create({ ...request.body, projectId: request.params.projectId })
  );
}
```

Create `apps/server/src/routes/suitesRoutes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database';
import { createSuiteRepository } from '../repositories/suitesRepository';

export async function registerSuitesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const suites = createSuiteRepository(db);

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/suites', async (request) =>
    suites.listByProject(request.params.projectId)
  );

  app.post<{ Params: { projectId: string }; Body: { name: string; description?: string } }>('/api/projects/:projectId/suites', async (request) =>
    suites.create({ ...request.body, projectId: request.params.projectId })
  );
}
```

Create `apps/server/src/routes/casesRoutes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database';
import { createCaseRepository } from '../repositories/casesRepository';

export async function registerCasesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const cases = createCaseRepository(db);

  app.get<{ Params: { suiteId: string } }>('/api/suites/:suiteId/cases', async (request) =>
    cases.listBySuite(request.params.suiteId)
  );

  app.get<{ Params: { caseId: string } }>('/api/cases/:caseId', async (request, reply) => {
    const testCase = cases.findById(request.params.caseId);
    if (!testCase) return reply.code(404).send({ message: 'Test case not found' });
    return testCase;
  });

  app.post<{ Params: { suiteId: string }; Body: { projectId: string; name: string; description?: string } }>('/api/suites/:suiteId/cases', async (request) =>
    cases.create({ ...request.body, suiteId: request.params.suiteId })
  );
}
```

Modify `apps/server/src/app.ts`:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { DatabaseConnection } from './db/database';
import { registerProjectsRoutes } from './routes/projectsRoutes';
import { registerEnvironmentsRoutes } from './routes/environmentsRoutes';
import { registerSuitesRoutes } from './routes/suitesRoutes';
import { registerCasesRoutes } from './routes/casesRoutes';

export interface BuildAppOptions {
  db: DatabaseConnection;
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({
    ok: true,
    database: Boolean(options.db),
  }));

  await registerProjectsRoutes(app, options.db);
  await registerEnvironmentsRoutes(app, options.db);
  await registerSuitesRoutes(app, options.db);
  await registerCasesRoutes(app, options.db);

  return app;
}
```

- [ ] **Step 3: 验证类型**

Run:

```bash
pnpm --filter @automatic-testing/server typecheck
```

Expected: exits with code 0.

- [ ] **Step 4: 提交**

```bash
git add apps/server/src
git commit -m "功能：添加测试资产接口"
```

## Task 6: 实现运行队列、Worker 和报告产物

**Files:**
- Create: `apps/server/src/artifacts/artifacts.ts`
- Create: `apps/server/src/events/runEvents.ts`
- Create: `apps/server/src/repositories/runsRepository.ts`
- Create: `apps/server/src/queue/runQueue.ts`
- Create: `apps/server/src/worker/runWorker.ts`
- Create: `apps/server/src/routes/runsRoutes.ts`
- Modify: `apps/server/src/app.ts`

- [ ] **Step 1: 创建产物工具**

Create `apps/server/src/artifacts/artifacts.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

export function createRunArtifactDir(artifactsDir: string, runId: string): string {
  const dir = path.resolve(artifactsDir, 'runs', runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeTextArtifact(dir: string, filename: string, content: string): string {
  const filePath = path.resolve(dir, filename);
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}
```

- [ ] **Step 2: 创建 SSE 事件总线**

Create `apps/server/src/events/runEvents.ts`:

```ts
import { EventEmitter } from 'node:events';

export interface RunEvent {
  runId: string;
  type: 'status' | 'log';
  payload: unknown;
}

export const runEvents = new EventEmitter();

export function emitRunEvent(event: RunEvent) {
  runEvents.emit(event.runId, event);
}
```

- [ ] **Step 3: 创建运行 repository**

Create `apps/server/src/repositories/runsRepository.ts`:

```ts
import { nanoid } from 'nanoid';
import type { DatabaseConnection } from '../db/database';

export function createRunsRepository(db: DatabaseConnection) {
  return {
    create(input: { projectId: string; environmentId: string; scopeType: string; scopeId?: string }) {
      const now = new Date().toISOString();
      const run = {
        id: nanoid(),
        project_id: input.projectId,
        environment_id: input.environmentId,
        scope_type: input.scopeType,
        scope_id: input.scopeId ?? null,
        status: 'pending',
        total_cases: 0,
        passed_cases: 0,
        failed_cases: 0,
        started_at: null,
        finished_at: null,
        duration_ms: null,
        triggered_by: null,
        created_at: now,
      };
      db.prepare(
        'INSERT INTO test_runs (id, project_id, environment_id, scope_type, scope_id, status, total_cases, passed_cases, failed_cases, started_at, finished_at, duration_ms, triggered_by, created_at) VALUES (@id, @project_id, @environment_id, @scope_type, @scope_id, @status, @total_cases, @passed_cases, @failed_cases, @started_at, @finished_at, @duration_ms, @triggered_by, @created_at)'
      ).run(run);
      return run;
    },
    listByProject(projectId: string) {
      return db.prepare('SELECT * FROM test_runs WHERE project_id = ? ORDER BY created_at DESC').all(projectId);
    },
    findById(runId: string) {
      return db.prepare('SELECT * FROM test_runs WHERE id = ?').get(runId);
    },
    updateStatus(runId: string, status: string) {
      const now = new Date().toISOString();
      db.prepare('UPDATE test_runs SET status = ?, started_at = COALESCE(started_at, ?), finished_at = CASE WHEN ? IN (\\'success\\', \\'failed\\', \\'canceled\\') THEN ? ELSE finished_at END WHERE id = ?')
        .run(status, now, status, now, runId);
      return this.findById(runId);
    },
  };
}
```

- [ ] **Step 4: 创建队列和 Worker**

Create `apps/server/src/queue/runQueue.ts`:

```ts
import type { RunWorker } from '../worker/runWorker';

export interface RunJob {
  runId: string;
}

export class RunQueue {
  private readonly jobs: RunJob[] = [];
  private active = 0;

  constructor(
    private readonly worker: RunWorker,
    private readonly maxConcurrency: number
  ) {}

  enqueue(job: RunJob) {
    this.jobs.push(job);
    void this.drain();
  }

  private async drain() {
    while (this.active < this.maxConcurrency && this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (!job) return;
      this.active += 1;
      this.worker.run(job).finally(() => {
        this.active -= 1;
        void this.drain();
      });
    }
  }
}
```

Create `apps/server/src/worker/runWorker.ts`:

```ts
import { generateMidsceneYaml } from '@automatic-testing/midscene-runner';
import type { DatabaseConnection } from '../db/database';
import { createRunArtifactDir, writeTextArtifact } from '../artifacts/artifacts';
import { emitRunEvent } from '../events/runEvents';
import { createRunsRepository } from '../repositories/runsRepository';
import type { RunJob } from '../queue/runQueue';

export interface RunWorkerOptions {
  db: DatabaseConnection;
  artifactsDir: string;
}

export class RunWorker {
  private readonly runs;

  constructor(private readonly options: RunWorkerOptions) {
    this.runs = createRunsRepository(options.db);
  }

  async run(job: RunJob) {
    this.runs.updateStatus(job.runId, 'running');
    emitRunEvent({ runId: job.runId, type: 'status', payload: { status: 'running' } });

    try {
      const run = this.runs.findById(job.runId) as any;
      const environment = this.options.db.prepare('SELECT * FROM environments WHERE id = ?').get(run.environment_id) as any;
      const testCase = this.options.db.prepare('SELECT * FROM test_cases WHERE id = ?').get(run.scope_id) as any;
      const artifactDir = createRunArtifactDir(this.options.artifactsDir, job.runId);

      const yaml = generateMidsceneYaml({
        environment: {
          id: environment.id,
          projectId: environment.project_id,
          name: environment.name,
          baseUrl: environment.base_url,
          browserType: environment.browser_type,
          viewportWidth: environment.viewport_width,
          viewportHeight: environment.viewport_height,
          defaultTimeoutMs: environment.default_timeout_ms,
          isDefault: Boolean(environment.is_default),
          createdAt: environment.created_at,
          updatedAt: environment.updated_at,
        },
        testCase: {
          id: testCase.id,
          projectId: testCase.project_id,
          suiteId: testCase.suite_id,
          name: testCase.name,
          description: testCase.description,
          enabled: Boolean(testCase.enabled),
          tags: JSON.parse(testCase.tags_json),
          steps: JSON.parse(testCase.steps_json),
          createdAt: testCase.created_at,
          updatedAt: testCase.updated_at,
        },
      });

      writeTextArtifact(artifactDir, 'midscene.yaml', yaml);
      writeTextArtifact(artifactDir, 'logs/run.log', 'Generated Midscene YAML for the first vertical slice.');

      this.runs.updateStatus(job.runId, 'success');
      emitRunEvent({ runId: job.runId, type: 'status', payload: { status: 'success' } });
    } catch (error) {
      this.runs.updateStatus(job.runId, 'failed');
      emitRunEvent({ runId: job.runId, type: 'log', payload: { message: String(error) } });
    }
  }
}
```

- [ ] **Step 5: 创建运行路由**

Create `apps/server/src/routes/runsRoutes.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database';
import { createRunsRepository } from '../repositories/runsRepository';
import type { RunQueue } from '../queue/runQueue';
import { runEvents } from '../events/runEvents';

export async function registerRunsRoutes(app: FastifyInstance, db: DatabaseConnection, queue: RunQueue) {
  const runs = createRunsRepository(db);

  app.post<{ Body: { projectId: string; environmentId: string; scopeType: string; scopeId?: string } }>('/api/runs', async (request) => {
    const run = runs.create(request.body);
    queue.enqueue({ runId: run.id });
    return run;
  });

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/runs', async (request) =>
    runs.listByProject(request.params.projectId)
  );

  app.get<{ Params: { runId: string } }>('/api/runs/:runId', async (request, reply) => {
    const run = runs.findById(request.params.runId);
    if (!run) return reply.code(404).send({ message: 'Run not found' });
    return run;
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId/events', async (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const listener = (event: unknown) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    runEvents.on(request.params.runId, listener);
    request.raw.on('close', () => runEvents.off(request.params.runId, listener));
  });
}
```

Modify `apps/server/src/app.ts` to accept and register queue:

```ts
import Fastify from 'fastify';
import cors from '@fastify/cors';
import type { DatabaseConnection } from './db/database';
import type { RunQueue } from './queue/runQueue';
import { registerProjectsRoutes } from './routes/projectsRoutes';
import { registerEnvironmentsRoutes } from './routes/environmentsRoutes';
import { registerSuitesRoutes } from './routes/suitesRoutes';
import { registerCasesRoutes } from './routes/casesRoutes';
import { registerRunsRoutes } from './routes/runsRoutes';

export interface BuildAppOptions {
  db: DatabaseConnection;
  runQueue: RunQueue;
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({
    ok: true,
    database: Boolean(options.db),
  }));

  await registerProjectsRoutes(app, options.db);
  await registerEnvironmentsRoutes(app, options.db);
  await registerSuitesRoutes(app, options.db);
  await registerCasesRoutes(app, options.db);
  await registerRunsRoutes(app, options.db, options.runQueue);

  return app;
}
```

Modify `apps/server/src/index.ts`:

```ts
import { buildApp } from './app';
import { loadConfig } from './config';
import { openDatabase } from './db/database';
import { RunQueue } from './queue/runQueue';
import { RunWorker } from './worker/runWorker';

const config = loadConfig();
const db = openDatabase(config.databasePath);
const worker = new RunWorker({ db, artifactsDir: config.artifactsDir });
const runQueue = new RunQueue(worker, config.maxConcurrency);
const app = await buildApp({ db, runQueue });

await app.listen({ host: config.host, port: config.port });
```

- [ ] **Step 6: 验证后端类型**

Run:

```bash
pnpm --filter @automatic-testing/server typecheck
```

Expected: exits with code 0.

- [ ] **Step 7: 提交**

```bash
git add apps/server/src
git commit -m "功能：添加运行队列"
```

## Task 7: 创建 Vite + React + Ant Design v6 前端骨架

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles.css`

- [ ] **Step 1: 创建 web 包配置**

Create `apps/web/package.json`:

```json
{
  "name": "@automatic-testing/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 127.0.0.1",
    "build": "tsc -p tsconfig.json && vite build",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@ant-design/icons": "^6.0.0",
    "@automatic-testing/shared": "workspace:*",
    "@monaco-editor/react": "^4.6.0",
    "@tanstack/react-query": "^5.59.16",
    "antd": "^6.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-hook-form": "^7.53.1",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^6.0.0",
    "vitest": "^2.1.1"
  }
}
```

Create `apps/web/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "types": ["vite/client"],
    "noEmit": true
  },
  "include": ["src", "vite.config.ts"]
}
```

Create `apps/web/vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:4000',
      '/artifacts': 'http://127.0.0.1:4000',
    },
  },
});
```

- [ ] **Step 2: 创建 React 入口**

Create `apps/web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Midscene 自动化测试平台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `apps/web/src/main.tsx`:

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { App } from './App';
import './styles.css';

const queryClient = new QueryClient();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={zhCN}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </ConfigProvider>
  </React.StrictMode>
);
```

Create `apps/web/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ProjectListPage } from './pages/ProjectListPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectListPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

Create `apps/web/src/styles.css`:

```css
html,
body,
#root {
  min-height: 100%;
  margin: 0;
}

body {
  background: #f5f5f5;
}
```

- [ ] **Step 3: 创建临时项目列表页**

Create `apps/web/src/pages/ProjectListPage.tsx`:

```tsx
import { Button, Layout, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

export function ProjectListPage() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ color: '#fff', fontWeight: 600 }}>Midscene 自动化测试平台</Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              项目
            </Typography.Title>
            <Button type="primary" icon={<PlusOutlined />}>
              新建项目
            </Button>
          </Space>
          <Table
            rowKey="id"
            columns={[
              { title: '项目名称', dataIndex: 'name' },
              { title: '描述', dataIndex: 'description' },
              { title: '更新时间', dataIndex: 'updatedAt' },
            ]}
            dataSource={[]}
          />
        </Space>
      </Layout.Content>
    </Layout>
  );
}
```

- [ ] **Step 4: 验证前端类型**

Run:

```bash
pnpm --filter @automatic-testing/web typecheck
```

Expected: exits with code 0.

- [ ] **Step 5: 提交**

```bash
git add apps/web
git commit -m "功能：添加前端应用骨架"
```

## Task 8: 实现项目工作台路由和后台管理布局

**Files:**
- Create: `apps/web/src/components/AppLayout.tsx`
- Create: `apps/web/src/pages/ProjectOverviewPage.tsx`
- Create: `apps/web/src/pages/EnvironmentPage.tsx`
- Create: `apps/web/src/pages/SuiteListPage.tsx`
- Create: `apps/web/src/pages/SuiteDetailPage.tsx`
- Create: `apps/web/src/pages/CaseEditorPage.tsx`
- Create: `apps/web/src/pages/RunListPage.tsx`
- Create: `apps/web/src/pages/RunReportPage.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: 创建后台管理布局**

Create `apps/web/src/components/AppLayout.tsx`:

```tsx
import { Layout, Menu, Typography } from 'antd';
import { DashboardOutlined, DatabaseOutlined, PlayCircleOutlined, ProjectOutlined } from '@ant-design/icons';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();

  const base = `/projects/${projectId}`;
  const selectedKey = location.pathname.includes('/environments')
    ? 'environments'
    : location.pathname.includes('/suites')
      ? 'suites'
      : location.pathname.includes('/runs')
        ? 'runs'
        : 'overview';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Text style={{ color: '#fff', fontWeight: 600 }}>Midscene 自动化测试平台</Typography.Text>
      </Layout.Header>
      <Layout>
        <Layout.Sider theme="light" width={220}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={({ key }) => navigate(key === 'overview' ? base : `${base}/${key}`)}
            items={[
              { key: 'overview', icon: <DashboardOutlined />, label: '概览' },
              { key: 'environments', icon: <DatabaseOutlined />, label: '环境配置' },
              { key: 'suites', icon: <ProjectOutlined />, label: '测试套件' },
              { key: 'runs', icon: <PlayCircleOutlined />, label: '执行记录' },
            ]}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
```

- [ ] **Step 2: 创建基础页面**

Create `apps/web/src/pages/ProjectOverviewPage.tsx`:

```tsx
import { Card, Col, Row, Statistic, Typography } from 'antd';

export function ProjectOverviewPage() {
  return (
    <>
      <Typography.Title level={3}>项目概览</Typography.Title>
      <Row gutter={16}>
        <Col span={6}><Card><Statistic title="环境" value={0} /></Card></Col>
        <Col span={6}><Card><Statistic title="套件" value={0} /></Card></Col>
        <Col span={6}><Card><Statistic title="用例" value={0} /></Card></Col>
        <Col span={6}><Card><Statistic title="最近成功率" value={0} suffix="%" /></Card></Col>
      </Row>
    </>
  );
}
```

Create the remaining pages with consistent Ant Design page shells:

```tsx
// apps/web/src/pages/EnvironmentPage.tsx
import { Button, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

export function EnvironmentPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>环境配置</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />}>新建环境</Button>
      </Space>
      <Table rowKey="id" columns={[{ title: '名称', dataIndex: 'name' }, { title: 'Base URL', dataIndex: 'baseUrl' }]} dataSource={[]} />
    </Space>
  );
}
```

```tsx
// apps/web/src/pages/SuiteListPage.tsx
import { Button, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';

export function SuiteListPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>测试套件</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />}>新建套件</Button>
      </Space>
      <Table rowKey="id" columns={[{ title: '套件名称', dataIndex: 'name' }, { title: '用例数', dataIndex: 'caseCount' }]} dataSource={[]} />
    </Space>
  );
}
```

```tsx
// apps/web/src/pages/SuiteDetailPage.tsx
import { Button, Space, Table, Typography } from 'antd';
import { PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';

export function SuiteDetailPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>套件详情</Typography.Title>
        <Space>
          <Button icon={<PlayCircleOutlined />}>运行套件</Button>
          <Button type="primary" icon={<PlusOutlined />}>新建用例</Button>
        </Space>
      </Space>
      <Table rowKey="id" columns={[{ title: '用例名称', dataIndex: 'name' }, { title: '标签', dataIndex: 'tags' }]} dataSource={[]} />
    </Space>
  );
}
```

```tsx
// apps/web/src/pages/CaseEditorPage.tsx
import { Card, Col, Row, Tabs, Typography } from 'antd';

export function CaseEditorPage() {
  return (
    <>
      <Typography.Title level={3}>用例编辑器</Typography.Title>
      <Row gutter={16}>
        <Col span={6}><Card title="步骤列表">暂无步骤</Card></Col>
        <Col span={12}><Card><Tabs items={[{ key: 'flow', label: '步骤流', children: '步骤表单' }, { key: 'yaml', label: 'YAML 源码', children: '源码编辑器' }]} /></Card></Col>
        <Col span={6}><Card title="运行预览">暂无预览</Card></Col>
      </Row>
    </>
  );
}
```

```tsx
// apps/web/src/pages/RunListPage.tsx
import { Space, Table, Typography } from 'antd';

export function RunListPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>执行记录</Typography.Title>
      <Table rowKey="id" columns={[{ title: '状态', dataIndex: 'status' }, { title: '开始时间', dataIndex: 'startedAt' }]} dataSource={[]} />
    </Space>
  );
}
```

```tsx
// apps/web/src/pages/RunReportPage.tsx
import { Card, Descriptions, Tabs, Typography } from 'antd';

export function RunReportPage() {
  return (
    <>
      <Typography.Title level={3}>执行报告</Typography.Title>
      <Card>
        <Descriptions items={[{ key: 'status', label: '状态', children: 'pending' }]} />
        <Tabs items={[{ key: 'steps', label: '步骤结果', children: '暂无结果' }, { key: 'logs', label: '日志', children: '暂无日志' }]} />
      </Card>
    </>
  );
}
```

- [ ] **Step 3: 注册路由**

Modify `apps/web/src/App.tsx`:

```tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { CaseEditorPage } from './pages/CaseEditorPage';
import { EnvironmentPage } from './pages/EnvironmentPage';
import { ProjectListPage } from './pages/ProjectListPage';
import { ProjectOverviewPage } from './pages/ProjectOverviewPage';
import { RunListPage } from './pages/RunListPage';
import { RunReportPage } from './pages/RunReportPage';
import { SuiteDetailPage } from './pages/SuiteDetailPage';
import { SuiteListPage } from './pages/SuiteListPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/projects" element={<ProjectListPage />} />
        <Route path="/projects/:projectId" element={<AppLayout />}>
          <Route index element={<ProjectOverviewPage />} />
          <Route path="environments" element={<EnvironmentPage />} />
          <Route path="suites" element={<SuiteListPage />} />
          <Route path="suites/:suiteId" element={<SuiteDetailPage />} />
          <Route path="cases/:caseId" element={<CaseEditorPage />} />
          <Route path="runs" element={<RunListPage />} />
          <Route path="runs/:runId" element={<RunReportPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 4: 验证前端类型**

Run:

```bash
pnpm --filter @automatic-testing/web typecheck
```

Expected: exits with code 0.

- [ ] **Step 5: 提交**

```bash
git add apps/web/src
git commit -m "功能：添加项目工作台页面"
```

## Task 9: 实现前端 API Client 和资产管理联调

**Files:**
- Create: `apps/web/src/api/client.ts`
- Create: `apps/web/src/api/projects.ts`
- Modify: `apps/web/src/pages/ProjectListPage.tsx`
- Modify: `apps/web/src/pages/EnvironmentPage.tsx`
- Modify: `apps/web/src/pages/SuiteListPage.tsx`

- [ ] **Step 1: 创建 API Client**

Create `apps/web/src/api/client.ts`:

```ts
export async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}
```

Create `apps/web/src/api/projects.ts`:

```ts
import { apiGet, apiPost } from './client';

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  updated_at?: string;
  updatedAt?: string;
}

export function listProjects() {
  return apiGet<ProjectRow[]>('/api/projects');
}

export function createProject(input: { name: string; description?: string }) {
  return apiPost<ProjectRow>('/api/projects', input);
}
```

- [ ] **Step 2: 让项目列表读取 API**

Modify `apps/web/src/pages/ProjectListPage.tsx`:

```tsx
import { Button, Layout, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { listProjects } from '../api/projects';

export function ProjectListPage() {
  const { data = [], isLoading } = useQuery({ queryKey: ['projects'], queryFn: listProjects });

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ color: '#fff', fontWeight: 600 }}>Midscene 自动化测试平台</Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              项目
            </Typography.Title>
            <Button type="primary" icon={<PlusOutlined />}>
              新建项目
            </Button>
          </Space>
          <Table
            loading={isLoading}
            rowKey="id"
            columns={[
              { title: '项目名称', dataIndex: 'name' },
              { title: '描述', dataIndex: 'description' },
              { title: '更新时间', dataIndex: 'updated_at' },
            ]}
            dataSource={data}
          />
        </Space>
      </Layout.Content>
    </Layout>
  );
}
```

- [ ] **Step 3: 验证前端类型**

Run:

```bash
pnpm --filter @automatic-testing/web typecheck
```

Expected: exits with code 0.

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/api apps/web/src/pages
git commit -m "功能：接入前端项目接口"
```

## Task 10: 实现用例编辑器源码模式和 YAML 预览

**Files:**
- Modify: `apps/server/src/routes/casesRoutes.ts`
- Create: `apps/web/src/stores/caseEditorStore.ts`
- Modify: `apps/web/src/pages/CaseEditorPage.tsx`

- [ ] **Step 1: 后端添加生成 YAML 预览接口**

Modify `apps/server/src/routes/casesRoutes.ts` to include:

```ts
import { generateMidsceneYaml } from '@automatic-testing/midscene-runner';

app.post<{ Params: { caseId: string }; Body: { environmentId: string } }>('/api/cases/:caseId/preview-midscene-yaml', async (request, reply) => {
  const testCaseRow = cases.findById(request.params.caseId) as any;
  if (!testCaseRow) return reply.code(404).send({ message: 'Test case not found' });

  const environment = db.prepare('SELECT * FROM environments WHERE id = ?').get(request.body.environmentId) as any;
  if (!environment) return reply.code(404).send({ message: 'Environment not found' });

  const yaml = generateMidsceneYaml({
    environment: {
      id: environment.id,
      projectId: environment.project_id,
      name: environment.name,
      baseUrl: environment.base_url,
      browserType: environment.browser_type,
      viewportWidth: environment.viewport_width,
      viewportHeight: environment.viewport_height,
      defaultTimeoutMs: environment.default_timeout_ms,
      isDefault: Boolean(environment.is_default),
      createdAt: environment.created_at,
      updatedAt: environment.updated_at,
    },
    testCase: {
      id: testCaseRow.id,
      projectId: testCaseRow.project_id,
      suiteId: testCaseRow.suite_id,
      name: testCaseRow.name,
      description: testCaseRow.description,
      enabled: Boolean(testCaseRow.enabled),
      tags: JSON.parse(testCaseRow.tags_json),
      steps: JSON.parse(testCaseRow.steps_json),
      createdAt: testCaseRow.created_at,
      updatedAt: testCaseRow.updated_at,
    },
  });

  return { yaml };
});
```

- [ ] **Step 2: 创建编辑器本地状态**

Create `apps/web/src/stores/caseEditorStore.ts`:

```ts
import { create } from 'zustand';

interface CaseEditorState {
  yamlText: string;
  dirty: boolean;
  setYamlText: (value: string) => void;
  markSaved: () => void;
}

export const useCaseEditorStore = create<CaseEditorState>((set) => ({
  yamlText: '',
  dirty: false,
  setYamlText: (yamlText) => set({ yamlText, dirty: true }),
  markSaved: () => set({ dirty: false }),
}));
```

- [ ] **Step 3: 用 Monaco 展示源码模式**

Modify `apps/web/src/pages/CaseEditorPage.tsx`:

```tsx
import Editor from '@monaco-editor/react';
import { Card, Col, Row, Tabs, Typography } from 'antd';
import { useCaseEditorStore } from '../stores/caseEditorStore';

export function CaseEditorPage() {
  const yamlText = useCaseEditorStore((state) => state.yamlText);
  const setYamlText = useCaseEditorStore((state) => state.setYamlText);

  return (
    <>
      <Typography.Title level={3}>用例编辑器</Typography.Title>
      <Row gutter={16}>
        <Col span={6}><Card title="步骤列表">暂无步骤</Card></Col>
        <Col span={12}>
          <Card>
            <Tabs
              items={[
                { key: 'flow', label: '步骤流', children: '步骤表单' },
                {
                  key: 'yaml',
                  label: 'YAML 源码',
                  children: (
                    <Editor
                      height="520px"
                      defaultLanguage="yaml"
                      value={yamlText}
                      onChange={(value) => setYamlText(value ?? '')}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={6}><Card title="运行预览">暂无预览</Card></Col>
      </Row>
    </>
  );
}
```

- [ ] **Step 4: 验证前后端类型**

Run:

```bash
pnpm --filter @automatic-testing/server typecheck
pnpm --filter @automatic-testing/web typecheck
```

Expected: both commands exit with code 0.

- [ ] **Step 5: 提交**

```bash
git add apps/server/src/routes/casesRoutes.ts apps/web/src/pages/CaseEditorPage.tsx apps/web/src/stores
git commit -m "功能：添加用例源码编辑"
```

## Task 11: 端到端验证首个纵向闭环

**Files:**
- Modify: `README.md`

- [ ] **Step 1: 写本地启动说明**

Create or modify `README.md`:

````md
# Midscene 自动化测试平台

## 本地启动

```bash
pnpm install
pnpm dev
```

前端默认地址：http://127.0.0.1:5173

后端默认地址：http://127.0.0.1:4000

## 验证命令

```bash
pnpm typecheck
pnpm test
pnpm build
```

## 首版范围

- Vite + React + Ant Design v6 前端
- Node.js 后端
- 项目、环境、套件、用例管理
- 平台 DSL 到 Midscene YAML 生成
- 队列化运行任务
- 报告产物目录
````

- [ ] **Step 2: 运行完整验证**

Run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

Expected: all commands exit with code 0.

- [ ] **Step 3: 启动服务验证页面**

Run:

```bash
pnpm dev
```

Expected:

```text
server listening on http://127.0.0.1:4000
Vite ready on http://127.0.0.1:5173
```

Open `http://127.0.0.1:5173/projects` and verify the project list page renders with Ant Design layout.

- [ ] **Step 4: 提交**

```bash
git add README.md
git commit -m "文档：添加本地启动说明"
```

## 自查结果

- Spec 覆盖：计划覆盖 monorepo、Ant Design v6 前端、Node 后端、共享 schema、Midscene YAML 生成、队列、SSE、报告产物和首版路由。
- 有意延期：登录权限、密钥管理、定时任务、CI API、分布式 Worker、多执行器、完整 Midscene CLI 执行将在首个纵向闭环后单独计划。
- 命名一致性：`Project`、`Environment`、`TestSuite`、`TestCase`、`Step`、`TestRun`、`RunQueue`、`RunWorker` 在任务间保持一致。
- 提交规范：后续提交信息使用中文。
