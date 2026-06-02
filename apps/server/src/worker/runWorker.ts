import {
  collectMidsceneArtifacts,
  readJsonFile,
  type MidsceneArtifact,
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
      const collectedArtifacts = this.persistCollectedArtifacts(run.id, artifactDir);

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
        errorMessage: status === 'failed' ? this.getFailureMessage(artifactDir, collectedArtifacts, execution) : null,
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
    const collectedArtifacts = collectMidsceneArtifacts(artifactDir);
    for (const artifact of collectedArtifacts) {
      if (existingPaths.has(artifact.path)) {
        continue;
      }
      this.artifacts.create({ runId, type: artifact.type, path: artifact.path });
    }
    return collectedArtifacts;
  }

  private getFailureMessage(
    artifactDir: string,
    artifacts: MidsceneArtifact[],
    execution: RunMidsceneYamlResult,
  ): string {
    for (const artifact of artifacts) {
      if (artifact.type !== 'summary_json') {
        continue;
      }
      const error = extractMidsceneSummaryError(readJsonFile(path.join(artifactDir, artifact.path)));
      if (error) {
        return error;
      }
    }

    return execution.stderr.trim() || 'Midscene execution failed';
  }

  private emitCanceled(runId: string) {
    emitRunEvent({ runId, type: 'status', payload: { status: 'canceled' } });
  }
}

function extractMidsceneSummaryError(summary: unknown): string | null {
  if (!isRecord(summary)) {
    return null;
  }

  const directError = stringValue(summary.error) ?? stringValue(summary.errorMessage) ?? stringValue(summary.message);
  if (directError) {
    return directError;
  }

  const results = summary.results;
  if (!Array.isArray(results)) {
    return null;
  }

  for (const result of results) {
    if (!isRecord(result)) {
      continue;
    }
    const resultError = stringValue(result.error) ?? stringValue(result.errorMessage) ?? stringValue(result.message);
    if (resultError) {
      return resultError;
    }
  }

  return null;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
