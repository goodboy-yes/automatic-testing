import { describe, expect, it } from 'vitest';

import { createRunSchema, projectSchema } from '../src/schemas';

const baseRunRequest = {
  projectId: 'project-1',
  environmentId: 'environment-1',
};

describe('schemas', () => {
  it('parses a project with a default description', () => {
    const project = projectSchema.parse({
      id: 'project-1',
      name: 'Demo project',
      createdAt: '2026-06-01T00:00:00.000Z',
      updatedAt: '2026-06-01T00:00:00.000Z',
    });

    expect(project.description).toBe('');
    expect(project.defaultEnvironmentId).toBeNull();
  });

  it('requires scopeId for case and suite run scopes', () => {
    expect(() =>
      createRunSchema.parse({
        ...baseRunRequest,
        scopeType: 'case',
      }),
    ).toThrow();

    expect(() =>
      createRunSchema.parse({
        ...baseRunRequest,
        scopeType: 'suite',
      }),
    ).toThrow();

    expect(
      createRunSchema.parse({
        ...baseRunRequest,
        scopeType: 'case',
        scopeId: 'case-1',
      }),
    ).toMatchObject({ scopeId: 'case-1' });
  });

  it('requires nonempty caseIds for selection run scopes', () => {
    expect(() =>
      createRunSchema.parse({
        ...baseRunRequest,
        scopeType: 'selection',
      }),
    ).toThrow();

    expect(() =>
      createRunSchema.parse({
        ...baseRunRequest,
        scopeType: 'selection',
        caseIds: [],
      }),
    ).toThrow();

    expect(
      createRunSchema.parse({
        ...baseRunRequest,
        scopeType: 'selection',
        caseIds: ['case-1'],
      }),
    ).toMatchObject({ caseIds: ['case-1'] });
  });
});
