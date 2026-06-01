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
      if (run.scope_type !== 'case' || !run.scope_id) {
        throw new Error(`Run ${job.runId} only supports case scope in the first vertical slice`);
      }

      const environment = this.options.db
        .prepare<[string], EnvironmentRow>('SELECT * FROM environments WHERE id = ?')
        .get(run.environment_id);
      if (!environment) {
        throw new Error(`Environment ${run.environment_id} not found`);
      }

      const testCase = this.options.db
        .prepare<[string], CaseRow>('SELECT * FROM test_cases WHERE id = ?')
        .get(run.scope_id);
      if (!testCase) {
        throw new Error(`Test case ${run.scope_id} not found`);
      }

      const artifactDir = createRunArtifactDir(this.options.artifactsDir, job.runId);
      const yaml = generateMidsceneYaml({
        environment: mapEnvironment(environment),
        testCase: mapTestCase(testCase),
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
