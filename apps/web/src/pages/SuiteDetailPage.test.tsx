import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  createCase,
  deleteCase,
  listCases,
  updateCase,
  type CaseRow,
} from '../api/cases';
import { listEnvironments, type EnvironmentRow } from '../api/environments';
import { createRun, type RunRow } from '../api/runs';
import { getSuite, type SuiteRow } from '../api/suites';
import { SuiteDetailPage } from './SuiteDetailPage';

vi.mock('../api/cases', () => ({
  createCase: vi.fn(),
  deleteCase: vi.fn(),
  listCases: vi.fn(),
  updateCase: vi.fn(),
}));

vi.mock('../api/suites', () => ({
  getSuite: vi.fn(),
}));

vi.mock('../api/environments', () => ({
  listEnvironments: vi.fn(),
}));

vi.mock('../api/runs', () => ({
  createRun: vi.fn(),
}));

const mockedCreateCase = vi.mocked(createCase);
const mockedDeleteCase = vi.mocked(deleteCase);
const mockedCreateRun = vi.mocked(createRun);
const mockedListEnvironments = vi.mocked(listEnvironments);
const mockedGetSuite = vi.mocked(getSuite);
const mockedListCases = vi.mocked(listCases);
const mockedUpdateCase = vi.mocked(updateCase);
const mockedNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('SuiteDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetSuite.mockResolvedValue(createSuiteRow());
    mockedListEnvironments.mockResolvedValue([createEnvironmentRow()]);
    mockedListCases.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders suite title and case rows with tags', async () => {
    mockedListCases.mockResolvedValue([
      createCaseRow({ name: '登录成功', description: '有效账号登录', tags_json: JSON.stringify(['smoke']) }),
    ]);

    renderSuiteDetailPage();

    expect(await screen.findByRole('heading', { name: '冒烟测试' })).toBeTruthy();
    expect(screen.getByText('登录成功')).toBeTruthy();
    expect(screen.getByText('有效账号登录')).toBeTruthy();
    expect(screen.getByText('smoke')).toBeTruthy();
    expect(screen.getByText('启用')).toBeTruthy();
  });

  it('creates a case and navigates into its editor', async () => {
    mockedCreateCase.mockResolvedValue(createCaseRow({ id: 'case_2', name: '登录失败提示' }));

    renderSuiteDetailPage();

    await userEvent.click(await screen.findByRole('button', { name: /新建用例/ }));
    const dialog = await screen.findByRole('dialog', { name: '新建用例' });
    await userEvent.type(within(dialog).getByLabelText('用例名称'), '登录失败提示');
    await userEvent.type(within(dialog).getByLabelText('描述'), '校验错误提示');
    await userEvent.click(within(dialog).getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => {
      expect(mockedCreateCase.mock.calls?.[0]).toEqual([
        'suite_1',
        { name: '登录失败提示', description: '校验错误提示' },
      ]);
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/cases/case_2');
    });
  });

  it('navigates into an existing case editor from the list', async () => {
    mockedListCases.mockResolvedValue([createCaseRow({ name: '登录成功' })]);

    renderSuiteDetailPage();

    const caseName = await screen.findByText('登录成功');
    const row = caseName.closest('tr');
    if (!row) {
      throw new Error('Case row not found');
    }

    await userEvent.click(within(row).getByRole('button', { name: '编辑步骤' }));

    expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/cases/case_1');
  });

  it('edits case metadata and tags', async () => {
    mockedListCases.mockResolvedValue([
      createCaseRow({ name: '旧用例', description: '旧描述', tags_json: JSON.stringify(['smoke']), enabled: 1 }),
    ]);
    mockedUpdateCase.mockResolvedValue(
      createCaseRow({
        name: '新用例',
        description: '新描述',
        tags_json: JSON.stringify(['regression', 'login']),
        enabled: 1,
      }),
    );

    renderSuiteDetailPage();

    await userEvent.click(await screen.findByRole('button', { name: '编辑用例' }));
    const dialog = await screen.findByRole('dialog', { name: '编辑用例' });
    await userEvent.clear(within(dialog).getByLabelText('用例名称'));
    await userEvent.type(within(dialog).getByLabelText('用例名称'), '新用例');
    await userEvent.clear(within(dialog).getByLabelText('描述'));
    await userEvent.type(within(dialog).getByLabelText('描述'), '新描述');
    await userEvent.clear(within(dialog).getByLabelText('标签'));
    await userEvent.type(within(dialog).getByLabelText('标签'), 'regression, login');
    await userEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      expect(mockedUpdateCase.mock.calls?.[0]).toEqual([
        'case_1',
        {
          name: '新用例',
          description: '新描述',
          enabled: true,
          tags: ['regression', 'login'],
        },
      ]);
    });
  });

  it('deletes a case after confirmation', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockReturnValue({
      destroy: vi.fn(),
      update: vi.fn(),
    });
    mockedListCases.mockResolvedValue([createCaseRow({ name: '待删除用例' })]);
    mockedDeleteCase.mockResolvedValue({ ok: true });

    renderSuiteDetailPage();

    await userEvent.click(await screen.findByRole('button', { name: '删除用例' }));
    const confirmOptions = confirmSpy.mock.calls?.[0]?.[0];
    if (!confirmOptions?.onOk) {
      throw new Error('Delete confirmation handler not found');
    }
    confirmOptions.onOk();

    await waitFor(() => {
      expect(mockedDeleteCase.mock.calls?.[0]?.[0]).toBe('case_1');
    });
    confirmSpy.mockRestore();
  });

  it('clears selected case ids when a selected case is deleted', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockReturnValue({
      destroy: vi.fn(),
      update: vi.fn(),
    });
    mockedListCases
      .mockResolvedValueOnce([createCaseRow({ name: '待删除用例' })])
      .mockResolvedValueOnce([]);
    mockedDeleteCase.mockResolvedValue({ ok: true });

    renderSuiteDetailPage();

    const caseName = await screen.findByText('待删除用例');
    const row = caseName.closest('tr');
    if (!row) {
      throw new Error('Case row not found');
    }
    const runSelectedButton = screen.getByRole('button', { name: /运行选中/ });
    await userEvent.click(within(row).getByRole('checkbox'));
    expect(await screen.findByText('已选择 1 个用例')).toBeTruthy();

    await userEvent.click(within(row).getByRole('button', { name: '删除用例' }));
    const confirmOptions = confirmSpy.mock.calls?.[0]?.[0];
    if (!confirmOptions?.onOk) {
      throw new Error('Delete confirmation handler not found');
    }
    confirmOptions.onOk();

    await waitFor(() => {
      expect(screen.queryByText('已选择 1 个用例')).toBeNull();
      expect(runSelectedButton).toHaveProperty('disabled', true);
    });
    confirmSpy.mockRestore();
  });

  it('enables selected-case run controls after selecting rows', async () => {
    mockedListCases.mockResolvedValue([createCaseRow({ name: '可选用例' })]);

    renderSuiteDetailPage();

    const caseName = await screen.findByText('可选用例');
    const row = caseName.closest('tr');
    if (!row) {
      throw new Error('Case row not found');
    }
    const runSelectedButton = screen.getByRole('button', { name: /运行选中/ });
    expect(runSelectedButton).toHaveProperty('disabled', true);

    await userEvent.click(within(row).getByRole('checkbox'));

    expect(await screen.findByText('已选择 1 个用例')).toBeTruthy();
    expect(runSelectedButton).toHaveProperty('disabled', false);
  });

  it('runs the whole suite with the default environment and opens its report', async () => {
    mockedListCases.mockResolvedValue([createCaseRow({ name: '登录成功' })]);
    mockedCreateRun.mockResolvedValue(createRunRow({ id: 'run_suite' }));

    renderSuiteDetailPage();

    await userEvent.click(await screen.findByRole('button', { name: /运行套件/ }));

    await waitFor(() => {
      expect(mockedCreateRun.mock.calls?.[0]?.[0]).toEqual({
        projectId: 'project_1',
        environmentId: 'env_1',
        scopeType: 'suite',
        scopeId: 'suite_1',
      });
    });
    expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/runs/run_suite');
  });

  it('runs selected cases as a selection run and opens its report', async () => {
    mockedListCases.mockResolvedValue([
      createCaseRow({ id: 'case_1', name: '登录成功' }),
      createCaseRow({ id: 'case_2', name: '登录失败' }),
    ]);
    mockedCreateRun.mockResolvedValue(createRunRow({ id: 'run_selection', scope_type: 'selection', scope_id: null }));

    renderSuiteDetailPage();

    const caseName = await screen.findByText('登录失败');
    const row = caseName.closest('tr');
    if (!row) {
      throw new Error('Case row not found');
    }

    await userEvent.click(within(row).getByRole('checkbox'));
    await userEvent.click(screen.getByRole('button', { name: /运行选中/ }));

    await waitFor(() => {
      expect(mockedCreateRun.mock.calls?.[0]?.[0]).toEqual({
        projectId: 'project_1',
        environmentId: 'env_1',
        scopeType: 'selection',
        caseIds: ['case_2'],
      });
    });
    expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/runs/run_selection');
  });
});

function createSuiteRow(overrides: Partial<SuiteRow> = {}): SuiteRow {
  return {
    id: 'suite_1',
    project_id: 'project_1',
    name: '冒烟测试',
    description: '',
    enabled: 1,
    case_count: 1,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function createCaseRow(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    id: 'case_1',
    project_id: 'project_1',
    suite_id: 'suite_1',
    name: '登录成功',
    description: '',
    enabled: 1,
    tags_json: JSON.stringify([]),
    steps_json: JSON.stringify([]),
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
    scope_type: 'suite',
    scope_id: 'suite_1',
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

function renderSuiteDetailPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/projects/project_1/suites/suite_1']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/suites/:suiteId" element={<SuiteDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
