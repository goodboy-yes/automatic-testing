import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database.js';
import { createCaseRepository, type CreateCaseInput } from '../repositories/casesRepository.js';

type CreateCaseBody = Omit<CreateCaseInput, 'suiteId'>;

export async function registerCasesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const cases = createCaseRepository(db);

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

  app.post<{ Params: { suiteId: string }; Body: CreateCaseBody }>('/api/suites/:suiteId/cases', async (request) =>
    cases.create({ ...request.body, suiteId: request.params.suiteId }),
  );
}
