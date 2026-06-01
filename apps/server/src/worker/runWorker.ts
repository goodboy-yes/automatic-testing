import {
  collectMidsceneArtifacts,
  generateMidsceneYaml,
  parseMidsceneStepResults,
  readJsonFile,
  runMidsceneYaml,
  type RunMidsceneYamlInput,
  type RunMidsceneYamlResult,
} from '@automatic-testing/midscene-runner';
import type { Environment, TestCase } from '@automatic-testing/shared';
import fs from 'node:fs';
import path from 'node:path';
import { createRunArtifactDir, writeTextArtifact } from '../artifacts/artifacts.js';
import type { DatabaseConnection } from '../db/database.js';
import { emitRunEvent } from '../events/runEvents.js';
import type { RunJob } from '../queue/runQueue.js';
import type { CaseRow } from '../repositories/casesRepository.js';
import type { EnvironmentRow } from '../repositories/environmentsRepository.js';
import { createArtifactsRepository } from '../repositories/artifactsRepository.js';
import { createRunsRepository } from '../repositories/runsRepository.js';

export type ExecuteMidscene = (input: RunMidsceneYamlInput) => Promise<RunMidsceneYamlResult>;

export interface RunWorkerOptions {
  db: DatabaseConnection;
  artifactsDir: string;
  executeMidscene?: ExecuteMidscene;
}

export class RunWorker {
  private readonly runs: ReturnType<typeof createRunsRepository>;
  private readonly artifacts: ReturnType<typeof createArtifactsRepository>;
  private readonly executeMidscene: ExecuteMidscene;

  constructor(private readonly options: RunWorkerOptions) {
    this.runs = createRunsRepository(options.db);
    this.artifacts = createArtifactsRepository(options.db);
    this.executeMidscene = options.executeMidscene ?? runMidsceneYaml;
  }

  async run(job: RunJob) {
    try {
      const queuedRun = this.runs.findById(job.runId);
      if (!queuedRun) {
        throw new Error(`Run ${job.runId} not found`);
      }
      if (queuedRun.status === 'canceled') {
        this.emitCanceled(job.runId);
        return;
      }

      this.runs.updateStatus(job.runId, 'running');
      emitRunEvent({ runId: job.runId, type: 'status', payload: { status: 'running' } });

      const run = this.runs.findById(job.runId);
      if (!run) {
        throw new Error(`Run ${job.runId} not found`);
      }

      const environment = this.options.db
        .prepare<[string], EnvironmentRow>('SELECT * FROM environments WHERE id = ?')
        .get(run.environment_id);
      if (!environment) {
        throw new Error(`Environment ${run.environment_id} not found`);
      }
      if (environment.project_id !== run.project_id) {
        throw new Error(`Environment ${run.environment_id} does not belong to project ${run.project_id}`);
      }

      const runCases = this.runs.listCases(run.id);
      if (runCases.length === 0) {
        throw new Error(`Run ${job.runId} has no runnable cases`);
      }

      const artifactDir = createRunArtifactDir(this.options.artifactsDir, job.runId);
      let passedCases = 0;
      let failedCases = 0;

      for (const [index, runCase] of runCases.entries()) {
        if (this.isCanceled(job.runId)) {
          this.emitCanceled(job.runId);
          return;
        }

        this.runs.updateRunCase(runCase.id, { status: 'running' });

        try {
          const testCase = this.options.db
            .prepare<[string], CaseRow>('SELECT * FROM test_cases WHERE id = ?')
            .get(runCase.test_case_id);
          if (!testCase) {
            throw new Error(`Test case ${runCase.test_case_id} not found`);
          }

          const mappedTestCase = mapTestCase(testCase);
          const yaml = generateMidsceneYaml({
            environment: mapEnvironment(environment),
            testCase: mappedTestCase,
          });
          const caseArtifactPath = `cases/${runCase.id}`;
          const caseOutputDir = path.join(artifactDir, caseArtifactPath);

          writeTextArtifact(artifactDir, `${caseArtifactPath}/midscene.yaml`, yaml);
          if (index === 0) {
            writeTextArtifact(artifactDir, 'midscene.yaml', yaml);
          }

          this.artifacts.create({ runId: run.id, type: 'midscene_yaml', path: 'midscene.yaml' });
          this.artifacts.create({ runId: run.id, runCaseId: runCase.id, type: 'midscene_yaml', path: `${caseArtifactPath}/midscene.yaml` });

          const execution = await this.executeMidscene({
            yamlPath: path.join(caseOutputDir, 'midscene.yaml'),
            outputDir: caseOutputDir,
          });

          writeTextArtifact(artifactDir, `${caseArtifactPath}/logs/stdout.log`, execution.stdout);
          writeTextArtifact(artifactDir, `${caseArtifactPath}/logs/stderr.log`, execution.stderr);

          const collectedArtifacts = collectMidsceneArtifacts(caseOutputDir);
          for (const artifact of collectedArtifacts) {
            this.artifacts.create({
              runId: run.id,
              runCaseId: runCase.id,
              type: artifact.type,
              path: `${caseArtifactPath}/${artifact.path}`,
            });
          }

          this.createStepsFromResultJsonOrDefinition({
            runCaseId: runCase.id,
            testCase: mappedTestCase,
            collectedArtifacts,
            caseArtifactPath,
            caseOutputDir,
            fallbackStatus: execution.status,
          });

          if (execution.status === 'success') {
            this.runs.updateRunCase(runCase.id, { status: 'success', artifactPath: caseArtifactPath });
            passedCases += 1;
          } else {
            this.runs.updateRunCase(runCase.id, {
              status: execution.status,
              errorMessage: execution.stderr || 'Midscene execution failed',
              artifactPath: caseArtifactPath,
            });
            failedCases += execution.status === 'failed' ? 1 : 0;
          }
        } catch (error) {
          failedCases += 1;
          this.runs.updateRunCase(runCase.id, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          emitRunEvent({ runId: job.runId, type: 'log', payload: { message: String(error) } });
        }
      }

      if (this.isCanceled(job.runId)) {
        this.emitCanceled(job.runId);
        return;
      }

      writeTextArtifact(artifactDir, 'logs/run.log', 'Generated Midscene YAML and structured run results.');

      const status = failedCases > 0 ? 'failed' : 'success';
      this.runs.updateTotals(job.runId, { status, passedCases, failedCases });
      emitRunEvent({ runId: job.runId, type: 'status', payload: { status } });
    } catch (error) {
      if (this.isCanceled(job.runId)) {
        this.emitCanceled(job.runId);
        return;
      }

      this.runs.updateStatus(job.runId, 'failed');
      emitRunEvent({ runId: job.runId, type: 'log', payload: { message: String(error) } });
    }
  }

  private createStepsFromResultJsonOrDefinition(input: {
    runCaseId: string;
    testCase: TestCase;
    collectedArtifacts: Array<{ type: string; path: string }>;
    caseArtifactPath: string;
    caseOutputDir: string;
    fallbackStatus: string;
  }) {
    const resultJsonArtifact = input.collectedArtifacts.find((a) => a.type === 'result_json');
    let parsedSteps: Array<{
      index: number;
      title: string;
      type: string;
      status: string;
      errorMessage: string | null;
      screenshotPath: string | null;
      rawResultJson: string;
    }> = [];

    if (resultJsonArtifact) {
      const resultData = readJsonFile(path.join(input.caseOutputDir, resultJsonArtifact.path));
      parsedSteps = parseMidsceneStepResults(resultData);
    }

    if (parsedSteps.length > 0) {
      const now = new Date().toISOString();
      for (const step of parsedSteps) {
        this.runs.createStep({
          run_case_id: input.runCaseId,
          step_id: `parsed_${step.index}`,
          step_index: step.index,
          step_title: step.title,
          step_type: step.type,
          status: step.status,
          started_at: now,
          finished_at: now,
          duration_ms: 0,
          error_message: step.errorMessage,
          screenshot_path: step.screenshotPath ? `${input.caseArtifactPath}/${step.screenshotPath}` : null,
          raw_result_json: step.rawResultJson,
        });
      }
      return;
    }

    const enabledSteps = input.testCase.steps.filter((s) => s.enabled);
    const now = new Date().toISOString();
    for (const [stepIndex, step] of enabledSteps.entries()) {
      const stepStatus = input.fallbackStatus === 'success' ? 'success' : input.fallbackStatus;
      this.runs.createStep({
        run_case_id: input.runCaseId,
        step_id: step.id,
        step_index: stepIndex,
        step_title: step.title,
        step_type: step.type,
        status: stepStatus,
        started_at: now,
        finished_at: now,
        duration_ms: 0,
        error_message: stepStatus !== 'success' ? 'Run canceled' : null,
        screenshot_path: null,
        raw_result_json: JSON.stringify({ generated: true, status: stepStatus }),
      });
    }
  }

  private isCanceled(runId: string) {
    return this.runs.findById(runId)?.status === 'canceled';
  }

  private emitCanceled(runId: string) {
    emitRunEvent({ runId, type: 'status', payload: { status: 'canceled' } });
  }
}

function mapEnvironment(environment: EnvironmentRow): Environment {
  return {
    id: environment.id,
    projectId: environment.project_id,
    name: environment.name,
    baseUrl: environment.base_url,
    browserType: environment.browser_type as Environment['browserType'],
    viewportWidth: environment.viewport_width,
    viewportHeight: environment.viewport_height,
    defaultTimeoutMs: environment.default_timeout_ms,
    isDefault: Boolean(environment.is_default),
    createdAt: environment.created_at,
    updatedAt: environment.updated_at,
  };
}

function mapTestCase(testCase: CaseRow): TestCase {
  return {
    id: testCase.id,
    projectId: testCase.project_id,
    suiteId: testCase.suite_id,
    name: testCase.name,
    description: testCase.description,
    enabled: Boolean(testCase.enabled),
    tags: JSON.parse(testCase.tags_json) as TestCase['tags'],
    steps: JSON.parse(testCase.steps_json) as TestCase['steps'],
    createdAt: testCase.created_at,
    updatedAt: testCase.updated_at,
  };
}
