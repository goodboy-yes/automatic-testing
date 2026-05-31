import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import { createProjectRepository } from '../repositories/projectsRepository.js';
import { createSuiteRepository, type CreateSuiteInput } from '../repositories/suitesRepository.js';
import { parseRequestBody } from './validation.js';

type CreateSuiteBody = Omit<CreateSuiteInput, 'projectId'>;

const createSuiteBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function registerSuitesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const suites = createSuiteRepository(db);
  const projects = createProjectRepository(db);

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/suites', async (request) =>
    suites.listByProject(request.params.projectId),
  );

  app.post<{ Params: { projectId: string }; Body: CreateSuiteBody }>(
    '/api/projects/:projectId/suites',
    async (request, reply) => {
      const body = parseRequestBody(createSuiteBodySchema, request.body, reply);
      if (!body) {
        return reply;
      }
      if (!projects.findById(request.params.projectId)) {
        return reply.code(404).send({ message: 'Project not found' });
      }

      return reply.code(201).send(suites.create({ ...body, projectId: request.params.projectId }));
    },
  );
}
