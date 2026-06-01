import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { listRuns, type RunRow } from '../api/runs';
import { RunListPage } from './RunListPage';

vi.mock('../api/runs', () => ({
  listRuns: vi.fn(),
}));

const mockedListRuns = vi.mocked(listRuns);
const mockedNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('RunListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListRuns.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('loads and renders project runs with status and totals', async () => {
    mockedListRuns.mockResolvedValue([
      createRunRow({
        status: 'success',
        scope_type: 'suite',
        total_cases: 3,
        passed_cases: 2,
        failed_cases: 1,
        started_at: '2026-06-01T01:00:00.000Z',
      }),
    ]);

    renderRunListPage();

    await waitFor(() => {
      expect(mockedListRuns.mock.calls?.[0]?.[0]).toBe('project_1');
    });
    expect(await screen.findByText('成功')).toBeTruthy();
    expect(screen.getByText('套件')).toBeTruthy();
    expect(screen.getByText('2 / 1 / 3')).toBeTruthy();
    expect(screen.getByText('2026-06-01 01:00:00')).toBeTruthy();
  });

  it('opens a run report from the table action', async () => {
    mockedListRuns.mockResolvedValue([createRunRow({ id: 'run_2' })]);

    renderRunListPage();

    const status = await screen.findByText('排队中');
    const row = status.closest('tr');
    if (!row) {
      throw new Error('Run row not found');
    }

    await userEvent.click(within(row).getByRole('button', { name: '查看报告' }));

    expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/runs/run_2');
  });
});

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

function renderRunListPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/projects/project_1/runs']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/runs" element={<RunListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
