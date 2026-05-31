import YAML from 'yaml';
import type { Environment, Step, TestCase } from '@automatic-testing/shared';

export interface GenerateMidsceneYamlInput {
  environment: Environment;
  testCase: TestCase;
}

type MidsceneTask = Record<string, unknown>;

export function generateMidsceneYaml(input: GenerateMidsceneYamlInput): string {
  const { environment, testCase } = input;
  const tasks = testCase.steps.filter((step) => step.enabled).map(convertStep);

  return YAML.stringify({
    web: {
      url: buildUrl(environment.baseUrl, findInitialPath(testCase.steps)),
      viewportWidth: environment.viewportWidth,
      viewportHeight: environment.viewportHeight,
    },
    tasks,
  });
}

function findInitialPath(steps: Step[]): string {
  const navigateStep = steps.find((step) => step.enabled && step.type === 'navigate');
  const path = navigateStep?.params.path;
  return typeof path === 'string' ? path : '/';
}

function buildUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, '');
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

function convertStep(step: Step): MidsceneTask {
  if (step.type === 'navigate') {
    return { sleep: 0 };
  }

  if (step.type === 'wait') {
    const milliseconds = Number(step.params.milliseconds ?? step.params.ms ?? 1000);
    return { sleep: milliseconds };
  }

  if (step.type === 'native') {
    const action = step.params.action;
    if (typeof action !== 'string' || action.length === 0) {
      throw new Error(`Native step ${step.id} requires params.action`);
    }
    const { action: _action, ...rest } = step.params;
    return buildActionTask(action, rest);
  }

  return buildActionTask(step.type, step.params);
}

function buildActionTask(action: string, params: Record<string, unknown>): MidsceneTask {
  if ('prompt' in params && typeof params.prompt === 'string') {
    return { [action]: params.prompt };
  }

  if ('locate' in params && typeof params.locate === 'string') {
    return { [action]: params.locate };
  }

  return { [action]: params };
}
