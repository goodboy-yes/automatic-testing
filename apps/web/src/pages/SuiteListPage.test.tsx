import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  createSuite,
  deleteSuite,
  listSuites,
  updateSuite,
  type SuiteRow,
} from '../api/suites';
import { SuiteListPage } from './SuiteListPage';

vi.mock('../api/suites', () => ({
  createSuite: vi.fn(),
  deleteSuite: vi.fn(),
  listSuites: vi.fn(),
  updateSuite: vi.fn(),
}));

const mockedCreateSuite = vi.mocked(createSuite);
const mockedDeleteSuite = vi.mocked(deleteSuite);
const mockedListSuites = vi.mocked(listSuites);
const mockedUpdateSuite = vi.mocked(updateSuite);
const mockedNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('SuiteListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListSuites.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders suite rows with case counts and status', async () => {
    mockedListSuites.mockResolvedValue([
      createSuiteRow({ name: '冒烟测试', description: '关键路径', case_count: 3, enabled: 1 }),
    ]);

    renderSuiteListPage();

    expect(await screen.findByText('冒烟测试')).toBeTruthy();
    expect(screen.getByText('关键路径')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('启用')).toBeTruthy();
  });

  it('creates a suite and navigates into it', async () => {
    mockedCreateSuite.mockResolvedValue(createSuiteRow({ id: 'suite_2', name: '回归测试', description: '全量回归' }));

    renderSuiteListPage();

    await userEvent.click(await screen.findByRole('button', { name: /新建套件/ }));
    const dialog = await screen.findByRole('dialog', { name: '新建套件' });
    await userEvent.type(within(dialog).getByLabelText('套件名称'), '回归测试');
    await userEvent.type(within(dialog).getByLabelText('描述'), '全量回归');
    await userEvent.click(within(dialog).getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => {
      expect(mockedCreateSuite.mock.calls?.[0]).toEqual([
        'project_1',
        { name: '回归测试', description: '全量回归' },
      ]);
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/suites/suite_2');
    });
  });

  it('navigates into an existing suite from the list', async () => {
    mockedListSuites.mockResolvedValue([createSuiteRow({ name: '冒烟测试' })]);

    renderSuiteListPage();

    const suiteName = await screen.findByText('冒烟测试');
    const row = suiteName.closest('tr');
    if (!row) {
      throw new Error('Suite row not found');
    }

    await userEvent.click(within(row).getByRole('button', { name: '进入' }));

    expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1/suites/suite_1');
  });

  it('edits an existing suite', async () => {
    mockedListSuites.mockResolvedValue([createSuiteRow({ name: '旧套件', description: '旧描述', enabled: 1 })]);
    mockedUpdateSuite.mockResolvedValue(createSuiteRow({ name: '新套件', description: '新描述', enabled: 1 }));

    renderSuiteListPage();

    await userEvent.click(await screen.findByRole('button', { name: '编辑套件' }));
    const dialog = await screen.findByRole('dialog', { name: '编辑套件' });
    await userEvent.clear(within(dialog).getByLabelText('套件名称'));
    await userEvent.type(within(dialog).getByLabelText('套件名称'), '新套件');
    await userEvent.clear(within(dialog).getByLabelText('描述'));
    await userEvent.type(within(dialog).getByLabelText('描述'), '新描述');
    await userEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      expect(mockedUpdateSuite.mock.calls?.[0]).toEqual([
        'suite_1',
        { name: '新套件', description: '新描述', enabled: true },
      ]);
    });
  });

  it('deletes a suite after confirmation', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockReturnValue({
      destroy: vi.fn(),
      update: vi.fn(),
    });
    mockedListSuites.mockResolvedValue([createSuiteRow({ name: '待删除套件' })]);
    mockedDeleteSuite.mockResolvedValue({ ok: true });

    renderSuiteListPage();

    await userEvent.click(await screen.findByRole('button', { name: '删除套件' }));
    const confirmOptions = confirmSpy.mock.calls?.[0]?.[0];
    if (!confirmOptions?.onOk) {
      throw new Error('Delete confirmation handler not found');
    }
    confirmOptions.onOk();

    await waitFor(() => {
      expect(mockedDeleteSuite.mock.calls?.[0]?.[0]).toBe('suite_1');
    });
    confirmSpy.mockRestore();
  });
});

function createSuiteRow(overrides: Partial<SuiteRow> = {}): SuiteRow {
  return {
    id: 'suite_1',
    project_id: 'project_1',
    name: '冒烟测试',
    description: '',
    enabled: 1,
    case_count: 0,
    created_at: '2026-06-01T00:00:00.000Z',
    updated_at: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function renderSuiteListPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/projects/project_1/suites']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/suites" element={<SuiteListPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
