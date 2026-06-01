import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { createProject, deleteProject, listProjects, updateProject } from '../api/projects';
import { ProjectListPage } from './ProjectListPage';

vi.mock('../api/projects', () => ({
  createProject: vi.fn(),
  deleteProject: vi.fn(),
  listProjects: vi.fn(),
  updateProject: vi.fn(),
}));

const mockedCreateProject = vi.mocked(createProject);
const mockedDeleteProject = vi.mocked(deleteProject);
const mockedListProjects = vi.mocked(listProjects);
const mockedUpdateProject = vi.mocked(updateProject);
const mockedNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe('ProjectListPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedListProjects.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
  });

  it('opens a create project dialog, submits the new project, and navigates into it', async () => {
    mockedCreateProject.mockResolvedValue({
      id: 'project_1',
      name: '新项目',
      description: '回归项目',
      updated_at: '2026-06-01T00:00:00.000Z',
    });

    renderProjectListPage();

    await userEvent.click(await screen.findByRole('button', { name: /新建项目/ }));
    const dialog = await screen.findByRole('dialog', { name: '新建项目' });

    await userEvent.type(within(dialog).getByLabelText('项目名称'), '新项目');
    await userEvent.type(within(dialog).getByLabelText('描述'), '回归项目');
    await userEvent.click(within(dialog).getByRole('button', { name: /创\s*建/ }));

    await waitFor(() => {
      expect(mockedCreateProject.mock.calls?.[0]?.[0]).toEqual({ name: '新项目', description: '回归项目' });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1');
    });
  });

  it('navigates into an existing project from the list', async () => {
    mockedListProjects.mockResolvedValue([
      {
        id: 'project_1',
        name: '已有项目',
        description: '回归项目',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ]);

    renderProjectListPage();

    await userEvent.click(await screen.findByRole('button', { name: '进入' }));

    expect(mockedNavigate).toHaveBeenCalledWith('/projects/project_1');
  });

  it('edits an existing project', async () => {
    mockedListProjects.mockResolvedValue([
      {
        id: 'project_1',
        name: '旧项目',
        description: '旧描述',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ]);
    mockedUpdateProject.mockResolvedValue({
      id: 'project_1',
      name: '新项目',
      description: '新描述',
      updated_at: '2026-06-01T00:00:00.000Z',
    });

    renderProjectListPage();

    await userEvent.click(await screen.findByRole('button', { name: '编辑项目' }));
    const dialog = await screen.findByRole('dialog', { name: '编辑项目' });
    await userEvent.clear(within(dialog).getByLabelText('项目名称'));
    await userEvent.type(within(dialog).getByLabelText('项目名称'), '新项目');
    await userEvent.clear(within(dialog).getByLabelText('描述'));
    await userEvent.type(within(dialog).getByLabelText('描述'), '新描述');
    await userEvent.click(within(dialog).getByRole('button', { name: /保\s*存/ }));

    await waitFor(() => {
      expect(mockedUpdateProject.mock.calls?.[0]).toEqual([
        'project_1',
        { name: '新项目', description: '新描述' },
      ]);
    });
  });

  it('deletes a project after confirmation', async () => {
    const confirmSpy = vi.spyOn(Modal, 'confirm').mockReturnValue({
      destroy: vi.fn(),
      update: vi.fn(),
    });
    mockedListProjects.mockResolvedValue([
      {
        id: 'project_1',
        name: '待删除项目',
        description: '',
        updated_at: '2026-06-01T00:00:00.000Z',
      },
    ]);
    mockedDeleteProject.mockResolvedValue({ ok: true });

    renderProjectListPage();

    const projectName = await screen.findByText('待删除项目');
    const row = projectName.closest('tr');
    if (!row) {
      throw new Error('Project row not found');
    }
    await userEvent.click(within(row).getByRole('button', { name: '删除项目' }));
    const confirmOptions = confirmSpy.mock.calls?.[0]?.[0];
    if (!confirmOptions?.onOk) {
      throw new Error('Delete confirmation handler not found');
    }
    confirmOptions.onOk();

    await waitFor(() => {
      expect(mockedDeleteProject.mock.calls?.[0]?.[0]).toBe('project_1');
    });
  });

  it('does not render deprecated product branding in the page text', async () => {
    const { container } = renderProjectListPage();
    const forbiddenBrand = ['Mid', 'scene'].join('');

    await screen.findByRole('heading', { name: '项目' });

    expect(container.textContent).not.toContain(forbiddenBrand);
  });
});

function renderProjectListPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <ProjectListPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}
