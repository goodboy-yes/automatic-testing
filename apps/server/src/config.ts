import path from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  artifactsDir: string;
  maxConcurrency: number;
}

export function loadConfig(): ServerConfig {
  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4000),
    databasePath: process.env.DATABASE_PATH ?? path.resolve('data', 'automatic-testing.sqlite'),
    artifactsDir: process.env.ARTIFACTS_DIR ?? path.resolve('artifacts'),
    maxConcurrency: Number(process.env.MAX_CONCURRENCY ?? 1),
  };
}
