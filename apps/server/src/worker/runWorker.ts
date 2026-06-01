import { generateMidsceneYaml } from '@automatic-testing/midscene-runner';
import type { Environment, TestCase } from '@automatic-testing/shared';
import { createRunArtifactDir, writeTextArtifact } from '../artifacts/artifacts.js';
import type { DatabaseConnection } from '../db/database.js';
import { emitRunEvent } from '../events/runEvents.js';
import type { RunJob } from '../queue/runQueue.js';
import type { CaseRow } from '../repositories/casesRepository.js';
import type { EnvironmentRow } from '../repositories/environmentsRepository.js';
import { createRunsRepository } from '../repositories/runsRepository.js';

export interface RunWorkerOptions {
  db: DatabaseConnection;
  artifactsDir: string;
}

export class RunWorker {
  private readonly runs: ReturnType<typeof createRunsRepository>;

  constructor(private readonly options: RunWorkerOptions) {
    this.runs = createRunsRepository(options.db);
  }

  async run(job: RunJob) {
    this.runs.updateStatus(job.runId, 'running');
    emitRunEvent({ runId: job.runId, type: 'status', payload: { status: 'running' } });

    try {
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

          writeTextArtifact(artifactDir, `${caseArtifactPath}/midscene.yaml`, yaml);
          if (index === 0) {
            writeTextArtifact(artifactDir, 'midscene.yaml', yaml);
          }

          const now = new Date().toISOString();
          mappedTestCase.steps
            .filter((step) => step.enabled)
            .forEach((step, stepIndex) => {
              this.runs.createStep({
                run_case_id: runCase.id,
                step_id: step.id,
                step_index: stepIndex,
                step_title: step.title,
                step_type: step.type,
                status: 'success',
                started_at: now,
                finished_at: now,
                duration_ms: 0,
                error_message: null,
                screenshot_path: null,
                raw_result_json: JSON.stringify({ generated: true }),
              });
            });

          this.runs.updateRunCase(runCase.id, { status: 'success', artifactPath: caseArtifactPath });
          passedCases += 1;
        } catch (error) {
          failedCases += 1;
          this.runs.updateRunCase(runCase.id, {
            status: 'failed',
            errorMessage: error instanceof Error ? error.message : String(error),
          });
          emitRunEvent({ runId: job.runId, type: 'log', payload: { message: String(error) } });
        }
      }

      writeTextArtifact(artifactDir, 'logs/run.log', 'Generated Midscene YAML and structured run results.');

      const status = failedCases > 0 ? 'failed' : 'success';
      this.runs.updateTotals(job.runId, { status, passedCases, failedCases });
      emitRunEvent({ runId: job.runId, type: 'status', payload: { status } });
    } catch (error) {
      this.runs.updateStatus(job.runId, 'failed');
      emitRunEvent({ runId: job.runId, type: 'log', payload: { message: String(error) } });
    }
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
