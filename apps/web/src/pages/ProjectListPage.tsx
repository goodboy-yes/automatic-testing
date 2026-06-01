import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Layout, Modal, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createProject, deleteProject, listProjects, updateProject, type ProjectRow } from '../api/projects';

interface ProjectFormValues {
  name?: string;
  description?: string;
}

export function ProjectListPage() {
  const [form] = Form.useForm<ProjectFormValues>();
  const [editingProject, setEditingProject] = useState<ProjectRow | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
  });
  const createProjectMutation = useMutation({
    mutationFn: createProject,
    onSuccess: async (project) => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsProjectModalOpen(false);
      form.resetFields();
      navigate(`/projects/${project?.id}`);
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: (input: { projectId: string; values: ProjectFormValues }) => {
      const name = input.values?.name?.trim();
      if (!name) {
        throw new Error('Project name is required');
      }
      const description = input.values?.description?.trim();
      return updateProject(input.projectId, {
        name,
        description: description ?? '',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
      setIsProjectModalOpen(false);
      setEditingProject(null);
      form.resetFields();
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: deleteProject,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const navigateToProject = useCallback(
    (project: ProjectRow) => {
      const projectId = project?.id;
      if (projectId) {
        navigate(`/projects/${projectId}`);
      }
    },
    [navigate],
  );

  const openEditModal = useCallback(
    (project: ProjectRow) => {
      setEditingProject(project);
      form.setFieldsValue({
        name: project?.name,
        description: project?.description,
      });
      setIsProjectModalOpen(true);
    },
    [form],
  );

  const confirmDeleteProject = useCallback(
    (project: ProjectRow) => {
      const projectId = project?.id;
      if (!projectId) {
        return;
      }

      Modal.confirm({
        title: '删除项目',
        content: '删除后项目下的环境、套件和用例也会被删除。',
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => deleteProjectMutation.mutate(projectId),
      });
    },
    [deleteProjectMutation],
  );

  const columns = useMemo<ColumnsType<ProjectRow>>(
    () => [
      {
        title: '项目名称',
        dataIndex: 'name',
        render: (_value, record) => (
          <Button type="link" onClick={() => navigateToProject(record)}>
            {record?.name}
          </Button>
        ),
      },
      { title: '描述', dataIndex: 'description' },
      { title: '更新时间', dataIndex: 'updated_at' },
      {
        title: '操作',
        key: 'actions',
        render: (_value, record) => (
          <Space>
            <Button type="link" onClick={() => navigateToProject(record)}>
              进入
            </Button>
            <Button type="link" icon={<EditOutlined />} aria-label="编辑项目" onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Button type="link" danger icon={<DeleteOutlined />} aria-label="删除项目" onClick={() => confirmDeleteProject(record)}>
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [confirmDeleteProject, navigateToProject, openEditModal],
  );

  const openCreateModal = () => {
    setEditingProject(null);
    form.resetFields();
    setIsProjectModalOpen(true);
  };

  const closeProjectModal = () => {
    setIsProjectModalOpen(false);
    setEditingProject(null);
    form.resetFields();
  };

  const handleSaveProject = (values: ProjectFormValues) => {
    const name = values?.name?.trim();
    if (!name) {
      return;
    }

    const description = values?.description?.trim();
    if (editingProject?.id) {
      updateProjectMutation.mutate({
        projectId: editingProject.id,
        values: { name, description: description ?? '' },
      });
      return;
    }

    createProjectMutation.mutate({ name, description: description ? description : undefined });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ color: '#fff', fontWeight: 600 }}>
        自动化测试平台
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Space orientation="vertical" size={16} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              项目
            </Typography.Title>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
              新建项目
            </Button>
          </Space>
          <Table
            loading={isLoading}
            rowKey="id"
            columns={columns}
            dataSource={data}
          />
          <Modal
            title={editingProject ? '编辑项目' : '新建项目'}
            open={isProjectModalOpen}
            onCancel={closeProjectModal}
            footer={null}
            destroyOnHidden
          >
            <Form form={form} layout="vertical" onFinish={handleSaveProject}>
              <Form.Item
                label="项目名称"
                name="name"
                rules={[{ required: true, message: '请输入项目名称' }]}
              >
                <Input placeholder="请输入项目名称" />
              </Form.Item>
              <Form.Item label="描述" name="description">
                <Input.TextArea rows={3} placeholder="请输入项目描述" />
              </Form.Item>
              <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
                <Button onClick={closeProjectModal}>
                  取消
                </Button>
                <Button
                  type="primary"
                  htmlType="submit"
                  loading={createProjectMutation.isPending || updateProjectMutation.isPending}
                >
                  {editingProject ? '保存' : '创建'}
                </Button>
              </Space>
            </Form>
          </Modal>
        </Space>
      </Layout.Content>
    </Layout>
  );
}
