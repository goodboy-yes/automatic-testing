import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadEnvFile } from './config.js';

const tempDirs: string[] = [];
const originalMidsceneModelName = process.env.MIDSCENE_MODEL_NAME;
const originalMidsceneApiKey = process.env.MIDSCENE_MODEL_API_KEY;

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  restoreEnvValue('MIDSCENE_MODEL_NAME', originalMidsceneModelName);
  restoreEnvValue('MIDSCENE_MODEL_API_KEY', originalMidsceneApiKey);
});

describe('loadEnvFile', () => {
  it('loads key values from an env file without overwriting existing variables', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'automatic-testing-env-'));
    tempDirs.push(dir);
    const envPath = path.join(dir, '.env');
    fs.writeFileSync(
      envPath,
      [
        '# Midscene model config',
        'MIDSCENE_MODEL_NAME="gpt-4o"',
        'MIDSCENE_MODEL_API_KEY=from-file',
        '',
      ].join('\n'),
      'utf8',
    );
    process.env.MIDSCENE_MODEL_API_KEY = 'already-set';
    delete process.env.MIDSCENE_MODEL_NAME;

    loadEnvFile(envPath);

    expect(process.env.MIDSCENE_MODEL_NAME).toBe('gpt-4o');
    expect(process.env.MIDSCENE_MODEL_API_KEY).toBe('already-set');
  });
});

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
