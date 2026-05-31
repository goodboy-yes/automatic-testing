import type { z } from 'zod';
import type {
  browserTypeSchema,
  environmentSchema,
  runStatusSchema,
  stepSchema,
  testCaseSchema,
  testSuiteSchema,
  projectSchema,
} from './schemas';

export type BrowserType = z.infer<typeof browserTypeSchema>;
export type RunStatus = z.infer<typeof runStatusSchema>;
export type Project = z.infer<typeof projectSchema>;
export type Environment = z.infer<typeof environmentSchema>;
export type TestSuite = z.infer<typeof testSuiteSchema>;
export type TestCase = z.infer<typeof testCaseSchema>;
export type Step = z.infer<typeof stepSchema>;
