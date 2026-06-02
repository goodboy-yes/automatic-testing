import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import { getArtifactContentType, resolveRunArtifactPath } from '../artifacts/artifacts.js';
import type { DatabaseConnection } from '../db/database.js';
import { emitRunEvent, runEvents } from '../events/runEvents.js';
import type { RunQueuePort } from '../queue/runQueue.js';
import { createArtifactsRepository } from '../repositories/artifactsRepository.js';
import { createCaseRepository } from '../repositories/casesRepository.js';
import { createRunsRepository } from '../repositories/runsRepository.js';
import type { RunCancellationRegistry } from '../worker/runCancellation.js';

export async function registerRunsRoutes(
  app: FastifyInstance,
  db: DatabaseConnection,
  queue: RunQueuePort,
  artifactsDir: string,
  cancellation?: RunCancellationRegistry,
) {
  const artifacts = createArtifactsRepository(db);
  const cases = createCaseRepository(db);
  const runs = createRunsRepository(db);

  app.post<{ Params: { caseId: string } }>('/api/cases/:caseId/runs', async (request, reply) => {
    const testCase = cases.findById(request.params.caseId);
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    const run = runs.create({ caseId: testCase.id });
    queue.enqueue({ runId: run.id });
    return reply.code(201).send(run);
  });

  app.get<{ Params: { caseId: string } }>('/api/cases/:caseId/runs', async (request, reply) => {
    const testCase = cases.findById(request.params.caseId);
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    return runs.listByCase(testCase.id);
  });

  app.get<{ Params: { runId: string } }>('/api/runs/:runId', async (request, reply) => {
    const run = runs.findById(request.params.runId);
    if (!run) {
      return reply.code(404).send({ message: 'Run not found' });
    }

    return {
      run,
      artifacts: artifacts.listByRun(run.id),
    };
  });

  app.post<{ Params: { runId: string } }>('/api/runs/:runId/cancel', async (request, reply) => {
    const run = runs.findById(request.params.runId);
    if (!run) {
      return reply.code(404).send({ message: 'Run not found' });
    }

    queue.cancel?.(run.id);
    cancellation?.cancel(run.id);
    const canceledRun = runs.cancel(run.id);
    if (!canceledRun) {
      return reply.code(404).send({ message: 'Run not found' });
    }

    if (run.status !== canceledRun.status) {
      emitRunEvent({ runId: run.id, type: 'status', payload: { status: canceledRun.status } });
    }

    return canceledRun;
  });

  app.get<{ Params: { runId: string; '*': string } }>('/api/runs/:runId/artifacts/*', async (request, reply) => {
    const run = runs.findById(request.params.runId);
    if (!run) {
      return reply.code(404).send({ message: 'Run not found' });
    }

    const filePath = resolveRunArtifactPath(artifactsDir, run.id, request.params['*']);
    if (!filePath) {
      return reply.code(404).send({ message: 'Artifact not found' });
    }

    let stat: fs.Stats;
    try {
      stat = fs.statSync(filePath);
    } catch {
      return reply.code(404).send({ message: 'Artifact not found' });
    }

    if (!stat.isFile()) {
      return reply.code(404).send({ message: 'Artifact not found' });
    }

    return reply.type(getArtifactContentType(filePath)).send(fs.createReadStream(filePath));
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
