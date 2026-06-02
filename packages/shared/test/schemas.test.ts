import { describe, expect, it } from 'vitest';
import { createCaseSchema, runArtifactSchema, testRunSchema, updateCaseSchema } from '../src/schemas';

describe('schemas', () => {
  it('parses a YAML case creation request', () => {
    const parsed = createCaseSchema.parse({
      name: ' 登录成功 ',
      yamlText: 'web:\n  url: https://example.com\n',
    });

    expect(parsed).toEqual({
      name: '登录成功',
      description: '',
      yamlText: 'web:\n  url: https://example.com',
    });
  });

  it('requires at least one field for case updates', () => {
    expect(() => updateCaseSchema.parse({})).toThrow();
    expect(updateCaseSchema.parse({ description: '更新描述' })).toEqual({ description: '更新描述' });
  });

  it('parses simplified run and artifact records', () => {
    expect(
      testRunSchema.parse({
        id: 'run_1',
        caseId: 'case_1',
        status: 'success',
        exitCode: 0,
        errorMessage: null,
        startedAt: '2026-06-01T00:00:00.000Z',
        finishedAt: '2026-06-01T00:00:01.000Z',
        durationMs: 1000,
        createdAt: '2026-06-01T00:00:00.000Z',
      }),
    ).toMatchObject({ status: 'success', exitCode: 0 });

    expect(
      runArtifactSchema.parse({
        id: 'artifact_1',
        runId: 'run_1',
        type: 'visual_report',
        path: 'visual-report.html',
        createdAt: '2026-06-01T00:00:01.000Z',
      }),
    ).toMatchObject({ type: 'visual_report' });
  });
});
