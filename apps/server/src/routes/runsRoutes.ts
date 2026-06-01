import { createRunSchema } from '@automatic-testing/shared';
import type { FastifyInstance } from 'fastify';
import type { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import { runEvents } from '../events/runEvents.js';
import type { RunQueuePort } from '../queue/runQueue.js';
import { createRunsRepository } from '../repositories/runsRepository.js';
import { parseRequestBody } from './validation.js';

type CreateRunBody = z.infer<typeof createRunSchema>;

export async function registerRunsRoutes(app: FastifyInstance, db: DatabaseConnection, queue: RunQueuePort) {
  const runs = createRunsRepository(db);

  app.post<{ Body: CreateRunBody }>('/api/runs', async (request, reply) => {
    const body = parseRequestBody(createRunSchema, request.body, reply);
    if (!body) {
      return reply;
    }

    const run = runs.create({
      projectId: body.projectId,
      environmentId: body.environmentId,
      scopeType: body.scopeType,
      scopeId: body.scopeId,
    });
    queue.enqueue({ runId: run.id });
    return reply.code(201).send(run);
  });

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/runs', async (request) =>
    runs.listByProject(request.params.projectId),
  );

  app.get<{ Params: { runId: string } }>('/api/runs/:runId', async (request, reply) => {
    const run = runs.findById(request.params.runId);
    if (!run) {
      return reply.code(404).send({ message: 'Run not found' });
    }

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
