import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  createEnvironment,
  deleteEnvironment,
  listEnvironments,
  updateEnvironment,
  type BrowserType,
  type EnvironmentRow,
  type SaveEnvironmentInput,
} from '../api/environments';

interface EnvironmentFormValues {
  name?: string;
  baseUrl?: string;
  browserType?: BrowserType;
  viewportWidth?: number | null;
  viewportHeight?: number | null;
  defaultTimeoutMs?: number | null;
  isDefault?: boolean;
}

const defaultEnvironmentValues: EnvironmentFormValues = {
  browserType: 'chromium',
  viewportWidth: 1280,
  viewportHeight: 720,
  defaultTimeoutMs: 10000,
  isDefault: true,
};

export function EnvironmentPage() {
  const { projectId } = useParams();
  const [form] = Form.useForm<EnvironmentFormValues>();
  const [editingEnvironment, setEditingEnvironment] = useState<EnvironmentRow | null>(null);
  const [isEnvironmentModalOpen, setIsEnvironmentModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['environments', projectId], [projectId]);
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listEnvironments(projectId ?? ''),
    enabled: Boolean(projectId),
  });

  const createEnvironmentMutation = useMutation({
    mutationFn: (values: SaveEnvironmentInput) => createEnvironment(projectId ?? '', values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      closeEnvironmentModal();
    },
  });

  const updateEnvironmentMutation = useMutation({
    mutationFn: (input: { environmentId: string; values: SaveEnvironmentInput }) =>
      updateEnvironment(input.environmentId, input.values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      closeEnvironmentModal();
    },
  });

  const deleteEnvironmentMutation = useMutation({
    mutationFn: deleteEnvironment,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const openCreateModal = () => {
    setEditingEnvironment(null);
    form.setFieldsValue(defaultEnvironmentValues);
    setIsEnvironmentModalOpen(true);
  };

  const openEditModal = useCallback(
    (environment: EnvironmentRow) => {
      setEditingEnvironment(environment);
      form.setFieldsValue({
        name: environment?.name,
        baseUrl: environment?.base_url,
        browserType: environment?.browser_type,
        viewportWidth: environment?.viewport_width,
        viewportHeight: environment?.viewport_height,
        defaultTimeoutMs: environment?.default_timeout_ms,
        isDefault: Boolean(environment?.is_default),
      });
      setIsEnvironmentModalOpen(true);
    },
    [form],
  );

  const closeEnvironmentModal = useCallback(() => {
    setIsEnvironmentModalOpen(false);
    setEditingEnvironment(null);
    form.resetFields();
  }, [form]);

  const confirmDeleteEnvironment = useCallback(
    (environment: EnvironmentRow) => {
      const environmentId = environment?.id;
      if (!environmentId) {
        return;
      }

      Modal.confirm({
        title: '删除环境',
        content: '删除后运行时将不能再选择该环境。',
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => deleteEnvironmentMutation.mutate(environmentId),
      });
    },
    [deleteEnvironmentMutation],
  );

  const columns = useMemo<ColumnsType<EnvironmentRow>>(
    () => [
      {
        title: '名称',
        dataIndex: 'name',
        render: (_value, record) => (
          <Space>
            <span>{record?.name}</span>
            {record?.is_default ? <Tag color="blue">默认</Tag> : null}
          </Space>
        ),
      },
      { title: 'Base URL', dataIndex: 'base_url' },
      { title: '浏览器', dataIndex: 'browser_type' },
      {
        title: '视口',
        key: 'viewport',
        render: (_value, record) => `${record?.viewport_width} x ${record?.viewport_height}`,
      },
      { title: '默认超时', dataIndex: 'default_timeout_ms' },
      {
        title: '操作',
        key: 'actions',
        render: (_value, record) => (
          <Space>
            <Button type="link" icon={<EditOutlined />} aria-label="编辑环境" onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              aria-label="删除环境"
              onClick={() => confirmDeleteEnvironment(record)}
            >
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [confirmDeleteEnvironment, openEditModal],
  );

  const buildSaveInput = (values: EnvironmentFormValues): SaveEnvironmentInput | null => {
    const name = values?.name?.trim();
    const baseUrl = values?.baseUrl?.trim();
    const browserType = values?.browserType;
    const viewportWidth = values?.viewportWidth;
    const viewportHeight = values?.viewportHeight;
    const defaultTimeoutMs = values?.defaultTimeoutMs;

    if (!name || !baseUrl || !browserType || !viewportWidth || !viewportHeight || !defaultTimeoutMs) {
      return null;
    }

    return {
      name,
      baseUrl,
      browserType,
      viewportWidth,
      viewportHeight,
      defaultTimeoutMs,
      isDefault: Boolean(values?.isDefault),
    };
  };

  const handleSaveEnvironment = (values: EnvironmentFormValues) => {
    const input = buildSaveInput(values);
    if (!input) {
      return;
    }

    if (editingEnvironment?.id) {
      updateEnvironmentMutation.mutate({ environmentId: editingEnvironment.id, values: input });
      return;
    }

    createEnvironmentMutation.mutate(input);
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          环境配置
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建环境
        </Button>
      </Space>
      <Table
        loading={isLoading}
        rowKey="id"
        columns={columns}
        dataSource={data}
      />
      <Modal
        title={editingEnvironment ? '编辑环境' : '新建环境'}
        open={isEnvironmentModalOpen}
        onCancel={closeEnvironmentModal}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSaveEnvironment}>
          <Form.Item label="环境名称" name="name" rules={[{ required: true, message: '请输入环境名称' }]}>
            <Input placeholder="请输入环境名称" />
          </Form.Item>
          <Form.Item label="Base URL" name="baseUrl" rules={[{ required: true, message: '请输入 Base URL' }]}>
            <Input placeholder="https://example.com" />
          </Form.Item>
          <Form.Item label="浏览器" name="browserType" rules={[{ required: true, message: '请选择浏览器' }]}>
            <Select
              options={[
                { label: 'Chromium', value: 'chromium' },
                { label: 'Firefox', value: 'firefox' },
                { label: 'WebKit', value: 'webkit' },
              ]}
            />
          </Form.Item>
          <Space>
            <Form.Item label="视口宽度" name="viewportWidth" rules={[{ required: true, message: '请输入视口宽度' }]}>
              <InputNumber min={1} precision={0} />
            </Form.Item>
            <Form.Item label="视口高度" name="viewportHeight" rules={[{ required: true, message: '请输入视口高度' }]}>
              <InputNumber min={1} precision={0} />
            </Form.Item>
            <Form.Item
              label="默认超时(ms)"
              name="defaultTimeoutMs"
              rules={[{ required: true, message: '请输入默认超时' }]}
            >
              <InputNumber min={1} precision={0} />
            </Form.Item>
          </Space>
          <Form.Item label="设为默认环境" name="isDefault" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeEnvironmentModal}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createEnvironmentMutation.isPending || updateEnvironmentMutation.isPending}
            >
              {editingEnvironment ? '保存' : '创建'}
            </Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
