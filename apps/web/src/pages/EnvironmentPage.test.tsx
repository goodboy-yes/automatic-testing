import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import {
  createEnvironment,
  deleteEnvironment,
  listEnvironments,
  updateEnvironment,
} from '../api/environments';
import { EnvironmentPage } from './EnvironmentPage';

vi.mock('../api/environments', () => ({
  createEnvironment: vi.fn(),
  deleteEnvironment: vi.fn(),
  listEnvironments: vi.fn(),
  updateEnvironment: vi.fn(),
}));

const mockedCreateEnvironment = vi.mocked(createEnvironment);
const mockedDeleteEnvironment = vi.mocked(deleteEnvironment);
const mockedListEnvironments = vi.mocked(listEnvironments);
const mockedUpdateEnvironment = vi.mocked(updateEnvironment);

describe('EnvironmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListEnvironments.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('renders environment rows with the default marker', async () => {
    mockedListEnvironments.mockResolvedValue([
      {
        id: 'env_1',
        project_id: 'project_1',
        name: '本地环境',
        base_url: 'https://example.com',
        browser_type: 'chromium',
        viewport_width: 1280,
        viewport_height: 720,
        default_timeout_ms: 10000,
        is_default: 1,
      },
    ]);

    renderEnvironmentPage();

    expect(await screen.findByText('本地环境')).toBeTruthy();
    expect(screen.getByText('默认')).toBeTruthy();
    expect(screen.getByText('https://example.com')).toBeTruthy();
  });

  it('creates an environment with sensible defaults', async () => {
    mockedCreateEnvironment.mockResolvedValue({
      id: 'env_1',
      project_id: 'project_1',
      name: '本地环境',
      base_url: 'https://example.com',
      browser_type: 'chromium',
      viewport_width: 1280,
      viewport_height: 720,
      default_timeout_ms: 10000,
      is_default: 1,
    });

    renderEnvironmentPage();

    await userEvent.click(await screen.findByRole('button', { name: /新建环境/ }));
    const dialog = await screen.findByRole('dialog', { name: '新建环境' });
    await userEvent.type(within(dialog).getByLabelText('环境名称'), '本地环境');
    await userEvent.type(within(dialog).getByLabelText('Base URL'), 'https://example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => {
      expect(mockedCreateEnvironment.mock.calls?.[0]).toEqual([
        'project_1',
        {
          name: '本地环境',
          baseUrl: 'https://example.com',
          browserType: 'chromium',
          viewportWidth: 1280,
          viewportHeight: 720,
          defaultTimeoutMs: 10000,
          isDefault: true,
        },
      ]);
    });
  });

  it('edits an existing environment', async () => {
    mockedListEnvironments.mockResolvedValue([
      {
        id: 'env_1',
        project_id: 'project_1',
        name: '旧环境',
        base_url: 'https://old.example.com',
        browser_type: 'chromium',
        viewport_width: 1280,
        viewport_height: 720,
        default_timeout_ms: 10000,
        is_default: 0,
      },
    ]);
    mockedUpdateEnvironment.mockResolvedValue({
      id: 'env_1',
      project_id: 'project_1',
      name: '新环境',
      base_url: 'https://new.example.com',
      browser_type: 'chromium',
      viewport_width: 1280,
      viewport_height: 720,
      default_timeout_ms: 10000,
      is_default: 0,
    });

    renderEnvironmentPage();

    await userEvent.click(await screen.findByRole('button', { name: '编辑环境' }));
    const dialog = await screen.findByRole('dialog', { name: '编辑环境' });
    await userEvent.clear(within(dialog).getByLabelText('环境名称'));
    await userEvent.type(within(dialog).getByLabelText('环境名称'), '新环境');
    await userEvent.clear(within(dialog).getByLabelText('Base URL'));
    await userEvent.type(within(dialog).getByLabelText('Base URL'), 'https://new.example.com');
    await userEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      expect(mockedUpdateEnvironment.mock.calls?.[0]?.[0]).toBe('env_1');
      expect(mockedUpdateEnvironment.mock.calls?.[0]?.[1]).toMatchObject({
        name: '新环境',
        baseUrl: 'https://new.example.com',
      });
    });
  });

  it('deletes an environment after confirmation', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockReturnValue({
      destroy: vi.fn(),
      update: vi.fn(),
    });
    mockedListEnvironments.mockResolvedValue([
      {
        id: 'env_1',
        project_id: 'project_1',
        name: '待删除环境',
        base_url: 'https://example.com',
        browser_type: 'chromium',
        viewport_width: 1280,
        viewport_height: 720,
        default_timeout_ms: 10000,
        is_default: 0,
      },
    ]);
    mockedDeleteEnvironment.mockResolvedValue({ ok: true });

    renderEnvironmentPage();

    await userEvent.click(await screen.findByRole('button', { name: '删除环境' }));
    const confirmOptions = confirmSpy.mock.calls?.[0]?.[0];
    if (!confirmOptions?.onOk) {
      throw new Error('Delete confirmation handler not found');
    }
    confirmOptions.onOk();

    await waitFor(() => {
      expect(mockedDeleteEnvironment.mock.calls?.[0]?.[0]).toBe('env_1');
    });
    confirmSpy.mockRestore();
  });
});

function renderEnvironmentPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter initialEntries={['/projects/project_1/environments']}>
      <QueryClientProvider client={queryClient}>
        <Routes>
          <Route path="/projects/:projectId/environments" element={<EnvironmentPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
