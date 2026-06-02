import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { createCase, deleteCase, listCases, type CaseListItem } from '../api/cases';
import { createCaseRun, getRunArtifactUrl, type RunRow } from '../api/runs';
import { CaseListPage } from './CaseListPage';

vi.mock('../api/cases', () => ({
  createCase: vi.fn(),
  deleteCase: vi.fn(),
  listCases: vi.fn(),
}));

vi.mock('../api/runs', () => ({
  createCaseRun: vi.fn(),
  getRunArtifactUrl: vi.fn((runId: string, artifactPath: string) => `/api/runs/${runId}/artifacts/${artifactPath}`),
}));

const mockedCreateCase = vi.mocked(createCase);
const mockedCreateCaseRun = vi.mocked(createCaseRun);
const mockedDeleteCase = vi.mocked(deleteCase);
const mockedGetRunArtifactUrl = vi.mocked(getRunArtifactUrl);
const mockedListCases = vi.mocked(listCases);
const mockedNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('CaseListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListCases.mockResolvedValue([]);
    mockedCreateCaseRun.mockResolvedValue(createRunRow());
  });

  afterEach(() => {
    cleanup();
  });

  it('creates a YAML case and navigates into its editor', async () => {
    mockedCreateCase.mockResolvedValue(createCaseRow({ id: 'case_new', name: '新用例' }));

    renderCaseListPage();

    await userEvent.click(await screen.findByRole('button', { name: /新建用例/ }));
    const dialog = await screen.findByRole('dialog', { name: '新建用例' });
    await userEvent.type(within(dialog).getByLabelText('用例名称'), '新用例');
    await userEvent.type(within(dialog).getByLabelText('描述'), '冒烟检查');
    await userEvent.clear(within(dialog).getByLabelText('Midscene YAML'));
    await userEvent.type(within(dialog).getByLabelText('Midscene YAML'), 'web:\n  url: https://example.com\n');
    await userEvent.click(within(dialog).getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => {
      expect(mockedCreateCase.mock.calls?.[0]?.[0]).toEqual({
        name: '新用例',
        description: '冒烟检查',
        yamlText: 'web:\n  url: https://example.com\n',
      });
    });
    expect(mockedNavigate).toHaveBeenCalledWith('/cases/case_new');
  });

  it('runs a case from the list and shows latest status plus report link', async () => {
    mockedListCases.mockResolvedValue([
      createCaseRow({
        id: 'case_1',
        name: '登录成功',
        latest_run_id: 'run_1',
        latest_run_status: 'success',
        latest_visual_report_path: 'visual-report.html',
      }),
    ]);
    mockedCreateCaseRun.mockResolvedValue(createRunRow({ id: 'run_next', case_id: 'case_1' }));

    renderCaseListPage();

    const caseName = await screen.findByText('登录成功');
    const row = caseName.closest('tr');
    if (!row) {
      throw new Error('Case row not found');
    }

    expect(within(row).getByText('成功')).toBeTruthy();
    expect(within(row).getByRole('link', { name: '查看报告' }).getAttribute('href')).toBe(
      '/api/runs/run_1/artifacts/visual-report.html',
    );

    await userEvent.click(within(row).getByRole('button', { name: /运行/ }));

    await waitFor(() => {
      expect(mockedCreateCaseRun.mock.calls?.[0]?.[0]).toBe('case_1');
    });
    expect(mockedGetRunArtifactUrl).toHaveBeenCalledWith('run_1', 'visual-report.html');
  });

  it('deletes a case after confirmation', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockReturnValue({
      destroy: vi.fn(),
      update: vi.fn(),
    });
    mockedListCases.mockResolvedValue([createCaseRow({ id: 'case_delete', name: '待删除用例' })]);
    mockedDeleteCase.mockResolvedValue({ ok: true });

    renderCaseListPage();

    await userEvent.click(await screen.findByRole('button', { name: '删除用例' }));
    const confirmOptions = confirmSpy.mock.calls?.[0]?.[0];
    if (!confirmOptions?.onOk) {
      throw new Error('Delete confirmation handler not found');
    }
    confirmOptions.onOk();

    await waitFor(() => {
      expect(mockedDeleteCase.mock.calls?.[0]?.[0]).toBe('case_delete');
    });
    confirmSpy.mockRestore();
  });
});

function createCaseRow(overrides: Partial<CaseListItem> = {}): CaseListItem {
  return {
    id: 'case_1',
    name: '登录成功',
    description: '',
    yaml_text: 'web:\n  url: https://example.com\n',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    latest_run_id: null,
    latest_run_status: null,
    latest_visual_report_path: null,
    ...overrides,
  };
}

function createRunRow(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: 'run_1',
    case_id: 'case_1',
    status: 'pending',
    exit_code: null,
    error_message: null,
    started_at: null,
    finished_at: null,
    duration_ms: null,
    created_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderCaseListPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <CaseListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
