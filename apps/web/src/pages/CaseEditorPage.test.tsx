import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  getCase,
  previewCaseYaml,
  updateCaseSteps,
  type CaseRow,
} from '../api/cases';
import { listEnvironments, type EnvironmentRow } from '../api/environments';
import { createRun, type RunRow } from '../api/runs';
import { useCaseEditorStore } from '../stores/caseEditorStore';
import { CaseEditorPage } from './CaseEditorPage';

interface MockEditorProps {
  value?: string;
  onChange?: (value?: string) => void;
  options?: {
    readOnly?: boolean;
  };
}

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange, options }: MockEditorProps) => (
    <textarea
      aria-label={options?.readOnly ? '生成 YAML 预览' : '平台 DSL YAML'}
      readOnly={options?.readOnly}
      value={value ?? ''}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      onInput={(event) => onChange?.(event.currentTarget.value)}
    />
  ),
}));

vi.mock('../api/cases', () => ({
  getCase: vi.fn(),
  previewCaseYaml: vi.fn(),
  updateCaseSteps: vi.fn(),
}));

vi.mock('../api/environments', () => ({
  listEnvironments: vi.fn(),
}));

vi.mock('../api/runs', () => ({
  createRun: vi.fn(),
}));

const mockedNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

const mockedGetCase = vi.mocked(getCase);
const mockedCreateRun = vi.mocked(createRun);
const mockedListEnvironments = vi.mocked(listEnvironments);
const mockedPreviewCaseYaml = vi.mocked(previewCaseYaml);
const mockedUpdateCaseSteps = vi.mocked(updateCaseSteps);

describe('CaseEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useCaseEditorStore.setState({ yamlText: '', dirty: false });
    mockedGetCase.mockResolvedValue(createCaseRow());
    mockedListEnvironments.mockResolvedValue([createEnvironmentRow()]);
    mockedPreviewCaseYaml.mockResolvedValue({ yaml: 'web:\n  url: https://example.com/login\n' });
    mockedCreateRun.mockResolvedValue(createRunRow());
    mockedUpdateCaseSteps.mockResolvedValue(createCaseRow());
  });

  afterEach(() => {
    cleanup();
  });

  it('saves the loaded case definition', async () => {
    renderCaseEditorPage();

    expect((await screen.findAllByText('打开登录页'))?.[0]).toBeTruthy();
    clickButtonByText('保存用例');

    await waitFor(() => {
      const savedSteps = mockedUpdateCaseSteps.mock.calls?.[0]?.[1];
      expect(mockedUpdateCaseSteps.mock.calls?.[0]?.[0]).toBe('case_1');
      expect(savedSteps).toEqual([
        expect.objectContaining({ id: 'step_1', type: 'navigate', title: '打开登录页' }),
        expect.objectContaining({ id: 'step_2', type: 'aiTap', title: '点击登录' }),
      ]);
    });
  });

  it('applies platform DSL YAML and previews generated YAML with current steps', async () => {
    renderCaseEditorPage();

    expect((await screen.findAllByText('打开登录页'))?.[0]).toBeTruthy();
    fireEvent.click(await screen.findByRole('tab', { name: 'YAML 源码' }));
    const yamlText = [
      'steps:',
      '  - id: step_yaml',
      '    type: aiAssert',
      '    title: 检查欢迎语',
      '    enabled: true',
      '    params:',
      '      prompt: 页面展示欢迎语',
    ].join('\n');
    expect(screen.getByLabelText('平台 DSL YAML')).toBeTruthy();
    act(() => {
      useCaseEditorStore.getState()?.setYamlText(yamlText);
    });
    await waitFor(() => {
      expect((screen.getByLabelText('平台 DSL YAML') as HTMLTextAreaElement)?.value).toBe(yamlText);
    });
    clickButtonByText('应用 YAML');
    expect((await screen.findAllByText('检查欢迎语'))?.[0]).toBeTruthy();
    clickButtonByText('预览 YAML');

    await waitFor(() => {
      expect(mockedPreviewCaseYaml.mock.calls?.[0]).toEqual([
        'case_1',
        {
          environmentId: 'env_1',
          steps: [
            {
              id: 'step_yaml',
              type: 'aiAssert',
              title: '检查欢迎语',
              enabled: true,
              params: { prompt: '页面展示欢迎语' },
            },
          ],
        },
      ]);
    });
    expect(await screen.findByDisplayValue(/https:\/\/example.com\/login/)).toBeTruthy();
  });

  it('copies and deletes steps from the flow list', async () => {
    renderCaseEditorPage();

    const stepTitle = (await screen.findAllByText('点击登录'))?.[0];
    if (!stepTitle) {
      throw new Error('Step title not found');
    }
    const row = stepTitle.closest('tr');
    if (!row) {
      throw new Error('Step row not found');
    }

    clickButtonByText('复制步骤', row);
    expect((await screen.findAllByText('点击登录 副本'))?.[0]).toBeTruthy();

    const copiedStepTitle = screen.getAllByText('点击登录 副本')?.[0];
    if (!copiedStepTitle) {
      throw new Error('Copied step title not found');
    }
    const copiedRow = copiedStepTitle.closest('tr');
    if (!copiedRow) {
      throw new Error('Copied step row not found');
    }
    clickButtonByText('删除步骤', copiedRow);

    await waitFor(() => {
      expect(screen.queryAllByText('点击登录 副本')).toHaveLength(0);
    });
  });

  it('runs the saved case with the selected environment and opens its report', async () => {
    mockedCreateRun.mockResolvedValue(createRunRow({ id: 'run_case' }));
    renderCaseEditorPage();

    await screen.findByRole('heading', { name: '登录成功' });
    clickButtonByText('运行用例');

    await waitFor(() => {
      expect(mockedCreateRun.mock.calls?.[0]?.[0]).toEqual({
        projectId: 'project_1',
        environmentId: 'env_1',
        scopeType: 'case',
        scopeId: 'case_1',
      });
    });
    expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/runs/run_case');
  });

  it('disables case run while the case has unsaved step changes', async () => {
    renderCaseEditorPage();

    await screen.findByRole('heading', { name: '登录成功' });
    act(() => {
      useCaseEditorStore.getState()?.setYamlText('steps: []');
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /运行用例/ })).toHaveProperty('disabled', true);
    });
  });
});

function createCaseRow(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    id: 'case_1',
    project_id: 'project_1',
    suite_id: 'suite_1',
    name: '登录成功',
    description: '有效账号登录',
    enabled: 1,
    tags_json: JSON.stringify(['smoke']),
    steps_json: JSON.stringify([
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
    ]),
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createEnvironmentRow(overrides: Partial<EnvironmentRow> = {}): EnvironmentRow {
  return {
    id: 'env_1',
    project_id: 'project_1',
    name: '默认环境',
    base_url: 'https://example.com',
    browser_type: 'chromium',
    viewport_width: 1280,
    viewport_height: 720,
    default_timeout_ms: 10000,
    is_default: 1,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createRunRow(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: 'run_1',
    project_id: 'project_1',
    environment_id: 'env_1',
    scope_type: 'case',
    scope_id: 'case_1',
    status: 'pending',
    total_cases: 1,
    passed_cases: 0,
    failed_cases: 0,
    started_at: null,
    finished_at: null,
    duration_ms: null,
    triggered_by: null,
    created_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderCaseEditorPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/projects/project_1/cases/case_1']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/cases/:caseId" element={<CaseEditorPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function clickButtonByText(text: string, container: HTMLElement = document.body) {
  const textNode = within(container).getAllByText(text)?.[0];
  const button = textNode?.closest('button');
  if (!button) {
    throw new Error(`${text} button not found`);
  }
  fireEvent.click(button);
}
