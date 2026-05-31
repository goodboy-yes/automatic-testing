# Midscene 自动化测试平台需求设计

日期：2026-05-31

## 1. 产品定位

本项目是一个基于 Midscene.js 的团队级 Web UI 自动化测试平台。它面向 QA 和前端研发协作，用于管理测试资产、可视化配置测试步骤、通过 Node.js 后端运行 Midscene 测试，并沉淀结构化执行报告。

首版目标是打通完整的 Web UI 自动化测试闭环：

```text
创建项目
-> 配置基础环境
-> 创建测试套件
-> 创建测试用例和步骤
-> 通过步骤流或 YAML 源码模式维护测试定义
-> 队列化运行 Midscene Web UI 测试
-> 查看步骤级报告和 Midscene visual report
```

首版只支持 Web UI 测试。不支持 App、小程序、设备农场、复杂密钥管理、角色权限、团队空间、审计日志或完整 CI 平台。CI API、定时任务、登录与角色、项目级模型配置、多执行器作为后续扩展预留。

## 2. 范围

### 首版范围

- 使用 monorepo 组织前端、后端、共享 schema 和 Midscene runner。
- 前端使用 Vite + React。
- 后端使用 Node.js。
- 支持项目、环境、测试套件、测试用例管理。
- 测试资产层级为：项目 -> 测试套件 -> 测试用例 -> 步骤。
- 支持基础环境配置。
- 支持步骤流编辑器和 YAML 源码编辑器。
- 平台内部使用 JSON schema 保存测试定义。
- 源码模式展示基于平台 DSL 的 YAML。
- 执行前生成 Midscene YAML。
- 支持带基础并发控制的队列化执行。
- 支持运行单个用例、整个套件、选中的多个用例。
- 支持步骤级执行报告。
- 支持 Midscene visual report 入口。
- 支持本地报告产物存储。
- Midscene 模型配置由后端全局环境变量提供。

### 首版不做

- 角色权限。
- 团队或空间级权限。
- 公网部署安全加固。
- 密钥管理页面。
- Cookie、Storage State、代理、请求头管理。
- 移动端、App、小程序或多设备执行。
- 分布式 Worker。
- 完整 CI 产品能力。
- 定时任务作为首版必需能力。
- 条件分支、循环、可复用步骤库等高级工作流能力。

## 3. 访问模型

首版不做登录、角色或权限控制。

系统默认作为内部单团队工具部署。所有能进入系统的人都可以查看、创建、编辑、删除和执行测试资产。

数据模型可以预留 `createdBy`、`updatedBy`、`triggeredBy` 字段，但首版可以为空或使用默认系统用户。这样以后接入登录和角色权限时，不需要推翻核心数据结构。

## 4. 仓库组织

项目建议使用单仓库 monorepo，不拆分前端仓库和后端仓库。

推荐目录结构：

```text
automatic-testing/
  apps/
    web/                 # Vite + React 前端
    server/              # Node.js API、队列和 Worker
  packages/
    shared/              # 共享类型、schema、枚举、API DTO
    midscene-runner/     # DSL -> Midscene YAML、执行封装、产物解析
  docs/
    superpowers/
      specs/
        2026-05-31-midscene-testing-platform-design.md
  artifacts/             # 本地运行产物，加入 gitignore
  package.json
  pnpm-workspace.yaml
  README.md
```

职责划分：

- `apps/web`：前端路由、页面、编辑器、运行状态、报告展示。
- `apps/server`：REST API、SSE 事件、数据持久化、任务队列、Worker 生命周期、产物访问。
- `packages/shared`：测试用例 schema、步骤 schema、运行状态、API 请求和响应类型。
- `packages/midscene-runner`：平台 DSL 到 Midscene YAML 的转换、Midscene 执行、结果解析和产物收集。

monorepo 可以保证前后端共享 DSL、API 类型、运行状态和报告结构，减少两边定义漂移。

## 5. 前端路由与页面

前端使用多路由页面，并在项目内共享工作台布局。

路由：

```text
/projects
/projects/:projectId
/projects/:projectId/environments
/projects/:projectId/suites
/projects/:projectId/suites/:suiteId
/projects/:projectId/cases/:caseId
/projects/:projectId/runs
/projects/:projectId/runs/:runId
```

进入项目后使用统一布局：

```text
顶部栏：系统名称、当前项目、运行状态入口
左侧栏：概览、环境配置、测试套件、执行记录
主区域：当前路由页面内容
```

### 项目列表

展示所有项目，支持创建、编辑、删除。项目字段包括名称、描述、默认环境、创建时间、更新时间。

### 项目概览

展示项目摘要：

```text
环境数量
套件数量
用例数量
最近运行记录
快捷操作
```

### 环境配置

每个项目可以配置多个基础环境：

```text
name
baseUrl
browserType: chromium / firefox / webkit
viewportWidth
viewportHeight
defaultTimeoutMs
isDefault
```

首版不管理密钥、Cookie、Storage State、代理或请求头。

### 测试套件管理

测试套件用于组织测试用例并支持批量执行。套件列表展示用例数量、最近运行状态和通过率。套件详情页展示用例列表，支持批量选择、批量运行和新建用例。

### 测试用例编辑器

测试用例编辑器是前端核心界面。它需要支持：

```text
用例基础信息
步骤流模式
YAML 源码模式
生成的 Midscene YAML 预览
最近执行结果
```

步骤流模式支持排序、启用、禁用、复制和删除。高频 Midscene 动作提供专用表单。较少使用或 Midscene 新增的动作可以通过 native step 表达。

YAML 源码模式负责解析 YAML、按平台 schema 校验、展示错误，并把结果保存为内部 JSON。

### 执行与报告

用户可以从以下入口触发运行：

```text
单个用例
整个套件
选中的多个用例
```

运行列表展示排队中、运行中、成功、失败、已取消任务。报告详情展示运行摘要、用例结果、步骤结果、日志、产物链接和 Midscene visual report 入口。

运行中的任务通过 SSE 接收状态和日志更新。

## 6. DSL 与 Midscene YAML 转换

平台内部维护统一的测试定义 schema，并以 JSON 形式保存。它同时服务前端步骤编辑器、YAML 源码模式和后端 Midscene YAML 生成。

核心原则：

```text
不限制 Midscene 能力。
源码模式通过平台 DSL 支持 Midscene 全量动作面。
步骤流模式优先产品化高频动作。
平台未表单化或 Midscene 新增的动作通过 native step 透传。
```

内部结构：

```text
TestCase
- id
- suiteId
- name
- description
- enabled
- tags
- steps

Step
- id
- type
- title
- enabled
- params
- timeoutMs
```

步骤分为三类。

### 平台步骤

平台自有抽象：

```text
navigate：基于环境 baseUrl 打开 path
wait：等待固定时间
```

这类步骤会在执行前转换成 Midscene 兼容的 YAML。

### 表单化 Midscene 步骤

首版优先为这些高频步骤提供较完整的表单体验：

```text
aiTap
aiInput
aiAction / aiAct
aiAssert
aiQuery
aiWaitFor
```

这些步骤在生成 YAML 时映射为 Midscene 动作。

### Native Midscene 步骤

native step 用于承载其他 Midscene 动作和未来新增能力。

平台 DSL 示例：

```yaml
type: native
action: aiHover
params:
  locate: user avatar
```

生成的 Midscene YAML：

```yaml
- aiHover: user avatar
```

源码编辑器展示的是平台 DSL YAML，不是最终 Midscene YAML。平台 DSL 包含 Midscene 不需要的平台元信息，例如用例名称、标签、步骤 ID、启用状态和展示标题。

对于 native step，首版只校验通用包装结构。常用 Midscene action 的细粒度参数校验可以后续逐步补齐。

执行流程：

```text
内部 JSON 测试用例
+ 选中的项目环境
-> 过滤禁用步骤
-> 转换平台步骤
-> 转换表单化 Midscene 步骤
-> 透传 native Midscene 步骤
-> 生成最终 Midscene YAML
-> 执行 Midscene
```

前端还需要提供“预览生成的 Midscene YAML”能力，方便研发排查转换结果。

## 7. 后端架构

后端使用 Node.js，包含五个核心模块。

### API 服务

提供 REST API：

```text
项目 CRUD
环境 CRUD
测试套件 CRUD
测试用例 CRUD
运行任务创建、取消、查询
报告查询
生成 Midscene YAML 预览
产物访问
```

### 数据存储

首版建议使用 PostgreSQL。

结构化数据包括：

```text
projects
environments
test_suites
test_cases
test_runs
test_run_cases
test_run_steps
artifacts
```

测试用例步骤可以存储在 JSON 字段中。历史步骤结果单独存储，方便报告查询和后续对比。

### 任务队列

运行任务不在 API 请求中同步执行，而是进入队列。

状态流转：

```text
pending -> running -> success / failed / canceled
```

队列职责：

```text
基础并发控制
运行状态更新
失败记录
取消任务
将套件或选择范围展开为用例运行
```

首版可以使用单机进程内队列。设计上需要允许后续迁移到 BullMQ 或其他分布式队列。

### Midscene 执行器

执行器负责：

```text
读取项目、环境和用例定义
创建运行产物目录
生成 Midscene YAML
设置模型相关环境变量
通过 CLI 或 JS API 运行 Midscene
捕获 stdout 和 stderr
收集 summary JSON、result JSON、visual report HTML、截图和日志
解析结果并写入 run、case、step 记录
```

首版建议优先使用 CLI 执行，因为它贴近 Midscene YAML 使用方式，也方便在平台外复现问题。`midscene-runner` 包需要隐藏执行方式，后续如果需要更细粒度控制，可以切换到 JS API。

### 产物管理

每次运行拥有独立产物目录：

```text
artifacts/
  runs/
    {runId}/
      midscene.yaml
      summary.json
      result.json
      visual-report.html
      screenshots/
      logs/
```

数据库保存结构化摘要和产物路径。产物文件通过后端路由或静态文件服务访问。

## 8. 数据模型草案

### Project

```text
id
name
description
defaultEnvironmentId
createdAt
updatedAt
```

### Environment

```text
id
projectId
name
baseUrl
browserType
viewportWidth
viewportHeight
defaultTimeoutMs
isDefault
createdAt
updatedAt
```

### TestSuite

```text
id
projectId
name
description
enabled
createdAt
updatedAt
```

### TestCase

```text
id
projectId
suiteId
name
description
enabled
tags
stepsJson
createdAt
updatedAt
```

### Step

首版步骤存在 `TestCase.stepsJson` 内，不单独建表。

```text
id
type
title
enabled
params
timeoutMs
```

### TestRun

```text
id
projectId
environmentId
scopeType: case / suite / selection
scopeId
status: pending / running / success / failed / canceled
totalCases
passedCases
failedCases
startedAt
finishedAt
durationMs
triggeredBy
createdAt
```

### TestRunCase

```text
id
runId
testCaseId
status
startedAt
finishedAt
durationMs
errorMessage
artifactPath
```

### TestRunStep

```text
id
runCaseId
stepId
stepIndex
stepTitle
stepType
status
startedAt
finishedAt
durationMs
errorMessage
screenshotPath
rawResultJson
```

### Artifact

```text
id
runId
runCaseId
type: midscene_yaml / summary_json / result_json / visual_report / screenshot / log
path
createdAt
```

## 9. API 草案

项目：

```text
GET    /api/projects
POST   /api/projects
GET    /api/projects/:projectId
PATCH  /api/projects/:projectId
DELETE /api/projects/:projectId
```

环境：

```text
GET    /api/projects/:projectId/environments
POST   /api/projects/:projectId/environments
PATCH  /api/environments/:environmentId
DELETE /api/environments/:environmentId
```

套件：

```text
GET    /api/projects/:projectId/suites
POST   /api/projects/:projectId/suites
GET    /api/suites/:suiteId
PATCH  /api/suites/:suiteId
DELETE /api/suites/:suiteId
```

用例：

```text
GET    /api/suites/:suiteId/cases
POST   /api/suites/:suiteId/cases
GET    /api/cases/:caseId
PATCH  /api/cases/:caseId
DELETE /api/cases/:caseId
POST   /api/cases/:caseId/validate
POST   /api/cases/:caseId/preview-midscene-yaml
```

运行：

```text
POST   /api/runs
GET    /api/projects/:projectId/runs
GET    /api/runs/:runId
POST   /api/runs/:runId/cancel
GET    /api/runs/:runId/events
```

产物：

```text
GET /api/artifacts/:artifactId
GET /artifacts/runs/:runId/*
```

创建运行任务请求示例：

```json
{
  "projectId": "project_1",
  "environmentId": "env_1",
  "scopeType": "suite",
  "scopeId": "suite_1"
}
```

## 10. 执行流程

```text
前端创建运行任务
-> API 创建 test_run
-> 队列接收任务
-> Worker 标记 run 为 running
-> Worker 将套件或选中范围展开为用例
-> Runner 创建产物目录
-> Runner 生成 Midscene YAML
-> Runner 执行 Midscene
-> Runner 捕获日志和产物
-> Worker 解析结果并写入 run/case/step 记录
-> 前端通过 SSE 接收状态
-> 用户查看报告和 visual report
```

取消任务时，需要终止当前 Midscene 子进程，将未完成的 case 和 step 标记为 canceled 或 failed，并释放 Worker 资源。

## 11. 前端推荐库

```text
React Router：路由
React Query：API 数据、缓存、轮询、失效刷新
Zustand：编辑器本地状态和未保存变更
Monaco Editor：YAML 源码模式
React Hook Form + Zod：表单和 schema 校验
```

应用应该表现为一个工作型内部工具。不要做营销页风格，优先保证信息密度、可扫描性和重复操作效率。

## 12. 非功能需求

首版重点保证：

```text
可追踪：每次运行都有状态、日志、产物和错误信息。
可复现：每次运行都保存生成的 Midscene YAML。
可扩展：API、队列、执行器、DSL 转换层相互解耦。
可维护：前后端共享 schema 定义或 schema 规范。
安全边界清晰：首版仅面向内部部署。
```

性能和并发预期：

```text
单机部署
一个 Worker 或小并发 Worker
同时运行 1-3 个 Midscene 任务
本地产物存储
```

## 13. 风险与缓解

### Midscene YAML 转换错误

缓解方式：提供生成的 Midscene YAML 预览，并将生成的 YAML 保存为运行产物。

### 步骤流和源码模式产生漂移

缓解方式：两个模式都读写同一份内部 JSON schema。YAML 源码保存时必须解析并校验，通过后才能替换存储的步骤。

### AI 执行不稳定

缓解方式：支持步骤级超时、日志、截图、visual report，并在常见流程中优先使用 `aiTap`、`aiInput` 等更明确的动作。

### 取消任务后浏览器或 Node 进程残留

缓解方式：Worker 记录子进程，取消或超时时负责终止并清理资源。

### 产物增长过快

缓解方式：首版先使用本地存储，并预留按时间保留或手动清理策略。

## 14. 阶段计划

### 第一阶段：平台骨架和资产管理

```text
monorepo 搭建
前端和后端应用搭建
项目、环境、套件、用例 CRUD
项目工作台路由和布局
共享 DSL schema
YAML 源码编辑和校验
```

### 第二阶段：Midscene 执行闭环

```text
生成 Midscene YAML
后端队列和 Worker
运行单个测试用例
持久化日志和产物
报告详情页
```

### 第三阶段：批量运行和编辑体验

```text
运行整个套件
运行选中用例
步骤流编辑器
SSE 运行状态
步骤级报告映射
Midscene visual report 入口
```

### 第四阶段：增强能力

```text
运行历史筛选
报告趋势
定时任务
CI API
登录和角色权限
密钥与变量管理
多执行器
```

## 15. 成功标准

- 用户可以从前端创建项目、环境、套件、用例和步骤。
- 用户可以用步骤流模式和 YAML 源码模式编辑用例。
- 后端可以从平台 DSL 生成有效的 Midscene YAML。
- 用户可以通过后端队列运行单个 Web UI 测试用例。
- 用户可以运行整个套件或选中的多个用例。
- 每次运行都会保存日志、生成的 YAML、结构化结果数据和 visual report 链接。
- 报告页面可以展示用例级和步骤级结果。
- 项目结构支持后续扩展 CI、定时任务、认证和多执行器，而不需要重写核心架构。
