import fs from 'node:fs';
import path from 'node:path';

export type MidsceneArtifactType = 'summary_json' | 'result_json' | 'visual_report' | 'screenshot' | 'log';

export interface MidsceneArtifact {
  type: MidsceneArtifactType;
  path: string;
}

export interface MidsceneStepResult {
  index: number;
  title: string;
  type: string;
  status: 'success' | 'failed';
  errorMessage: string | null;
  screenshotPath: string | null;
  rawResultJson: string;
}

export function collectMidsceneArtifacts(outputDir: string): MidsceneArtifact[] {
  const files = walkFiles(outputDir).map((filePath) => path.relative(outputDir, filePath).replace(/\\/g, '/'));
  const artifacts: MidsceneArtifact[] = [];

  for (const file of files) {
    const lower = file.toLowerCase();
    if (lower === 'summary.json' || lower === 'index.json') {
      artifacts.push({ type: 'summary_json', path: file });
    } else if (lower.endsWith('.json')) {
      artifacts.push({ type: 'result_json', path: file });
    } else if (lower.endsWith('.html')) {
      artifacts.push({ type: 'visual_report', path: file });
    } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
      artifacts.push({ type: 'screenshot', path: file });
    } else if (lower.endsWith('.log') || lower.endsWith('.txt')) {
      artifacts.push({ type: 'log', path: file });
    }
  }

  return artifacts.sort((left, right) => artifactRank(left.type) - artifactRank(right.type));
}

function walkFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(fullPath) : [fullPath];
  });
}

function artifactRank(type: MidsceneArtifactType) {
  const ranks: Record<MidsceneArtifactType, number> = {
    summary_json: 0,
    result_json: 1,
    visual_report: 2,
    screenshot: 3,
    log: 4,
  };
  return ranks[type];
}

export function parseMidsceneStepResults(result: unknown): MidsceneStepResult[] {
  const rawSteps = findStepArray(result);
  if (!rawSteps) {
    return [];
  }

  return rawSteps.map((rawStep, index) => {
    const record = isRecord(rawStep) ? rawStep : {};
    const statusText = stringValue(record.status) ?? stringValue(record.result) ?? '';
    return {
      index,
      title: stringValue(record.title) ?? stringValue(record.name) ?? `Step ${index + 1}`,
      type: stringValue(record.type) ?? stringValue(record.action) ?? 'unknown',
      status: statusText === 'failed' || statusText === 'fail' || record.error ? 'failed' : 'success',
      errorMessage: stringValue(record.error) ?? stringValue(record.errorMessage) ?? null,
      screenshotPath: stringValue(record.screenshot) ?? stringValue(record.screenshotPath) ?? null,
      rawResultJson: JSON.stringify(rawStep),
    };
  });
}

export function readJsonFile(filePath: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function findStepArray(value: unknown): unknown[] | null {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ['steps', 'tasks', 'actions']) {
    const child = value[key];
    if (Array.isArray(child)) {
      return child;
    }
  }

  for (const child of Object.values(value)) {
    const nested = findStepArray(child);
    if (nested) {
      return nested;
    }
  }

  return null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
