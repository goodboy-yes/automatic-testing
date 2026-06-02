import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { getCase, updateCase, type CaseRow } from '../api/cases';
import {
  cancelRun,
  createCaseRun,
  getRun,
  listCaseRuns,
  subscribeRunEvents,
  type RunDetailResponse,
  type RunRow,
} from '../api/runs';
import { CaseEditorPage } from './CaseEditorPage';

interface MockEditorProps {
  value?: string;
  onChange?: (value?: string) => void;
}

vi.mock('@monaco-editor/react', () => ({
  default: ({ value, onChange }: MockEditorProps) => (
    <textarea
      aria-label="Midscene YAML"
      value={value ?? ''}
      onChange={(event) => onChange?.(event.currentTarget.value)}
      onInput={(event) => onChange?.(event.currentTarget.value)}
    />
  ),
}));

vi.mock('../api/cases', () => ({
  getCase: vi.fn(),
  updateCase: vi.fn(),
}));

vi.mock('../api/runs', () => ({
  cancelRun: vi.fn(),
  createCaseRun: vi.fn(),
  getRun: vi.fn(),
  getRunArtifactUrl: vi.fn((runId: string, artifactPath: string) => `/api/runs/${runId}/artifacts/${artifactPath}`),
  listCaseRuns: vi.fn(),
  subscribeRunEvents: vi.fn(() => vi.fn()),
}));

const mockedCancelRun = vi.mocked(cancelRun);
const mockedCreateCaseRun = vi.mocked(createCaseRun);
const mockedGetCase = vi.mocked(getCase);
const mockedGetRun = vi.mocked(getRun);
const mockedListCaseRuns = vi.mocked(listCaseRuns);
const mockedSubscribeRunEvents = vi.mocked(subscribeRunEvents);
const mockedUpdateCase = vi.mocked(updateCase);

describe('CaseEditorPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetCase.mockResolvedValue(createCaseRow());
    mockedListCaseRuns.mockResolvedValue([]);
    mockedGetRun.mockResolvedValue(createRunDetail());
    mockedCreateCaseRun.mockResolvedValue(createRunRow({ id: 'run_new' }));
    mockedUpdateCase.mockResolvedValue(createCaseRow({ name: '保存后的用例' }));
    mockedCancelRun.mockResolvedValue(createRunRow({ id: 'run_running', status: 'canceled' }));
  });

  afterEach(() => {
    cleanup();
  });

  it('loads and saves case metadata with native Midscene YAML', async () => {
    renderCaseEditorPage();

    expect(await screen.findByDisplayValue('登录成功')).toBeTruthy();
    const yamlEditor = await screen.findByLabelText('Midscene YAML');
    fireEvent.change(yamlEditor, { target: { value: 'web:\n  url: https://changed.example.com\n' } });
    await userEvent.clear(screen.getByLabelText('描述'));
    await userEvent.type(screen.getByLabelText('描述'), '更新描述');
    await userEvent.click(screen.getByRole('button', { name: /保存/ }));

    await waitFor(() => {
      expect(mockedUpdateCase.mock.calls?.[0]).toEqual([
        'case_1',
        {
          name: '登录成功',
          description: '更新描述',
          yamlText: 'web:\n  url: https://changed.example.com\n',
        },
      ]);
    });
  });

  it('runs the current case and subscribes to run status events', async () => {
    mockedListCaseRuns.mockResolvedValue([createRunRow({ id: 'run_running', status: 'running' })]);
    mockedGetRun.mockResolvedValue(createRunDetail({ run: createRunRow({ id: 'run_running', status: 'running' }) }));

    renderCaseEditorPage();

    await screen.findByDisplayValue('登录成功');
    await userEvent.click(screen.getByRole('button', { name: '运行用例' }));

    await waitFor(() => {
      expect(mockedCreateCaseRun.mock.calls?.[0]?.[0]).toBe('case_1');
    });
    expect(mockedSubscribeRunEvents).toHaveBeenCalledWith('run_running', expect.any(Function));
    expect(await screen.findByText('运行中')).toBeTruthy();
  });

  it('cancels a running case run', async () => {
    mockedListCaseRuns.mockResolvedValue([createRunRow({ id: 'run_running', status: 'running' })]);
    mockedGetRun.mockResolvedValue(createRunDetail({ run: createRunRow({ id: 'run_running', status: 'running' }) }));

    renderCaseEditorPage();

    await userEvent.click(await screen.findByRole('button', { name: /取消运行/ }));

    await waitFor(() => {
      expect(mockedCancelRun.mock.calls?.[0]?.[0]).toBe('run_running');
    });
  });

  it('shows the latest Midscene visual report link', async () => {
    mockedListCaseRuns.mockResolvedValue([createRunRow({ id: 'run_success', status: 'success' })]);
    mockedGetRun.mockResolvedValue(
      createRunDetail({
        run: createRunRow({ id: 'run_success', status: 'success' }),
        artifacts: [{ id: 'artifact_1', run_id: 'run_success', type: 'visual_report', path: 'visual-report.html', created_at: '2026-06-01T00:00:00.000Z' }],
      }),
    );

    renderCaseEditorPage();

    const reportLink = await screen.findByRole('link', { name: '查看 Midscene 报告' });

    expect(reportLink.getAttribute('href')).toBe('/api/runs/run_success/artifacts/visual-report.html');
  });
});

function createCaseRow(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    id: 'case_1',
    name: '登录成功',
    description: '',
    yaml_text: 'web:\n  url: https://example.com\n',
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
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

function createRunDetail(overrides: Partial<RunDetailResponse> = {}): RunDetailResponse {
  return {
    run: createRunRow(),
    artifacts: [],
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
    <MemoryRouter initialEntries={['/cases/case_1']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/cases/:caseId" element={<CaseEditorPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
