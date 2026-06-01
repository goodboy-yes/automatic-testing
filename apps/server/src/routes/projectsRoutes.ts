import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import {
  createProjectRepository,
  type CreateProjectInput,
  type UpdateProjectInput,
} from '../repositories/projectsRepository.js';
import { parseRequestBody } from './validation.js';

const createProjectBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateProjectBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
  })
  .refine((value) => value.name !== undefined || value.description !== undefined);

export async function registerProjectsRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const projects = createProjectRepository(db);

  app.get('/api/projects', async () => projects.list());

  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId', async (request, reply) => {
    const project = projects.findById(request.params.projectId);
    if (!project) {
      return reply.code(404).send({ message: 'Project not found' });
    }

    return project;
  });

  app.post<{ Body: CreateProjectInput }>('/api/projects', async (request, reply) => {
    const body = parseRequestBody(createProjectBodySchema, request.body, reply);
    if (!body) {
      return reply;
    }

    return reply.code(201).send(projects.create(body));
  });

  app.patch<{ Params: { projectId: string }; Body: UpdateProjectInput }>(
    '/api/projects/:projectId',
    async (request, reply) => {
      const body = parseRequestBody(updateProjectBodySchema, request.body, reply);
      if (!body) {
        return reply;
      }

      const project = projects.update(request.params.projectId, body);
      if (!project) {
        return reply.code(404).send({ message: 'Project not found' });
      }

      return project;
    },
  );

  app.delete<{ Params: { projectId: string } }>('/api/projects/:projectId', async (request, reply) => {
    const deleted = projects.delete(request.params.projectId);
    if (!deleted) {
      return reply.code(404).send({ message: 'Project not found' });
    }

    return { ok: true };
  });
}
