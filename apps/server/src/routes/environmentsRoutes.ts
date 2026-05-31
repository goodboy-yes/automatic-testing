import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import {
  createEnvironmentRepository,
  type CreateEnvironmentInput,
} from '../repositories/environmentsRepository.js';
import { createProjectRepository } from '../repositories/projectsRepository.js';
import { parseRequestBody } from './validation.js';

type CreateEnvironmentBody = Omit<CreateEnvironmentInput, 'projectId'>;

const createEnvironmentBodySchema = z.object({
  name: z.string().min(1),
  baseUrl: z.string().url(),
  browserType: z.enum(['chromium', 'firefox', 'webkit']),
  viewportWidth: z.number().int().positive(),
  viewportHeight: z.number().int().positive(),
  defaultTimeoutMs: z.number().int().positive(),
  isDefault: z.boolean(),
});

export async function registerEnvironmentsRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const environments = createEnvironmentRepository(db);
  const projects = createProjectRepository(db);

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/environments', async (request) =>
    environments.listByProject(request.params.projectId),
  );

  app.post<{ Params: { projectId: string }; Body: CreateEnvironmentBody }>(
    '/api/projects/:projectId/environments',
    async (request, reply) => {
      const body = parseRequestBody(createEnvironmentBodySchema, request.body, reply);
      if (!body) {
        return reply;
      }
      if (!projects.findById(request.params.projectId)) {
        return reply.code(404).send({ message: 'Project not found' });
      }

      return reply.code(201).send(environments.create({ ...body, projectId: request.params.projectId }));
    },
  );
}
