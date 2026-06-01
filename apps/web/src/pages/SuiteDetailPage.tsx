import { DeleteOutlined, EditOutlined, PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useMemo, useState } from 'react';
import type { Key } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { createCase, deleteCase, listCases, updateCase, type CaseRow } from '../api/cases';
import { listEnvironments } from '../api/environments';
import { createRun, type CreateRunInput } from '../api/runs';
import { getSuite } from '../api/suites';

interface CaseFormValues {
  name?: string;
  description?: string;
  enabled?: boolean;
  tagsText?: string;
}

export function SuiteDetailPage() {
  const { projectId, suiteId } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm<CaseFormValues>();
  const [editingCase, setEditingCase] = useState<CaseRow | null>(null);
  const [isCaseModalOpen, setIsCaseModalOpen] = useState(false);
  const [selectedCaseIds, setSelectedCaseIds] = useState<Key[]>([]);
  const queryClient = useQueryClient();
  const suiteQueryKey = useMemo(() => ['suite', suiteId], [suiteId]);
  const casesQueryKey = useMemo(() => ['cases', suiteId], [suiteId]);
  const { data: suite } = useQuery({
    queryKey: suiteQueryKey,
    queryFn: () => getSuite(suiteId ?? ''),
    enabled: Boolean(suiteId),
  });
  const { data = [], isLoading } = useQuery({
    queryKey: casesQueryKey,
    queryFn: () => listCases(suiteId ?? ''),
    enabled: Boolean(suiteId),
  });
  const { data: environments = [], isLoading: isEnvironmentsLoading } = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => listEnvironments(projectId ?? ''),
    enabled: Boolean(projectId),
  });
  const defaultEnvironmentId = useMemo(
    () => (environments.find((environment) => environment?.is_default)?.id ?? environments?.[0]?.id),
    [environments],
  );

  const createCaseMutation = useMutation({
    mutationFn: (values: { name: string; description?: string }) => createCase(suiteId ?? '', values),
    onSuccess: async (testCase) => {
      await queryClient.invalidateQueries({ queryKey: casesQueryKey });
      closeCaseModal();
      navigate(`/projects/${projectId}/cases/${testCase?.id}`);
    },
  });

  const updateCaseMutation = useMutation({
    mutationFn: (input: { caseId: string; values: { name: string; description?: string; enabled: boolean; tags: string[] } }) =>
      updateCase(input.caseId, input.values),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: casesQueryKey });
      closeCaseModal();
    },
  });

  const deleteCaseMutation = useMutation({
    mutationFn: deleteCase,
    onSuccess: async (_result, deletedCaseId) => {
      setSelectedCaseIds((currentCaseIds) => currentCaseIds.filter((caseId) => caseId !== deletedCaseId));
      await queryClient.invalidateQueries({ queryKey: casesQueryKey });
    },
  });

  const createRunMutation = useMutation({
    mutationFn: (input: CreateRunInput) => createRun(input),
    onSuccess: (run) => {
      if (projectId && run?.id) {
        navigate(`/projects/${projectId}/runs/${run.id}`);
      }
    },
  });

  const navigateToCase = useCallback(
    (testCase: CaseRow) => {
      const caseId = testCase?.id;
      if (projectId && caseId) {
        navigate(`/projects/${projectId}/cases/${caseId}`);
      }
    },
    [navigate, projectId],
  );

  const parseTags = (testCase: CaseRow): string[] => {
    try {
      const parsed: unknown = JSON.parse(testCase?.tags_json ?? '[]');
      return Array.isArray(parsed) ? parsed.filter((tag): tag is string => typeof tag === 'string') : [];
    } catch {
      return [];
    }
  };

  const openEditModal = useCallback(
    (testCase: CaseRow) => {
      setEditingCase(testCase);
      form.setFieldsValue({
        name: testCase?.name,
        description: testCase?.description,
        enabled: Boolean(testCase?.enabled),
        tagsText: parseTags(testCase).join(', '),
      });
      setIsCaseModalOpen(true);
    },
    [form],
  );

  const confirmDeleteCase = useCallback(
    (testCase: CaseRow) => {
      const caseId = testCase?.id;
      if (!caseId) {
        return;
      }

      Modal.confirm({
        title: '删除用例',
        content: '删除后用例定义和步骤也会被删除。',
        okText: '删除',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => deleteCaseMutation.mutate(caseId),
      });
    },
    [deleteCaseMutation],
  );

  const columns = useMemo<ColumnsType<CaseRow>>(
    () => [
      {
        title: '用例名称',
        dataIndex: 'name',
        render: (_value, record) => (
          <Button type="link" onClick={() => navigateToCase(record)}>
            {record?.name}
          </Button>
        ),
      },
      { title: '描述', dataIndex: 'description' },
      {
        title: '标签',
        key: 'tags',
        render: (_value, record) => (
          <Space>
            {parseTags(record).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </Space>
        ),
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
            <Button type="link" onClick={() => navigateToCase(record)}>
              编辑步骤
            </Button>
            <Button type="link" icon={<EditOutlined />} aria-label="编辑用例" onClick={() => openEditModal(record)}>
              编辑
            </Button>
            <Button type="link" danger icon={<DeleteOutlined />} aria-label="删除用例" onClick={() => confirmDeleteCase(record)}>
              删除
            </Button>
          </Space>
        ),
      },
    ],
    [confirmDeleteCase, navigateToCase, openEditModal],
  );

  const openCreateModal = () => {
    setEditingCase(null);
    form.setFieldsValue({ enabled: true, tagsText: '' });
    setIsCaseModalOpen(true);
  };

  const closeCaseModal = useCallback(() => {
    setEditingCase(null);
    setIsCaseModalOpen(false);
    form.resetFields();
  }, [form]);

  const parseTagsText = (tagsText?: string) =>
    tagsText
      ?.split(',')
      ?.map((tag) => tag.trim())
      ?.filter(Boolean) ?? [];

  const runControlsDisabled =
    !projectId || !suiteId || !defaultEnvironmentId || isEnvironmentsLoading || createRunMutation.isPending;

  const handleRunSuite = () => {
    if (!projectId || !suiteId || !defaultEnvironmentId) {
      return;
    }

    createRunMutation.mutate({
      projectId,
      environmentId: defaultEnvironmentId,
      scopeType: 'suite',
      scopeId: suiteId,
    });
  };

  const handleRunSelection = () => {
    if (!projectId || !defaultEnvironmentId) {
      return;
    }

    const caseIds = selectedCaseIds.filter((caseId): caseId is string => typeof caseId === 'string');
    if (caseIds.length === 0) {
      return;
    }

    createRunMutation.mutate({
      projectId,
      environmentId: defaultEnvironmentId,
      scopeType: 'selection',
      caseIds,
    });
  };

  const handleSaveCase = (values: CaseFormValues) => {
    const name = values?.name?.trim();
    if (!name) {
      return;
    }

    const description = values?.description?.trim();
    if (editingCase?.id) {
      updateCaseMutation.mutate({
        caseId: editingCase.id,
        values: {
          name,
          description: description ?? '',
          enabled: Boolean(values?.enabled),
          tags: parseTagsText(values?.tagsText),
        },
      });
      return;
    }

    createCaseMutation.mutate({ name, description: description ? description : undefined });
  };

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {suite?.name ?? '套件详情'}
        </Typography.Title>
        <Space>
          <Button
            icon={<PlayCircleOutlined />}
            disabled={runControlsDisabled}
            loading={createRunMutation.isPending}
            onClick={handleRunSuite}
          >
            运行套件
          </Button>
          <Button
            icon={<PlayCircleOutlined />}
            disabled={runControlsDisabled || selectedCaseIds.length === 0}
            loading={createRunMutation.isPending}
            onClick={handleRunSelection}
          >
            运行选中
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
            新建用例
          </Button>
        </Space>
      </Space>
      {!isEnvironmentsLoading && environments.length === 0 ? (
        <Alert type="warning" title="请先创建环境后再运行用例。" showIcon />
      ) : null}
      {createRunMutation.isError ? <Alert type="error" title="创建运行任务失败" showIcon /> : null}
      {selectedCaseIds.length > 0 ? <Typography.Text>已选择 {selectedCaseIds.length} 个用例</Typography.Text> : null}
      <Table
        loading={isLoading}
        rowKey="id"
        rowSelection={{
          selectedRowKeys: selectedCaseIds,
          onChange: setSelectedCaseIds,
        }}
        columns={columns}
        dataSource={data}
      />
      <Modal
        title={editingCase ? '编辑用例' : '新建用例'}
        open={isCaseModalOpen}
        onCancel={closeCaseModal}
        footer={null}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={handleSaveCase}>
          <Form.Item label="用例名称" name="name" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input placeholder="请输入用例名称" />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} placeholder="请输入用例描述" />
          </Form.Item>
          {editingCase ? (
            <>
              <Form.Item label="标签" name="tagsText">
                <Input placeholder="多个标签用英文逗号分隔" />
              </Form.Item>
              <Form.Item label="启用用例" name="enabled" valuePropName="checked">
                <Switch />
              </Form.Item>
            </>
          ) : null}
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeCaseModal}>取消</Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={createCaseMutation.isPending || updateCaseMutation.isPending}
            >
              {editingCase ? '保存' : '创建'}
            </Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}
