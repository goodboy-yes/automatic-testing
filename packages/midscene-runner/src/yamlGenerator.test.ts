import { describe, expect, it } from 'vitest';
import { generateMidsceneYaml } from './yamlGenerator.js';
import type { Environment, TestCase } from '@automatic-testing/shared';

const environment: Environment = {
  id: 'env_1',
  projectId: 'project_1',
  name: '测试环境',
  baseUrl: 'https://example.com',
  browserType: 'chromium',
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultTimeoutMs: 10000,
  isDefault: true,
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
};

const testCase: TestCase = {
  id: 'case_1',
  projectId: 'project_1',
  suiteId: 'suite_1',
  name: '登录成功',
  description: '',
  enabled: true,
  tags: ['smoke'],
  createdAt: '2026-05-31T00:00:00.000Z',
  updatedAt: '2026-05-31T00:00:00.000Z',
  steps: [
    {
      id: 'step_1',
      type: 'navigate',
      title: '打开登录页',
      enabled: true,
      params: { path: '/login' },
    },
    {
      id: 'step_2',
      type: 'aiTap',
      title: '点击登录',
      enabled: true,
      params: { locate: '登录按钮' },
    },
    {
      id: 'step_3',
      type: 'native',
      title: '悬停头像',
      enabled: true,
      params: { action: 'aiHover', locate: '用户头像' },
    },
  ],
};

describe('generateMidsceneYaml', () => {
  it('converts platform and native steps to Midscene YAML', () => {
    const yaml = generateMidsceneYaml({ environment, testCase });

    expect(yaml).toContain('url: https://example.com/login');
    expect(yaml).toContain('viewportWidth: 1280');
    expect(yaml).toContain('aiTap: 登录按钮');
    expect(yaml).toContain('aiHover: 用户头像');
  });
});
