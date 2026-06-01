import fs from 'node:fs';
import path from 'node:path';

export function createRunArtifactDir(artifactsDir: string, runId: string): string {
  const dir = path.resolve(artifactsDir, 'runs', runId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeTextArtifact(dir: string, filename: string, content: string): string {
  const filePath = path.resolve(dir, filename);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  return filePath;
}

export function resolveRunArtifactPath(artifactsDir: string, runId: string, relativePath: string): string | null {
  if (!relativePath || path.isAbsolute(relativePath)) {
    return null;
  }

  const runArtifactDir = path.resolve(artifactsDir, 'runs', runId);
  const filePath = path.resolve(runArtifactDir, relativePath);
  const relativeToRunDir = path.relative(runArtifactDir, filePath);

  if (relativeToRunDir.startsWith('..') || path.isAbsolute(relativeToRunDir)) {
    return null;
  }

  return filePath;
}

export function getArtifactContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.yaml' || extension === '.yml' || extension === '.log' || extension === '.txt') {
    return 'text/plain; charset=utf-8';
  }
  if (extension === '.json') {
    return 'application/json; charset=utf-8';
  }
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return 'image/jpeg';
  }
  if (extension === '.html') {
    return 'text/html; charset=utf-8';
  }

  return 'application/octet-stream';
}
