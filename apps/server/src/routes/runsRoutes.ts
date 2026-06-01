import { createRunSchema } from '@automatic-testing/shared';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import { getArtifactContentType, resolveRunArtifactPath } from '../artifacts/artifacts.js';
import type { DatabaseConnection } from '../db/database.js';
import { emitRunEvent, runEvents } from '../events/runEvents.js';
import type { RunQueuePort } from '../queue/runQueue.js';
import type { CaseRow } from '../repositories/casesRepository.js';
import { createArtifactsRepository } from '../repositories/artifactsRepository.js';
import { createRunsRepository } from '../repositories/runsRepository.js';
import type { RunCancellationRegistry } from '../worker/runCancellation.js';
import { parseRequestBody } from './validation.js';

type CreateRunBody = z.infer<typeof createRunSchema>;

export async function registerRunsRoutes(
  app: FastifyInstance,
  db: DatabaseConnection,
  queue: RunQueuePort,
  artifactsDir: string,
  cancellation?: RunCancellationRegistry,
) {
  const runs = createRunsRepository(db);
  const artifacts = createArtifactsRepository(db);

  app.post<{ Body: CreateRunBody }>('/api/runs', async (request, reply) => {
    const body = parseRequestBody(createRunSchema, request.body, reply);
    if (!body) {
      return reply;
    }

    if (!environmentBelongsToProject(db, body.environmentId, body.projectId)) {
      return reply.code(400).send({ message: 'Environment does not belong to project' });
    }

    const caseIds = resolveRunCaseIds(db, body);
    if (caseIds.length === 0) {
      return reply.code(400).send({ message: 'Run scope contains no runnable cases' });
    }

    const run = runs.create({
      projectId: body.projectId,
      environmentId: body.environmentId,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
      caseIds,
    });
    queue.enqueue({ runId: run.id });
    return reply.code(201).send(run);
  });

  app.get<{ Params: { projectId: string }; Querystring: { status?: string; scopeType?: string } }>('/api/projects/:projectId/runs', async (request) =>
    runs.listByProject(request.params.projectId, {
      status: request.query.status,
      scopeType: request.query.scopeType,
    }),
  );

  app.get<{ Params: { runId: string } }>('/api/runs/:runId', async (request, reply) => {
    const run = runs.findById(request.params.runId);
    if (!run) {
      return reply.code(404).send({ message: 'Run not found' });
    }

    return {
      run,
      cases: runs.listCases(run.id),
      steps: runs.listSteps(run.id),
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

function resolveRunCaseIds(db: DatabaseConnection, body: CreateRunBody): string[] {
  if (body.scopeType === 'case') {
    return findRunnableCaseById(db, body.scopeId, body.projectId) ? [body.scopeId] : [];
  }

  if (body.scopeType === 'suite') {
    return db
      .prepare<[string, string], Pick<CaseRow, 'id'>>(
        `SELECT id
         FROM test_cases
         WHERE suite_id = ? AND project_id = ? AND enabled = 1
         ORDER BY created_at ASC, id ASC`,
      )
      .all(body.scopeId, body.projectId)
      .map((testCase) => testCase.id);
  }

  const uniqueCaseIds = Array.from(new Set(body.caseIds));
  return uniqueCaseIds.filter((caseId) => Boolean(findRunnableCaseById(db, caseId, body.projectId)));
}

function findRunnableCaseById(db: DatabaseConnection, caseId: string, projectId: string): Pick<CaseRow, 'id'> | undefined {
  return db
    .prepare<[string, string], Pick<CaseRow, 'id'>>(
      'SELECT id FROM test_cases WHERE id = ? AND project_id = ? AND enabled = 1',
    )
    .get(caseId, projectId);
}

function environmentBelongsToProject(db: DatabaseConnection, environmentId: string, projectId: string) {
  return Boolean(
    db
      .prepare<[string, string], { id: string }>('SELECT id FROM environments WHERE id = ? AND project_id = ?')
      .get(environmentId, projectId),
  );
}
