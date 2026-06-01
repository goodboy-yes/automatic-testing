import {
  CopyOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  UpOutlined,
} from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { Step } from '@automatic-testing/shared';
import { getCase, previewCaseYaml, updateCaseSteps, type CaseRow } from '../api/cases';
import { listEnvironments, type EnvironmentRow } from '../api/environments';
import { useCaseEditorStore } from '../stores/caseEditorStore';
import {
  createDefaultStep,
  createStepCopy,
  parseCaseDsl,
  parseStoredSteps,
  parseStoredTags,
  serializeCaseDsl,
  type EditorStepType,
} from '../utils/caseDsl';

interface StepFormValues {
  type?: EditorStepType;
  title?: string;
  enabled?: boolean;
  path?: string;
  locate?: string;
  value?: string;
  prompt?: string;
  milliseconds?: number | null;
  action?: string;
  paramsJson?: string;
  timeoutMs?: number | null;
}

const stepTypeOptions: Array<{ label: string; value: EditorStepType }> = [
  { label: '打开页面', value: 'navigate' },
  { label: '等待', value: 'wait' },
  { label: 'AI 点击', value: 'aiTap' },
  { label: 'AI 输入', value: 'aiInput' },
  { label: 'AI 动作', value: 'aiAction' },
  { label: 'AI Act', value: 'aiAct' },
  { label: 'AI 断言', value: 'aiAssert' },
  { label: 'AI 查询', value: 'aiQuery' },
  { label: 'AI 等待条件', value: 'aiWaitFor' },
  { label: '原生动作', value: 'native' },
];

export function CaseEditorPage() {
  const { projectId, caseId } = useParams();
  const queryClient = useQueryClient();
  const [stepForm] = Form.useForm<StepFormValues>();
  const selectedStepType = Form.useWatch('type', stepForm);
  const yamlText = useCaseEditorStore((state) => state.yamlText);
  const dirty = useCaseEditorStore((state) => state.dirty);
  const setYamlText = useCaseEditorStore((state) => state.setYamlText);
  const resetYamlText = useCaseEditorStore((state) => state.resetYamlText);
  const markSaved = useCaseEditorStore((state) => state.markSaved);
  const [steps, setSteps] = useState<Step[]>([]);
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [isStepModalOpen, setIsStepModalOpen] = useState(false);
  const [stepFormError, setStepFormError] = useState('');
  const [yamlError, setYamlError] = useState('');
  const [previewYaml, setPreviewYaml] = useState('');
  const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<string>();

  const caseQuery = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCase(caseId ?? ''),
    enabled: Boolean(caseId),
  });
  const { data: environments = [] } = useQuery({
    queryKey: ['environments', projectId],
    queryFn: () => listEnvironments(projectId ?? ''),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    const testCase = caseQuery.data;
    if (!testCase) {
      return;
    }

    const parsedSteps = parseStoredSteps(testCase?.steps_json);
    setSteps(parsedSteps);
    resetYamlText(buildCaseDslText(testCase, parsedSteps));
    setYamlError('');
    setPreviewYaml('');
  }, [caseQuery.data, resetYamlText]);

  useEffect(() => {
    if (selectedEnvironmentId || environments.length === 0) {
      return;
    }

    const defaultEnvironment = environments.find((environment) => environment?.is_default) ?? environments?.[0];
    if (defaultEnvironment?.id) {
      setSelectedEnvironmentId(defaultEnvironment.id);
    }
  }, [environments, selectedEnvironmentId]);

  const saveStepsMutation = useMutation({
    mutationFn: (nextSteps: Step[]) => updateCaseSteps(caseId ?? '', nextSteps),
    onSuccess: async (updatedCase) => {
      const savedSteps = parseStoredSteps(updatedCase?.steps_json);
      setSteps(savedSteps);
      resetYamlText(buildCaseDslText(updatedCase, savedSteps));
      markSaved();
      await queryClient.invalidateQueries({ queryKey: ['case', caseId] });
    },
  });

  const previewMutation = useMutation({
    mutationFn: (input: { environmentId: string; steps: Step[] }) =>
      previewCaseYaml(caseId ?? '', input),
    onSuccess: (result) => setPreviewYaml(result?.yaml ?? ''),
  });

  const commitSteps = useCallback(
    (nextSteps: Step[]) => {
      setSteps(nextSteps);
      setYamlError('');
      setPreviewYaml('');
      setYamlText(buildCaseDslText(caseQuery.data, nextSteps));
    },
    [caseQuery.data, setYamlText],
  );

  const openCreateStepModal = () => {
    const defaultStep = createDefaultStep('aiTap');
    setEditingStepId(null);
    setStepFormError('');
    stepForm.setFieldsValue(stepToFormValues(defaultStep));
    setIsStepModalOpen(true);
  };

  const openEditStepModal = useCallback(
    (step: Step) => {
      setEditingStepId(step?.id);
      setStepFormError('');
      stepForm.setFieldsValue(stepToFormValues(step));
      setIsStepModalOpen(true);
    },
    [stepForm],
  );

  const closeStepModal = useCallback(() => {
    setIsStepModalOpen(false);
    setEditingStepId(null);
    setStepFormError('');
    stepForm.resetFields();
  }, [stepForm]);

  const handleSaveStep = (values: StepFormValues) => {
    try {
      const nextStep = buildStepFromValues(values, steps.find((step) => step?.id === editingStepId));
      const nextSteps = editingStepId
        ? steps.map((step) => (step?.id === editingStepId ? nextStep : step))
        : [...steps, nextStep];
      commitSteps(nextSteps);
      closeStepModal();
    } catch (error) {
      setStepFormError(error instanceof Error ? error.message : '步骤参数无效');
    }
  };

  const toggleStepEnabled = useCallback(
    (stepId: string, enabled: boolean) => {
      commitSteps(steps.map((step) => (step?.id === stepId ? { ...step, enabled } : step)));
    },
    [commitSteps, steps],
  );

  const copyStep = useCallback(
    (step: Step) => {
      const sourceIndex = steps.findIndex((item) => item?.id === step?.id);
      const nextSteps = [...steps];
      nextSteps.splice(sourceIndex + 1, 0, createStepCopy(step));
      commitSteps(nextSteps);
    },
    [commitSteps, steps],
  );

  const deleteStep = useCallback(
    (stepId: string) => {
      commitSteps(steps.filter((step) => step?.id !== stepId));
    },
    [commitSteps, steps],
  );

  const moveStep = useCallback(
    (stepId: string, offset: -1 | 1) => {
      const currentIndex = steps.findIndex((step) => step?.id === stepId);
      const targetIndex = currentIndex + offset;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= steps.length) {
        return;
      }

      const nextSteps = [...steps];
      const [movedStep] = nextSteps.splice(currentIndex, 1);
      if (!movedStep) {
        return;
      }
      nextSteps.splice(targetIndex, 0, movedStep);
      commitSteps(nextSteps);
    },
    [commitSteps, steps],
  );

  const handleApplyYaml = () => {
    try {
      const parsedSteps = parseCaseDsl(yamlText);
      commitSteps(parsedSteps);
      setYamlText(buildCaseDslText(caseQuery.data, parsedSteps));
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : 'YAML 解析失败');
    }
  };

  const handlePreviewYaml = () => {
    if (!selectedEnvironmentId) {
      return;
    }

    previewMutation.mutate({ environmentId: selectedEnvironmentId, steps });
  };

  const columns = useMemo<ColumnsType<Step>>(
    () => [
      {
        title: '#',
        key: 'index',
        width: 56,
        render: (_value, _record, index) => index + 1,
      },
      {
        title: '步骤',
        dataIndex: 'title',
        render: (_value, record) => (
          <Space>
            <span>{record?.title}</span>
            <Tag>{record?.type}</Tag>
          </Space>
        ),
      },
      {
        title: '启用',
        dataIndex: 'enabled',
        width: 90,
        render: (_value, record) => (
          <Switch
            aria-label="启用步骤"
            checked={record?.enabled}
            onChange={(checked) => toggleStepEnabled(record.id, checked)}
          />
        ),
      },
      {
        title: '操作',
        key: 'actions',
        width: 320,
        render: (_value, record, index) => (
          <Space wrap>
            <Button type="link" icon={<UpOutlined />} disabled={index === 0} onClick={() => moveStep(record.id, -1)}>
              上移
            </Button>
            <Button
              type="link"
              icon={<DownOutlined />}
              disabled={index === steps.length - 1}
              onClick={() => moveStep(record.id, 1)}
            >
              下移
            </Button>
            <Button type="link" icon={<EditOutlined />} onClick={() => openEditStepModal(record)}>
              编辑
            </Button>
            <Button type="link" icon={<CopyOutlined />} onClick={() => copyStep(record)}>
              复制步骤
            </Button>
            <Button type="link" danger icon={<DeleteOutlined />} onClick={() => deleteStep(record.id)}>
              删除步骤
            </Button>
          </Space>
        ),
      },
    ],
    [copyStep, deleteStep, moveStep, openEditStepModal, steps.length, toggleStepEnabled],
  );

  const environmentOptions = useMemo(
    () =>
      environments.map((environment) => ({
        label: environment?.is_default ? `${environment.name}（默认）` : environment.name,
        value: environment.id,
      })),
    [environments],
  );

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {caseQuery.data?.name ?? '用例编辑器'}
          </Typography.Title>
          {dirty ? <Tag color="orange">未保存</Tag> : null}
        </Space>
        <Button
          type="primary"
          icon={<SaveOutlined />}
          loading={saveStepsMutation.isPending}
          onClick={() => saveStepsMutation.mutate(steps)}
        >
          保存用例
        </Button>
      </Space>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={7}>
          <Card
            title="步骤列表"
            extra={
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreateStepModal}>
                添加步骤
              </Button>
            }
          >
            <Table loading={caseQuery.isLoading} rowKey="id" size="small" columns={columns} dataSource={steps} />
          </Card>
        </Col>
        <Col xs={24} xl={11}>
          <Card>
            <Tabs
              items={[
                {
                  key: 'flow',
                  label: '步骤流',
                  children: (
                    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                      <Typography.Text type="secondary">
                        {steps.length > 0 ? `当前用例包含 ${steps.length} 个步骤` : '暂无步骤'}
                      </Typography.Text>
                      <Table rowKey="id" size="small" columns={columns} dataSource={steps} pagination={false} />
                    </Space>
                  ),
                },
                {
                  key: 'yaml',
                  label: 'YAML 源码',
                  children: (
                    <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                      <Editor
                        height="520px"
                        defaultLanguage="yaml"
                        value={yamlText}
                        onChange={(value) => setYamlText(value ?? '')}
                        options={{ minimap: { enabled: false } }}
                      />
                      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                        <Button onClick={handleApplyYaml}>应用 YAML</Button>
                        {yamlError ? <Typography.Text type="danger">{yamlError}</Typography.Text> : null}
                      </Space>
                    </Space>
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col xs={24} xl={6}>
          <Card title="YAML 预览">
            <Space orientation="vertical" size={12} style={{ width: '100%' }}>
              <Select
                placeholder="选择环境"
                value={selectedEnvironmentId}
                options={environmentOptions}
                onChange={setSelectedEnvironmentId}
                style={{ width: '100%' }}
              />
              <Button
                type="primary"
                onClick={handlePreviewYaml}
                loading={previewMutation.isPending}
                disabled={!selectedEnvironmentId}
              >
                预览 YAML
              </Button>
              {previewMutation.isError ? <Alert type="error" message="预览生成失败" /> : null}
              <Editor
                height="420px"
                defaultLanguage="yaml"
                value={previewYaml}
                options={{ readOnly: true, minimap: { enabled: false } }}
              />
            </Space>
          </Card>
        </Col>
      </Row>
      <Modal
        title={editingStepId ? '编辑步骤' : '添加步骤'}
        open={isStepModalOpen}
        onCancel={closeStepModal}
        footer={null}
        destroyOnHidden
      >
        <Form form={stepForm} layout="vertical" onFinish={handleSaveStep}>
          <Form.Item label="步骤类型" name="type" rules={[{ required: true, message: '请选择步骤类型' }]}>
            <Select options={stepTypeOptions} />
          </Form.Item>
          <Form.Item label="步骤标题" name="title" rules={[{ required: true, message: '请输入步骤标题' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="启用步骤" name="enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          {renderParamFields(selectedStepType)}
          <Form.Item label="步骤超时(ms)" name="timeoutMs">
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          {stepFormError ? <Alert type="error" message={stepFormError} style={{ marginBottom: 16 }} /> : null}
          <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
            <Button onClick={closeStepModal}>取消</Button>
            <Button type="primary" htmlType="submit">
              确定
            </Button>
          </Space>
        </Form>
      </Modal>
    </Space>
  );
}

function buildCaseDslText(testCase: CaseRow | undefined, steps: Step[]): string {
  return serializeCaseDsl({
    name: testCase?.name,
    description: testCase?.description,
    tags: parseStoredTags(testCase?.tags_json),
    steps,
  });
}

function renderParamFields(type: EditorStepType | undefined) {
  if (type === 'navigate') {
    return (
      <Form.Item label="页面路径" name="path" rules={[{ required: true, message: '请输入页面路径' }]}>
        <Input placeholder="/login" />
      </Form.Item>
    );
  }

  if (type === 'wait') {
    return (
      <Form.Item label="等待毫秒" name="milliseconds" rules={[{ required: true, message: '请输入等待时间' }]}>
        <InputNumber min={1} precision={0} style={{ width: '100%' }} />
      </Form.Item>
    );
  }

  if (type === 'aiTap') {
    return (
      <Form.Item label="定位描述" name="locate" rules={[{ required: true, message: '请输入定位描述' }]}>
        <Input />
      </Form.Item>
    );
  }

  if (type === 'aiInput') {
    return (
      <>
        <Form.Item label="定位描述" name="locate" rules={[{ required: true, message: '请输入定位描述' }]}>
          <Input />
        </Form.Item>
        <Form.Item label="输入内容" name="value" rules={[{ required: true, message: '请输入输入内容' }]}>
          <Input />
        </Form.Item>
      </>
    );
  }

  if (type === 'native') {
    return (
      <>
        <Form.Item label="动作名称" name="action" rules={[{ required: true, message: '请输入动作名称' }]}>
          <Input placeholder="aiHover" />
        </Form.Item>
        <Form.Item label="参数 JSON" name="paramsJson">
          <Input.TextArea rows={5} placeholder='{"locate":"用户头像"}' />
        </Form.Item>
      </>
    );
  }

  return (
    <Form.Item label="指令描述" name="prompt" rules={[{ required: true, message: '请输入指令描述' }]}>
      <Input.TextArea rows={3} />
    </Form.Item>
  );
}

function stepToFormValues(step: Step): StepFormValues {
  const type = step.type as EditorStepType;
  const values: StepFormValues = {
    type,
    title: step.title,
    enabled: step.enabled,
    timeoutMs: step.timeoutMs,
  };

  if (type === 'navigate') {
    values.path = stringParam(step.params, 'path') ?? '/';
    return values;
  }

  if (type === 'wait') {
    values.milliseconds = numberParam(step.params, 'milliseconds') ?? numberParam(step.params, 'ms') ?? 1000;
    return values;
  }

  if (type === 'aiTap') {
    values.locate = stringParam(step.params, 'locate') ?? '';
    return values;
  }

  if (type === 'aiInput') {
    values.locate = stringParam(step.params, 'locate') ?? '';
    values.value = stringParam(step.params, 'value') ?? '';
    return values;
  }

  if (type === 'native') {
    values.action = stringParam(step.params, 'action') ?? '';
    const { action: _action, ...rest } = step.params;
    values.paramsJson = JSON.stringify(rest, null, 2);
    return values;
  }

  values.prompt = stringParam(step.params, 'prompt') ?? '';
  return values;
}

function buildStepFromValues(values: StepFormValues, existingStep?: Step): Step {
  const type = values.type ?? (existingStep?.type as EditorStepType | undefined) ?? 'aiTap';
  const title = values.title?.trim();
  if (!title) {
    throw new Error('请输入步骤标题');
  }

  const baseStep = existingStep ?? createDefaultStep(type);
  const timeoutMs = values.timeoutMs ?? undefined;
  const step: Step = {
    id: baseStep.id,
    type,
    title,
    enabled: values.enabled ?? true,
    params: buildParamsFromValues(type, values),
  };

  if (timeoutMs) {
    step.timeoutMs = timeoutMs;
  }

  return step;
}

function buildParamsFromValues(type: EditorStepType, values: StepFormValues): Record<string, unknown> {
  if (type === 'navigate') {
    return { path: values.path?.trim() || '/' };
  }

  if (type === 'wait') {
    return { milliseconds: values.milliseconds ?? 1000 };
  }

  if (type === 'aiTap') {
    return { locate: values.locate?.trim() ?? '' };
  }

  if (type === 'aiInput') {
    return { locate: values.locate?.trim() ?? '', value: values.value ?? '' };
  }

  if (type === 'native') {
    return { ...parseParamsJson(values.paramsJson), action: values.action?.trim() ?? '' };
  }

  return { prompt: values.prompt?.trim() ?? '' };
}

function parseParamsJson(paramsJson?: string): Record<string, unknown> {
  if (!paramsJson?.trim()) {
    return {};
  }

  const parsed: unknown = JSON.parse(paramsJson);
  if (!isRecord(parsed)) {
    throw new Error('参数 JSON 必须是对象');
  }
  return parsed;
}

function stringParam(params: Record<string, unknown>, key: string): string | undefined {
  const value = params?.[key];
  return typeof value === 'string' ? value : undefined;
}

function numberParam(params: Record<string, unknown>, key: string): number | undefined {
  const value = params?.[key];
  return typeof value === 'number' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
