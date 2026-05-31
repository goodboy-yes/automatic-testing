import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database.js';
import { createSuiteRepository, type CreateSuiteInput } from '../repositories/suitesRepository.js';

type CreateSuiteBody = Omit<CreateSuiteInput, 'projectId'>;

export async function registerSuitesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const suites = createSuiteRepository(db);

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/suites', async (request) =>
    suites.listByProject(request.params.projectId),
  );

  app.post<{ Params: { projectId: string }; Body: CreateSuiteBody }>(
    '/api/projects/:projectId/suites',
    async (request) => suites.create({ ...request.body, projectId: request.params.projectId }),
  );
}
