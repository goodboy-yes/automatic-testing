import type { FastifyInstance } from 'fastify';
import type { DatabaseConnection } from '../db/database.js';
import { createProjectRepository, type CreateProjectInput } from '../repositories/projectsRepository.js';

export async function registerProjectsRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const projects = createProjectRepository(db);

  app.get('/api/projects', async () => projects.list());

  app.post<{ Body: CreateProjectInput }>('/api/projects', async (request) => projects.create(request.body));
}
