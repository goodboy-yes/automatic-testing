import type { z } from 'zod';
import type {
  artifactTypeSchema,
  createCaseSchema,
  runArtifactSchema,
  runStatusSchema,
  testCaseSchema,
  testRunSchema,
  updateCaseSchema,
} from './schemas.js';

export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type CreateCase = z.infer<typeof createCaseSchema>;
export type UpdateCase = z.infer<typeof updateCaseSchema>;
export type TestRun = z.infer<typeof testRunSchema>;
export type RunArtifact = z.infer<typeof runArtifactSchema>;
