import cors from '@fastify/cors';
import Fastify from 'fastify';
import path from 'node:path';
import type { DatabaseConnection } from './db/database.js';
import type { RunQueuePort } from './queue/runQueue.js';
import { registerCasesRoutes } from './routes/casesRoutes.js';
import { registerRunsRoutes } from './routes/runsRoutes.js';
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

  const artifactsDir = options.artifactsDir ?? path.resolve('artifacts');
  const runQueue = options.runQueue ?? { enqueue: () => undefined };

  await registerCasesRoutes(app, options.db, artifactsDir, runQueue, options.cancellation);
  await registerRunsRoutes(
    app,
    options.db,
    runQueue,
    artifactsDir,
    options.cancellation,
  );

  return app;
}
