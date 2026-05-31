import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { DatabaseConnection } from './db/database.js';
import { registerCasesRoutes } from './routes/casesRoutes.js';
import { registerEnvironmentsRoutes } from './routes/environmentsRoutes.js';
import { registerProjectsRoutes } from './routes/projectsRoutes.js';
import { registerSuitesRoutes } from './routes/suitesRoutes.js';

export interface BuildAppOptions {
  db: DatabaseConnection;
}

export async function buildApp(options: BuildAppOptions) {
  const app = Fastify({ logger: true });

  await app.register(cors, { origin: true });

  app.get('/api/health', async () => ({
    ok: true,
    database: Boolean(options.db),
  }));

  await registerProjectsRoutes(app, options.db);
  await registerEnvironmentsRoutes(app, options.db);
  await registerSuitesRoutes(app, options.db);
  await registerCasesRoutes(app, options.db);

  return app;
}
