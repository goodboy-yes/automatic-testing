import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import { createProjectRepository } from '../repositories/projectsRepository.js';
import {
  createSuiteRepository,
  type CreateSuiteInput,
  type UpdateSuiteInput,
} from '../repositories/suitesRepository.js';
import { parseRequestBody } from './validation.js';

type CreateSuiteBody = Omit<CreateSuiteInput, 'projectId'>;
type UpdateSuiteBody = UpdateSuiteInput;

const createSuiteBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateSuiteBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export async function registerSuitesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const suites = createSuiteRepository(db);
  const projects = createProjectRepository(db);

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/suites', async (request) =>
    suites.listByProject(request.params.projectId),
  );

  app.get<{ Params: { suiteId: string } }>('/api/suites/:suiteId', async (request, reply) => {
    const suite = suites.findById(request.params.suiteId);
    if (!suite) {
      return reply.code(404).send({ message: 'Test suite not found' });
    }

    return suite;
  });

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

  app.patch<{ Params: { suiteId: string }; Body: UpdateSuiteBody }>(
    '/api/suites/:suiteId',
    async (request, reply) => {
      const body = parseRequestBody(updateSuiteBodySchema, request.body, reply);
      if (!body) {
        return reply;
      }

      const suite = suites.update(request.params.suiteId, body);
      if (!suite) {
        return reply.code(404).send({ message: 'Test suite not found' });
      }

      return suite;
    },
  );

  app.delete<{ Params: { suiteId: string } }>('/api/suites/:suiteId', async (request, reply) => {
    const deleted = suites.delete(request.params.suiteId);
    if (!deleted) {
      return reply.code(404).send({ message: 'Test suite not found' });
    }

    return { ok: true };
  });
}
