import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  createSuite,
  deleteSuite,
  listSuites,
  updateSuite,
  type SuiteRow,
} from '../api/suites';

interface SuiteFormValues {
  name?: string;
  description?: string;
  enabled?: boolean;
}

export function SuiteListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm<SuiteFormValues>();
  const [editingSuite, setEditingSuite] = useState<SuiteRow | null>(null);
  const [isSuiteModalOpen, setIsSuiteModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['suites', projectId], [projectId]);
  const { data = [], isLoading } = useQuery({
    queryKey,
    queryFn: () => listSuites(projectId ?? ''),
    enabled: Boolean(projectId),
  });

  const createSuiteMutation = useMutation({
    mutationFn: (values: { name: string; description?: string }) => createSuite(projectId ?? '', values),
    onSuccess: async (suite) => {
      await queryClient.invalidateQueries({ queryKey });
      closeSuiteModal();
      navigate(`/projects/${projectId}/suites/${suite?.id}`);
    },
  });

  const updateSuiteMutation = useMutation({
    mutationFn: (input: { suiteId: string; values: { name: string; description?: string; enabled: boolean } }) =>
      updateSuite(input.suiteId, input.values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
      closeSuiteModal();
    },
  });

  const deleteSuiteMutation = useMutation({
    mutationFn: deleteSuite,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  const navigateToSuite = useCallback(
    (suite: SuiteRow) => {
      const suiteId = suite?.id;
      if (projectId && suiteId) {
        navigate(`/projects/${projectId}/suites/${suiteId}`);
      }
    },
    [navigate, projectId],
  );

  const openEditModal = useCallback(
    (suite: SuiteRow) => {
      setEditingSuite(suite);
      form.setFieldsValue({
        name: suite?.name,
        description: suite?.description,
        enabled: Boolean(suite?.enabled),
      });
      setIsSuiteModalOpen(true);
    },
    [form],
  );

  const confirmDeleteSuite = useCallback(
    (suite: SuiteRow) => {
      const suiteId = suite?.id;
      if (!suiteId) {
        return;
      }

      Modal.confirm({
        title: '删除套件',
        content: '删除后套件下的用例也会被删除。',
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => deleteSuiteMutation.mutate(suiteId),
      });
    },
    [deleteSuiteMutation],
  );

  const columns = useMemo<ColumnsType<SuiteRow>>(
    () => [
      {
        title: '套件名称',
        dataIndex: 'name',
        render: (_value, record) => (
          <Button type="link" onClick={() => navigateToSuite(record)}>
            {record?.name}
          </Button>
        ),
      },
      { title: '描述', dataIndex: 'description' },
      { title: '用例数', dataIndex: 'case_count', render: (value) => value ?? 0 },
      {
        title: '运行次数',
        dataIndex: 'run_count',
        render: (value) => value ?? 0,
      },
      {
        title: '通过率',
        dataIndex: 'pass_rate',
        render: (value: number | null) => {
          if (value == null) {
            return '-';
          }
          return `${value}%`;
        },
      },
      {
        title: '最近运行',
        key: 'last_run',
        render: (_value, record) => {
          if (!record?.last_run_status) {
            return '-';
          }
          return (
            <Space size={4}>
              <Tag color={record.last_run_status === 'success' ? 'success' : record.last_run_status === 'failed' ? 'error' : 'warning'}>
                {record.last_run_status === 'success' ? '成功' : record.last_run_status === 'failed' ? '失败' : '已取消'}
              </Tag>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {record.last_run_at ? record.last_run_at.slice(0, 16).replace('T', ' ') : ''}
              </Typography.Text>
            </Space>
          );
        },
      },
      {
        title: '状态',
        dataIndex: 'enabled',
        render: (enabled) => (enabled ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>),
      },
      {
        title: '操作',
        key: 'actions',
        render: (_value, record) => (
          <Space>
            <Button type="link" onClick={() => navigateToSuite(record)}>
              进入
            </Button>
            <Button type="link" icon={<EditOutlined />} aria-label="编辑套件" onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Button type="link" danger icon={<DeleteOutlined />} aria-label="删除套件" onClick={() => confirmDeleteSuite(record)}>
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [confirmDeleteSuite, navigateToSuite, openEditModal],
  );

  const openCreateModal = () => {
    setEditingSuite(null);
    form.setFieldsValue({ enabled: true });
    setIsSuiteModalOpen(true);
  };

  const closeSuiteModal = useCallback(() => {
    setEditingSuite(null);
    setIsSuiteModalOpen(false);
    form.resetFields();
  }, [form]);

  const handleSaveSuite = (values: SuiteFormValues) => {
    const name = values?.name?.trim();
    if (!name) {
      return;
    }

    const description = values?.description?.trim();
    if (editingSuite?.id) {
      updateSuiteMutation.mutate({
        suiteId: editingSuite.id,
        values: {
          name,
          description: description ?? '',
          enabled: Boolean(values?.enabled),
        },
      });
      return;
    }

    createSuiteMutation.mutate({ name, description: description ? description : undefined });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          测试套件
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建套件
        </Button>
      </Space>
      <Table
        loading={isLoading}
        rowKey="id"
        columns={columns}
        dataSource={data}
      />
      <Modal
        title={editingSuite ? '编辑套件' : '新建套件'}
        open={isSuiteModalOpen}
        onCancel={closeSuiteModal}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSaveSuite}>
          <Form.Item label="套件名称" name="name" rules={[{ required: true, message: '请输入套件名称' }]}>
            <Input placeholder="请输入套件名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入套件描述" />
          </Form.Item>
          {editingSuite ? (
            <Form.Item label="启用套件" name="enabled" valuePropName="checked">
              <Switch />
            </Form.Item>
          ) : null}
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeSuiteModal}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createSuiteMutation.isPending || updateSuiteMutation.isPending}
            >
              {editingSuite ? '保存' : '创建'}
            </Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
