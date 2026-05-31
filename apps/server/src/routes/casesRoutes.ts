import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import { createCaseRepository, type CreateCaseInput } from '../repositories/casesRepository.js';
import { createSuiteRepository } from '../repositories/suitesRepository.js';
import { parseRequestBody } from './validation.js';

type CreateCaseBody = Omit<CreateCaseInput, 'projectId' | 'suiteId'>;

const createCaseBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function registerCasesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const cases = createCaseRepository(db);
  const suites = createSuiteRepository(db);

  app.get<{ Params: { suiteId: string } }>('/api/suites/:suiteId/cases', async (request) =>
    cases.listBySuite(request.params.suiteId),
  );

  app.get<{ Params: { caseId: string } }>('/api/cases/:caseId', async (request, reply) => {
    const testCase = cases.findById(request.params.caseId);
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    return testCase;
  });

  app.post<{ Params: { suiteId: string }; Body: CreateCaseBody }>('/api/suites/:suiteId/cases', async (request, reply) => {
    const body = parseRequestBody(createCaseBodySchema, request.body, reply);
    if (!body) {
      return reply;
    }

    const suite = suites.findById(request.params.suiteId);
    if (!suite) {
      return reply.code(404).send({ message: 'Test suite not found' });
    }

    return reply.code(201).send(cases.create({ ...body, projectId: suite.project_id, suiteId: suite.id }));
  });
}
