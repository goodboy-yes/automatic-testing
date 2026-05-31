import { z } from 'zod';

export const browserTypeSchema = z.enum(['chromium', 'firefox', 'webkit']);
export const runStatusSchema = z.enum(['pending', 'running', 'success', 'failed', 'canceled']);
export const runScopeTypeSchema = z.enum(['case', 'suite', 'selection']);

export const idSchema = z.string().min(1);

export const projectSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  description: z.string().optional().default(''),
  defaultEnvironmentId: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const environmentSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  baseUrl: z.string().url(),
  browserType: browserTypeSchema,
  viewportWidth: z.number().int().positive(),
  viewportHeight: z.number().int().positive(),
  defaultTimeoutMs: z.number().int().positive(),
  isDefault: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const testSuiteSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  name: z.string().min(1),
  description: z.string().optional().default(''),
  enabled: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const stepSchema = z.object({
  id: idSchema,
  type: z.string().min(1),
  title: z.string().min(1),
  enabled: z.boolean().default(true),
  params: z.record(z.unknown()).default({}),
  timeoutMs: z.number().int().positive().optional(),
});

export const testCaseSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  suiteId: idSchema,
  name: z.string().min(1),
  description: z.string().optional().default(''),
  enabled: z.boolean(),
  tags: z.array(z.string()).default([]),
  steps: z.array(stepSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createRunSchema = z.object({
  projectId: idSchema,
  environmentId: idSchema,
  scopeType: runScopeTypeSchema,
  scopeId: idSchema.optional(),
  caseIds: z.array(idSchema).optional(),
});
