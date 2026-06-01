import { generateMidsceneYaml } from '@automatic-testing/midscene-runner';
import type { Environment, TestCase } from '@automatic-testing/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { DatabaseConnection } from '../db/database.js';
import { createCaseRepository, type CaseRow, type CreateCaseInput } from '../repositories/casesRepository.js';
import type { EnvironmentRow } from '../repositories/environmentsRepository.js';
import { createSuiteRepository } from '../repositories/suitesRepository.js';
import { parseRequestBody } from './validation.js';

type CreateCaseBody = Omit<CreateCaseInput, 'projectId' | 'suiteId'>;

const createCaseBodySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

const previewYamlBodySchema = z.object({
  environmentId: z.string().min(1),
});

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

  app.post<{ Params: { caseId: string }; Body: { environmentId: string } }>(
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

      return {
        yaml: generateMidsceneYaml({
          environment: mapEnvironment(environmentRow),
          testCase: mapTestCase(testCaseRow),
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
