import { z } from 'zod';

export const idSchema = z.string().min(1);
export const runStatusSchema = z.enum(['pending', 'running', 'success', 'failed', 'canceled']);
export const artifactTypeSchema = z.enum([
  'midscene_yaml',
  'summary_json',
  'result_json',
  'visual_report',
  'screenshot',
  'log',
]);

export const testCaseSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1),
  description: z.string().default(''),
  yamlText: z.string().trim().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const createCaseSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional().default(''),
  yamlText: z.string().trim().min(1),
});

export const updateCaseSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    yamlText: z.string().trim().min(1).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const testRunSchema = z.object({
  id: idSchema,
  caseId: idSchema,
  status: runStatusSchema,
  exitCode: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  finishedAt: z.string().nullable(),
  durationMs: z.number().int().nullable(),
  createdAt: z.string(),
});

export const runArtifactSchema = z.object({
  id: idSchema,
  runId: idSchema,
  type: artifactTypeSchema,
  path: z.string().min(1),
  createdAt: z.string(),
});
