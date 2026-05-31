import cors from '@fastify/cors';
import Fastify from 'fastify';
import type { DatabaseConnection } from './db/database.js';

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

  return app;
}
