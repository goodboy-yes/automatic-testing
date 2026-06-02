import {
  collectMidsceneArtifacts,
  runMidsceneYaml,
  type RunMidsceneYamlInput,
  type RunMidsceneYamlResult,
} from '@automatic-testing/midscene-runner';
import path from 'node:path';
import { createRunArtifactDir, writeTextArtifact } from '../artifacts/artifacts.js';
import type { DatabaseConnection } from '../db/database.js';
import { emitRunEvent } from '../events/runEvents.js';
import type { RunJob } from '../queue/runQueue.js';
import { createArtifactsRepository } from '../repositories/artifactsRepository.js';
import { createCaseRepository } from '../repositories/casesRepository.js';
import { createRunsRepository } from '../repositories/runsRepository.js';
import type { RunCancellationRegistry } from './runCancellation.js';

export type ExecuteMidscene = (input: RunMidsceneYamlInput) => Promise<RunMidsceneYamlResult>;

export interface RunWorkerOptions {
  db: DatabaseConnection;
  artifactsDir: string;
  executeMidscene?: ExecuteMidscene;
  cancellation?: RunCancellationRegistry;
}

export class RunWorker {
  private readonly artifacts: ReturnType<typeof createArtifactsRepository>;
  private readonly cases: ReturnType<typeof createCaseRepository>;
  private readonly executeMidscene: ExecuteMidscene;
  private readonly runs: ReturnType<typeof createRunsRepository>;

  constructor(private readonly options: RunWorkerOptions) {
    this.artifacts = createArtifactsRepository(options.db);
    this.cases = createCaseRepository(options.db);
    this.executeMidscene = options.executeMidscene ?? runMidsceneYaml;
    this.runs = createRunsRepository(options.db);
  }

  async run(job: RunJob) {
    const controller = this.options.cancellation?.register(job.runId) ?? new AbortController();
    try {
      const queuedRun = this.runs.findById(job.runId);
      if (!queuedRun) {
        throw new Error(`Run ${job.runId} not found`);
      }
      if (queuedRun.status === 'canceled') {
        this.emitCanceled(job.runId);
        return;
      }

      this.runs.updateStatus(job.runId, { status: 'running' });
      emitRunEvent({ runId: job.runId, type: 'status', payload: { status: 'running' } });

      const run = this.runs.findById(job.runId);
      if (!run) {
        throw new Error(`Run ${job.runId} not found`);
      }

      const testCase = this.cases.findById(run.case_id);
      if (!testCase) {
        throw new Error(`Test case ${run.case_id} not found`);
      }

      const artifactDir = createRunArtifactDir(this.options.artifactsDir, job.runId);
      writeTextArtifact(artifactDir, 'midscene.yaml', testCase.yaml_text);
      this.artifacts.create({ runId: run.id, type: 'midscene_yaml', path: 'midscene.yaml' });

      const execution = await this.executeMidscene({
        yamlPath: path.join(artifactDir, 'midscene.yaml'),
        outputDir: artifactDir,
        signal: controller.signal,
      });

      writeTextArtifact(artifactDir, 'logs/stdout.log', execution.stdout);
      writeTextArtifact(artifactDir, 'logs/stderr.log', execution.stderr);
      this.persistCollectedArtifacts(run.id, artifactDir);

      if (execution.status === 'canceled') {
        this.runs.updateStatus(job.runId, {
          status: 'canceled',
          exitCode: execution.exitCode,
          errorMessage: 'Run canceled',
        });
        this.emitCanceled(job.runId);
        return;
      }

      const status = execution.status === 'success' ? 'success' : 'failed';
      this.runs.updateStatus(job.runId, {
        status,
        exitCode: execution.exitCode,
        errorMessage: status === 'failed' ? execution.stderr || 'Midscene execution failed' : null,
      });
      emitRunEvent({ runId: job.runId, type: 'status', payload: { status } });
    } catch (error) {
      if (this.runs.findById(job.runId)?.status === 'canceled') {
        this.emitCanceled(job.runId);
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      this.runs.updateStatus(job.runId, { status: 'failed', exitCode: null, errorMessage: message });
      emitRunEvent({ runId: job.runId, type: 'log', payload: { message } });
      emitRunEvent({ runId: job.runId, type: 'status', payload: { status: 'failed' } });
    } finally {
      this.options.cancellation?.unregister(job.runId);
    }
  }

  private persistCollectedArtifacts(runId: string, artifactDir: string) {
    const existingPaths = new Set(this.artifacts.listByRun(runId).map((artifact) => artifact.path));
    for (const artifact of collectMidsceneArtifacts(artifactDir)) {
      if (existingPaths.has(artifact.path)) {
        continue;
      }
      this.artifacts.create({ runId, type: artifact.type, path: artifact.path });
    }
  }

  private emitCanceled(runId: string) {
    emitRunEvent({ runId, type: 'status', payload: { status: 'canceled' } });
  }
}
