import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import { createProjectRepository, type CreateProjectInput } from '../repositories/projectsRepository.js';
import { parseRequestBody } from './validation.js';

const createProjectBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export async function registerProjectsRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const projects = createProjectRepository(db);

  app.get('/api/projects', async () => projects.list());

  app.post<{ Body: CreateProjectInput }>('/api/projects', async (request, reply) => {
    const body = parseRequestBody(createProjectBodySchema, request.body, reply);
    if (!body) {
      return reply;
    }

    return reply.code(201).send(projects.create(body));
  });
}
