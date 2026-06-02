import type { FastifyInstance, FastifyReply } from 'fastify';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import type { RunQueuePort } from '../queue/runQueue.js';
import { createCaseRepository, type CreateCaseInput, type UpdateCaseInput } from '../repositories/casesRepository.js';
import { createRunsRepository } from '../repositories/runsRepository.js';
import type { RunCancellationRegistry } from '../worker/runCancellation.js';
import { parseRequestBody } from './validation.js';

type CreateCaseBody = CreateCaseInput;
type UpdateCaseBody = UpdateCaseInput;

const createCaseBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  yamlText: z.string().min(1),
});

const updateCaseBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    yamlText: z.string().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function registerCasesRoutes(
  app: FastifyInstance,
  db: DatabaseConnection,
  artifactsDir: string,
  queue?: RunQueuePort,
  cancellation?: RunCancellationRegistry,
) {
  const cases = createCaseRepository(db);
  const runs = createRunsRepository(db);

  app.get('/api/cases', async () => cases.list());

  app.post<{ Body: CreateCaseBody }>('/api/cases', async (request, reply) => {
    const body = parseRequestBody(createCaseBodySchema, request.body, reply);
    if (!body || !validateYamlText(body.yamlText, reply)) {
      return reply;
    }

    return reply.code(201).send(cases.create(normalizeCaseInput(body)));
  });

  app.get<{ Params: { caseId: string } }>('/api/cases/:caseId', async (request, reply) => {
    const testCase = cases.findById(request.params.caseId);
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    return testCase;
  });

  app.patch<{ Params: { caseId: string }; Body: UpdateCaseBody }>('/api/cases/:caseId', async (request, reply) => {
    const body = parseRequestBody(updateCaseBodySchema, request.body, reply);
    if (!body) {
      return reply;
    }
    if (body.yamlText !== undefined && !validateYamlText(body.yamlText, reply)) {
      return reply;
    }

    const testCase = cases.update(request.params.caseId, normalizeCaseInput(body));
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    return testCase;
  });

  app.delete<{ Params: { caseId: string } }>('/api/cases/:caseId', async (request, reply) => {
    const testCase = cases.findById(request.params.caseId);
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    const caseRuns = runs.listByCase(testCase.id);
    for (const run of caseRuns) {
      queue?.cancel?.(run.id);
      cancellation?.cancel(run.id);
    }

    const deleted = cases.delete(testCase.id);
    if (!deleted) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    for (const run of caseRuns) {
      fs.rmSync(path.resolve(artifactsDir, 'runs', run.id), { recursive: true, force: true });
    }

    return { ok: true };
  });
}

function normalizeCaseInput<T extends CreateCaseInput | UpdateCaseInput>(input: T): T {
  return {
    ...input,
    name: input.name?.trim(),
    description: input.description?.trim(),
  };
}

function validateYamlText(yamlText: string, reply: FastifyReply) {
  if (!yamlText?.trim()) {
    reply.code(400).send({ message: 'YAML must not be empty' });
    return false;
  }

  try {
    YAML.parse(yamlText);
    return true;
  } catch {
    reply.code(400).send({ message: 'Invalid YAML' });
    return false;
  }
}
