import cors from '@fastify/cors';
import Fastify from 'fastify';
import path from 'node:path';
import type { DatabaseConnection } from './db/database.js';
import type { RunQueuePort } from './queue/runQueue.js';
import { registerCasesRoutes } from './routes/casesRoutes.js';
import { registerEnvironmentsRoutes } from './routes/environmentsRoutes.js';
import { registerProjectsRoutes } from './routes/projectsRoutes.js';
import { registerRunsRoutes } from './routes/runsRoutes.js';
import { registerSuitesRoutes } from './routes/suitesRoutes.js';
import type { RunCancellationRegistry } from './worker/runCancellation.js';

export interface BuildAppOptions {
  db: DatabaseConnection;
  runQueue?: RunQueuePort;
  artifactsDir?: string;
  cancellation?: RunCancellationRegistry;
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
  await registerRunsRoutes(
    app,
    options.db,
    options.runQueue ?? { enqueue: () => undefined },
    options.artifactsDir ?? path.resolve('artifacts'),
    options.cancellation,
  );

  return app;
}
