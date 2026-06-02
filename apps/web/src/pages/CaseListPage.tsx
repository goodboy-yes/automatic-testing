import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createCase, deleteCase, listCases, type CaseListItem } from '../api/cases';
import { createCaseRun, getRunArtifactUrl, type RunStatus } from '../api/runs';

interface CaseFormValues {
  name?: string;
  description?: string;
  yamlText?: string;
}

const defaultYamlText = [
  'web:',
  '  url: https://example.com',
  'tasks:',
  '  - name: 新用例',
  '    flow:',
  '      - aiAssert: 页面加载成功',
  '',
].join('\n');

export function CaseListPage() {
  const [form] = Form.useForm<CaseFormValues>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const casesQuery = useQuery({
    queryKey: ['cases'],
    queryFn: listCases,
    refetchInterval: 2000,
  });

  const createCaseMutation = useMutation({
    mutationFn: createCase,
    onSuccess: async (testCase) => {
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
      setIsCreateModalOpen(false);
      form.resetFields();
      navigate(`/cases/${testCase?.id}`);
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: deleteCase,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  const createRunMutation = useMutation({
    mutationFn: createCaseRun,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  const columns = useMemo<ColumnsType<CaseListItem>>(
    () => [
      {
        title: '用例名称',
        dataIndex: 'name',
        render: (_value, record) => (
          <Button type="link" onClick={() => navigate(`/cases/${record?.id}`)}>
            {record?.name}
          </Button>
        ),
      },
      {
        title: '描述',
        dataIndex: 'description',
        render: (value: string) => value || '-',
      },
      {
        title: '最近状态',
        dataIndex: 'latest_run_status',
        width: 120,
        render: (status: RunStatus | null) => (status ? renderStatusTag(status) : <Tag>未运行</Tag>),
      },
      {
        title: '报告',
        key: 'report',
        width: 120,
        render: (_value, record) =>
          record?.latest_run_id && record?.latest_visual_report_path ? (
            <Typography.Link
              href={getRunArtifactUrl(record.latest_run_id, record.latest_visual_report_path)}
              target="_blank"
              rel="noreferrer"
            >
              查看报告
            </Typography.Link>
          ) : (
            '-'
          ),
      },
      {
        title: '更新时间',
        dataIndex: 'updated_at',
        width: 180,
        render: (value: string) => formatDateTime(value),
      },
      {
        title: '操作',
        key: 'actions',
        width: 260,
        render: (_value, record) => (
          <Space>
            <Button icon={<PlayCircleOutlined />} onClick={() => createRunMutation.mutate(record.id)}>
              运行
            </Button>
            <Button icon={<EditOutlined />} onClick={() => navigate(`/cases/${record?.id}`)}>
              编辑
            </Button>
            <Button danger icon={<DeleteOutlined />} aria-label="删除用例" onClick={() => confirmDeleteCase(record)}>
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [createRunMutation, navigate],
  );

  const openCreateModal = () => {
    form.setFieldsValue({ yamlText: defaultYamlText });
    setIsCreateModalOpen(true);
  };

  const closeCreateModal = () => {
    setIsCreateModalOpen(false);
    form.resetFields();
  };

  const handleCreateCase = (values: CaseFormValues) => {
    const name = values?.name?.trim();
    const yamlText = values?.yamlText ?? '';
    if (!name) {
      return;
    }

    createCaseMutation.mutate({
      name,
      description: values?.description?.trim() ?? '',
      yamlText,
    });
  };

  const confirmDeleteCase = (testCase: CaseListItem) => {
    const caseId = testCase?.id;
    if (!caseId) {
      return;
    }

    Modal.confirm({
      title: '删除用例',
      content: '删除后用例、关联运行记录和报告产物都会被删除。',
      okText: '删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => deleteCaseMutation.mutate(caseId),
    });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          测试用例
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
          新建用例
        </Button>
      </Space>
      {casesQuery.isError ? <Alert type="error" title="用例列表加载失败" showIcon /> : null}
      {createRunMutation.isError ? <Alert type="error" title="创建运行任务失败" showIcon /> : null}
      <Table loading={casesQuery.isLoading} rowKey="id" columns={columns} dataSource={casesQuery.data ?? []} />
      <Modal title="新建用例" open={isCreateModalOpen} onCancel={closeCreateModal} footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={handleCreateCase} initialValues={{ yamlText: defaultYamlText }}>
          <Form.Item label="用例名称" name="name" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Midscene YAML" name="yamlText" rules={[{ required: true, message: '请输入 Midscene YAML' }]}>
            <Input.TextArea rows={12} />
          </Form.Item>
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeCreateModal}>取消</Button>
            <Button type="primary" htmlType="submit" loading={createCaseMutation.isPending}>
              创建
            </Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}

function renderStatusTag(status: RunStatus) {
  const colorMap: Record<RunStatus, string> = {
    pending: 'default',
    running: 'processing',
    success: 'success',
    failed: 'error',
    canceled: 'warning',
  };

  return <Tag color={colorMap[status]}>{statusLabel(status)}</Tag>;
}

function statusLabel(status: RunStatus) {
  const labels: Record<RunStatus, string> = {
    pending: '排队中',
    running: '运行中',
    success: '成功',
    failed: '失败',
    canceled: '已取消',
  };
  return labels[status];
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.slice(0, 19).replace('T', ' ') : '-';
}
