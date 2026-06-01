import { generateMidsceneYaml } from '@automatic-testing/midscene-runner';
import { stepSchema, type Environment, type Step, type TestCase } from '@automatic-testing/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import {
  createCaseRepository,
  type CaseRow,
  type CreateCaseInput,
  type UpdateCaseInput,
} from '../repositories/casesRepository.js';
import type { EnvironmentRow } from '../repositories/environmentsRepository.js';
import { createSuiteRepository } from '../repositories/suitesRepository.js';
import { parseRequestBody } from './validation.js';

type CreateCaseBody = Omit<CreateCaseInput, 'projectId' | 'suiteId'>;
type UpdateCaseBody = UpdateCaseInput;

const createCaseBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const updateCaseBodySchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().optional(),
    enabled: z.boolean().optional(),
    tags: z.array(z.string()).optional(),
    steps: z.array(stepSchema).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

const previewYamlBodySchema = z.object({
  environmentId: z.string().min(1),
  steps: z.array(stepSchema).optional(),
});

type PreviewYamlBody = z.infer<typeof previewYamlBodySchema>;

export async function registerCasesRoutes(app: FastifyInstance, db: DatabaseConnection) {
  const cases = createCaseRepository(db);
  const suites = createSuiteRepository(db);

  app.get<{ Params: { suiteId: string } }>('/api/suites/:suiteId/cases', async (request) =>
    cases.listBySuite(request.params.suiteId),
  );

  app.get<{ Params: { caseId: string } }>('/api/cases/:caseId', async (request, reply) => {
    const testCase = cases.findById(request.params.caseId);
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    return testCase;
  });

  app.post<{ Params: { caseId: string }; Body: PreviewYamlBody }>(
    '/api/cases/:caseId/preview-midscene-yaml',
    async (request, reply) => {
      const body = parseRequestBody(previewYamlBodySchema, request.body, reply);
      if (!body) {
        return reply;
      }

      const testCaseRow = cases.findById(request.params.caseId);
      if (!testCaseRow) {
        return reply.code(404).send({ message: 'Test case not found' });
      }

      const environmentRow = db
        .prepare<[string], EnvironmentRow>('SELECT * FROM environments WHERE id = ?')
        .get(body.environmentId);
      if (!environmentRow) {
        return reply.code(404).send({ message: 'Environment not found' });
      }

      const mappedTestCase = mapTestCase(testCaseRow);
      const previewTestCase = body.steps
        ? { ...mappedTestCase, steps: body.steps.map(normalizeStep) }
        : mappedTestCase;

      return {
        yaml: generateMidsceneYaml({
          environment: mapEnvironment(environmentRow),
          testCase: previewTestCase,
        }),
      };
    },
  );

  app.post<{ Params: { suiteId: string }; Body: CreateCaseBody }>('/api/suites/:suiteId/cases', async (request, reply) => {
    const body = parseRequestBody(createCaseBodySchema, request.body, reply);
    if (!body) {
      return reply;
    }

    const suite = suites.findById(request.params.suiteId);
    if (!suite) {
      return reply.code(404).send({ message: 'Test suite not found' });
    }

    return reply.code(201).send(cases.create({ ...body, projectId: suite.project_id, suiteId: suite.id }));
  });

  app.patch<{ Params: { caseId: string }; Body: UpdateCaseBody }>('/api/cases/:caseId', async (request, reply) => {
    const body = parseRequestBody(updateCaseBodySchema, request.body, reply);
    if (!body) {
      return reply;
    }

    const testCase = cases.update(request.params.caseId, body);
    if (!testCase) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    return testCase;
  });

  app.delete<{ Params: { caseId: string } }>('/api/cases/:caseId', async (request, reply) => {
    const deleted = cases.delete(request.params.caseId);
    if (!deleted) {
      return reply.code(404).send({ message: 'Test case not found' });
    }

    return { ok: true };
  });
}

function mapEnvironment(environment: EnvironmentRow): Environment {
  return {
    id: environment.id,
    projectId: environment.project_id,
    name: environment.name,
    baseUrl: environment.base_url,
    browserType: environment.browser_type as Environment['browserType'],
    viewportWidth: environment.viewport_width,
    viewportHeight: environment.viewport_height,
    defaultTimeoutMs: environment.default_timeout_ms,
    isDefault: Boolean(environment.is_default),
    createdAt: environment.created_at,
    updatedAt: environment.updated_at,
  };
}

function mapTestCase(testCase: CaseRow): TestCase {
  return {
    id: testCase.id,
    projectId: testCase.project_id,
    suiteId: testCase.suite_id,
    name: testCase.name,
    description: testCase.description,
    enabled: Boolean(testCase.enabled),
    tags: JSON.parse(testCase.tags_json) as TestCase['tags'],
    steps: JSON.parse(testCase.steps_json) as TestCase['steps'],
    createdAt: testCase.created_at,
    updatedAt: testCase.updated_at,
  };
}

function normalizeStep(step: z.input<typeof stepSchema>): Step {
  return {
    ...step,
    enabled: step.enabled ?? true,
    params: step.params ?? {},
  };
}
