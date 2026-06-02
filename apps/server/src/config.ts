import fs from 'node:fs';
import path from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  databasePath: string;
  artifactsDir: string;
  maxConcurrency: number;
}

export function loadConfig(): ServerConfig {
  loadEnvFile();

  return {
    host: process.env.HOST ?? '127.0.0.1',
    port: Number(process.env.PORT ?? 4000),
    databasePath: process.env.DATABASE_PATH ?? path.resolve('data', 'automatic-testing.sqlite'),
    artifactsDir: process.env.ARTIFACTS_DIR ?? path.resolve('artifacts'),
    maxConcurrency: Number(process.env.MAX_CONCURRENCY ?? 1),
  };
}

export function loadEnvFile(envPath: string | null | undefined = findEnvFile()): void {
  if (!envPath) {
    return;
  }

  let content: string;
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch {
    return;
  }

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    if (!isEnvKey(key) || process.env[key] !== undefined) {
      continue;
    }

    process.env[key] = parseEnvValue(line.slice(equalsIndex + 1).trim());
  }
}

function findEnvFile(startDir = process.cwd()): string | null {
  let currentDir = path.resolve(startDir);

  while (true) {
    const candidate = path.join(currentDir, '.env');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function parseEnvValue(value: string): string {
  if (value.length >= 2) {
    const first = value.at(0);
    const last = value.at(-1);
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}

function isEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}
