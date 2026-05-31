import type { z } from 'zod';
import type {
  browserTypeSchema,
  createRunSchema,
  environmentSchema,
  runStatusSchema,
  runScopeTypeSchema,
  stepSchema,
  testCaseSchema,
  testSuiteSchema,
  projectSchema,
} from './schemas.js';

export type BrowserType = z.infer<typeof browserTypeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type RunScopeType = z.infer<typeof runScopeTypeSchema>;
export type CreateRun = z.infer<typeof createRunSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type TestSuite = z.infer<typeof testSuiteSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type Step = z.infer<typeof stepSchema>;
