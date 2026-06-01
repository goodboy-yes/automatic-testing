import { stepSchema, type Step } from '@automatic-testing/shared';
import YAML from 'yaml';

export interface CaseDslDocument {
  name?: string;
  description?: string;
  tags?: string[];
  steps: Step[];
}

const stepsSchema = stepSchema.array();

export function serializeCaseDsl(document: CaseDslDocument): string {
  return YAML.stringify({
    name: document.name ?? '',
    description: document.description ?? '',
    tags: document.tags ?? [],
    steps: document.steps,
  });
}

export function parseCaseDsl(yamlText: string): Step[] {
  const document: unknown = YAML.parse(yamlText);
  const rawSteps = Array.isArray(document) ? document : isRecord(document) ? document.steps : undefined;
  const parsed = stepsSchema.safeParse(rawSteps);
  if (!parsed.success) {
    throw new Error('YAML 必须包含有效的 steps 数组');
  }
  return parsed.data;
}

export function parseStoredSteps(stepsJson?: string): Step[] {
  try {
    const parsedJson: unknown = JSON.parse(stepsJson ?? '[]');
    const parsed = stepsSchema.safeParse(parsedJson);
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

export function parseStoredTags(tagsJson?: string): string[] {
  try {
    const parsedJson: unknown = JSON.parse(tagsJson ?? '[]');
    return Array.isArray(parsedJson) ? parsedJson.filter((tag): tag is string => typeof tag === 'string') : [];
  } catch {
    return [];
  }
}

export type EditorStepType =
  | 'navigate'
  | 'wait'
  | 'aiTap'
  | 'aiInput'
  | 'aiAction'
  | 'aiAct'
  | 'aiAssert'
  | 'aiQuery'
  | 'aiWaitFor'
  | 'native';

export function createDefaultStep(type: EditorStepType = 'aiTap'): Step {
  return {
    id: createStepId(),
    type,
    title: defaultTitleByType[type],
    enabled: true,
    params: defaultParamsByType[type],
  };
}

export function createStepCopy(step: Step): Step {
  return {
    ...step,
    id: createStepId(),
    title: `${step.title} 副本`,
  };
}

function createStepId(): string {
  return `step_${globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const defaultTitleByType: Record<EditorStepType, string> = {
  navigate: '打开页面',
  wait: '等待',
  aiTap: '点击元素',
  aiInput: '输入内容',
  aiAction: '执行动作',
  aiAct: '执行动作',
  aiAssert: '断言',
  aiQuery: '查询',
  aiWaitFor: '等待条件',
  native: '原生动作',
};

const defaultParamsByType: Record<EditorStepType, Record<string, unknown>> = {
  navigate: { path: '/' },
  wait: { milliseconds: 1000 },
  aiTap: { locate: '' },
  aiInput: { locate: '', value: '' },
  aiAction: { prompt: '' },
  aiAct: { prompt: '' },
  aiAssert: { prompt: '' },
  aiQuery: { prompt: '' },
  aiWaitFor: { prompt: '' },
  native: { action: 'aiHover', locate: '' },
};
