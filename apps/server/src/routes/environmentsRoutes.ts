import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database.js';
import {
  createEnvironmentRepository,
  type CreateEnvironmentInput,
} from '../repositories/environmentsRepository.js';

type CreateEnvironmentBody = Omit<CreateEnvironmentInput, 'projectId'>;

export async function registerEnvironmentsRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const environments = createEnvironmentRepository(db);

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/environments', async (request) =>
    environments.listByProject(request.params.projectId),
  );

  app.post<{ Params: { projectId: string }; Body: CreateEnvironmentBody }>(
    '/api/projects/:projectId/environments',
    async (request) => environments.create({ ...request.body, projectId: request.params.projectId }),
  );
}
