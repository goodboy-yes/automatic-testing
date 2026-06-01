import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { cancelRun, getRun, type RunDetailResponse, type RunRow } from '../api/runs';
import { RunReportPage } from './RunReportPage';

interface RunEventForTest {
  runId: string;
  type: 'status' | 'log';
  payload: {
    message?: string;
    status?: string;
  };
}

const runEventMocks = vi.hoisted(() => {
  const handlers: Array<(event: RunEventForTest) => void> = [];
  const unsubscribe = vi.fn();
  const subscribeRunEvents = vi.fn((runId: string, onEvent: (event: RunEventForTest) => void) => {
    handlers.push(onEvent);
    return unsubscribe;
  });

  return { handlers, subscribeRunEvents, unsubscribe };
});

vi.mock('../api/runs', () => ({
  cancelRun: vi.fn(),
  getRun: vi.fn(),
  getRunArtifactUrl: (runId: string, artifactPath: string) => `/api/runs/${runId}/artifacts/${artifactPath}`,
  subscribeRunEvents: runEventMocks.subscribeRunEvents,
}));

const mockedCancelRun = vi.mocked(cancelRun);
const mockedGetRun = vi.mocked(getRun);

describe('RunReportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runEventMocks.handlers.length = 0;
    mockedCancelRun.mockResolvedValue(createRunRow({ status: 'canceled' }));
    mockedGetRun.mockResolvedValue(createRunDetail());
  });

  afterEach(() => {
    cleanup();
  });

  it('loads run detail and renders summary and case results', async () => {
    renderRunReportPage();

    await waitFor(() => {
      expect(mockedGetRun.mock.calls?.[0]?.[0]).toBe('run_1');
    });
    expect((await screen.findAllByText('成功'))?.[0]).toBeTruthy();
    expect(screen.getByText('1 / 1 / 2')).toBeTruthy();
    expect(screen.getByText('case_1')).toBeTruthy();
    expect(screen.getByText('断言失败')).toBeTruthy();
    expect(screen.getByText('cases/run_case_2')).toBeTruthy();
  });

  it('shows step results in the step tab', async () => {
    renderRunReportPage();

    await screen.findByText('case_1');
    fireEvent.click(screen.getByRole('tab', { name: '步骤结果' }));

    const failedStep = await screen.findByText('点击登录');
    const row = failedStep.closest('tr');
    if (!row) {
      throw new Error('Step row not found');
    }

    expect(row.textContent).toContain('case_2');
    expect(screen.getByText('aiTap')).toBeTruthy();
    expect(screen.getByText('按钮不可见')).toBeTruthy();
  });

  it('renders links for run and case artifacts', async () => {
    renderRunReportPage();

    await screen.findByText('case_1');
    const caseLinks = screen.getAllByRole('link', { name: '用例 YAML' });

    expect(caseLinks?.[0]?.getAttribute('href')).toBe('/api/runs/run_1/artifacts/cases/run_case_1/midscene.yaml');
    expect(caseLinks?.[1]?.getAttribute('href')).toBe('/api/runs/run_1/artifacts/cases/run_case_2/midscene.yaml');

    fireEvent.click(screen.getByRole('tab', { name: '日志' }));

    expect(screen.getByRole('link', { name: '运行 YAML' }).getAttribute('href')).toBe(
      '/api/runs/run_1/artifacts/midscene.yaml',
    );
    expect(screen.getByRole('link', { name: '运行日志' }).getAttribute('href')).toBe(
      '/api/runs/run_1/artifacts/logs/run.log',
    );
  });

  it('refreshes run detail and shows live logs when run events arrive', async () => {
    mockedGetRun
      .mockResolvedValueOnce(
        createRunDetail({
          run: createRunRow({
            status: 'running',
            passed_cases: 0,
            failed_cases: 0,
            finished_at: null,
            duration_ms: null,
          }),
        }),
      )
      .mockResolvedValueOnce(createRunDetail());

    renderRunReportPage();

    await screen.findByText('运行中');
    expect(runEventMocks.subscribeRunEvents).toHaveBeenCalledWith('run_1', expect.any(Function));

    act(() => {
      runEventMocks.handlers?.[0]?.({
        runId: 'run_1',
        type: 'log',
        payload: { message: '开始执行登录用例' },
      });
    });
    fireEvent.click(screen.getByRole('tab', { name: '日志' }));

    expect(screen.getByText('开始执行登录用例')).toBeTruthy();

    act(() => {
      runEventMocks.handlers?.[0]?.({
        runId: 'run_1',
        type: 'status',
        payload: { status: 'success' },
      });
    });

    await waitFor(() => {
      expect(mockedGetRun).toHaveBeenCalledTimes(2);
    });
    expect((await screen.findAllByText('成功'))?.[0]).toBeTruthy();
  });

  it('cancels a running run from the report page and refreshes detail', async () => {
    mockedGetRun
      .mockResolvedValueOnce(
        createRunDetail({
          run: createRunRow({
            status: 'running',
            passed_cases: 0,
            failed_cases: 0,
            finished_at: null,
            duration_ms: null,
          }),
        }),
      )
      .mockResolvedValueOnce(createRunDetail({ run: createRunRow({ status: 'canceled' }) }));

    renderRunReportPage();

    await screen.findByText('运行中');
    await userEvent.click(screen.getByRole('button', { name: '取消运行' }));

    expect(mockedCancelRun).toHaveBeenCalledWith('run_1');
    await waitFor(() => {
      expect(mockedGetRun).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByText('已取消')).toBeTruthy();
  });
});

function createRunDetail(overrides: Partial<RunDetailResponse> = {}): RunDetailResponse {
  return {
    run: overrides.run ?? createRunRow(),
    cases: overrides.cases ?? [
      {
        id: 'run_case_1',
        run_id: 'run_1',
        test_case_id: 'case_1',
        run_order: 0,
        status: 'success',
        started_at: '2026-06-01T01:00:00.000Z',
        finished_at: '2026-06-01T01:00:01.000Z',
        duration_ms: 1000,
        error_message: null,
        artifact_path: 'cases/run_case_1',
      },
      {
        id: 'run_case_2',
        run_id: 'run_1',
        test_case_id: 'case_2',
        run_order: 1,
        status: 'failed',
        started_at: '2026-06-01T01:00:01.000Z',
        finished_at: '2026-06-01T01:00:02.000Z',
        duration_ms: 1000,
        error_message: '断言失败',
        artifact_path: 'cases/run_case_2',
      },
    ],
    steps: overrides.steps ?? [
      {
        id: 'run_step_1',
        run_case_id: 'run_case_1',
        step_id: 'step_1',
        step_index: 0,
        step_title: '登录成功',
        step_type: 'aiAssert',
        status: 'success',
        started_at: '2026-06-01T01:00:00.000Z',
        finished_at: '2026-06-01T01:00:01.000Z',
        duration_ms: 1000,
        error_message: null,
        screenshot_path: null,
        raw_result_json: '{"generated":true}',
      },
      {
        id: 'run_step_2',
        run_case_id: 'run_case_2',
        step_id: 'step_2',
        step_index: 0,
        step_title: '点击登录',
        step_type: 'aiTap',
        status: 'failed',
        started_at: '2026-06-01T01:00:01.000Z',
        finished_at: '2026-06-01T01:00:02.000Z',
        duration_ms: 1000,
        error_message: '按钮不可见',
        screenshot_path: null,
        raw_result_json: null,
      },
    ],
    artifacts: overrides.artifacts ?? [],
  };
}

function createRunRow(overrides: Partial<RunRow> = {}): RunRow {
  return {
    id: 'run_1',
    project_id: 'project_1',
    environment_id: 'env_1',
    scope_type: 'suite',
    scope_id: 'suite_1',
    status: 'success',
    total_cases: 2,
    passed_cases: 1,
    failed_cases: 1,
    started_at: '2026-06-01T01:00:00.000Z',
    finished_at: '2026-06-01T01:00:02.000Z',
    duration_ms: 2000,
    triggered_by: null,
    created_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderRunReportPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/projects/project_1/runs/run_1']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/runs/:runId" element={<RunReportPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
