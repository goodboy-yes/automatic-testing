import { ArrowLeftOutlined, PlayCircleOutlined, SaveOutlined, StopOutlined } from '@ant-design/icons';
import Editor from '@monaco-editor/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Descriptions, Form, Input, Space, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { getCase, updateCase } from '../api/cases';
import {
  cancelRun,
  createCaseRun,
  getRun,
  getRunArtifactUrl,
  listCaseRuns,
  subscribeRunEvents,
  type RunArtifactRow,
  type RunRow,
  type RunStatus,
} from '../api/runs';

interface CaseFormValues {
  name?: string;
  description?: string;
}

export function CaseEditorPage() {
  const { caseId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form] = Form.useForm<CaseFormValues>();
  const [yamlText, setYamlText] = useState('');
  const [dirty, setDirty] = useState(false);

  const caseQuery = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => getCase(caseId ?? ''),
    enabled: Boolean(caseId),
  });

  const runsQuery = useQuery({
    queryKey: ['case-runs', caseId],
    queryFn: () => listCaseRuns(caseId ?? ''),
    enabled: Boolean(caseId),
    refetchInterval: 2000,
  });

  const latestRun = runsQuery.data?.[0];
  const runDetailQuery = useQuery({
    queryKey: ['run', latestRun?.id],
    queryFn: () => getRun(latestRun?.id ?? ''),
    enabled: Boolean(latestRun?.id),
    refetchInterval: latestRun && isCancelableRun(latestRun.status) ? 2000 : false,
  });
  const runDetail = runDetailQuery.data;
  const currentRun = runDetail?.run ?? latestRun;
  const visualReport = useMemo(
    () => runDetail?.artifacts?.find((artifact) => artifact?.type === 'visual_report'),
    [runDetail?.artifacts],
  );

  useEffect(() => {
    const testCase = caseQuery.data;
    if (!testCase) {
      return;
    }

    form.setFieldsValue({
      name: testCase?.name,
      description: testCase?.description,
    });
    setYamlText(testCase?.yaml_text ?? '');
    setDirty(false);
  }, [caseQuery.data, form]);

  useEffect(() => {
    if (!currentRun?.id || !isCancelableRun(currentRun.status)) {
      return undefined;
    }

    return subscribeRunEvents(currentRun.id, () => {
      void queryClient.invalidateQueries({ queryKey: ['case-runs', caseId] });
      void queryClient.invalidateQueries({ queryKey: ['run', currentRun.id] });
      void queryClient.invalidateQueries({ queryKey: ['cases'] });
    });
  }, [caseId, currentRun?.id, currentRun?.status, queryClient]);

  const updateCaseMutation = useMutation({
    mutationFn: (values: { name: string; description: string; yamlText: string }) =>
      updateCase(caseId ?? '', values),
    onSuccess: async (testCase) => {
      form.setFieldsValue({
        name: testCase?.name,
        description: testCase?.description,
      });
      setYamlText(testCase?.yaml_text ?? '');
      setDirty(false);
      await queryClient.invalidateQueries({ queryKey: ['case', caseId] });
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  const createRunMutation = useMutation({
    mutationFn: () => createCaseRun(caseId ?? ''),
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: ['case-runs', caseId] });
      await queryClient.invalidateQueries({ queryKey: ['run', run?.id] });
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  const cancelRunMutation = useMutation({
    mutationFn: (runId: string) => cancelRun(runId),
    onSuccess: async (run) => {
      await queryClient.invalidateQueries({ queryKey: ['case-runs', caseId] });
      await queryClient.invalidateQueries({ queryKey: ['run', run?.id] });
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
    },
  });

  const handleSave = async () => {
    const values = await form.validateFields();
    const name = values?.name?.trim();
    if (!name) {
      return;
    }

    updateCaseMutation.mutate({
      name,
      description: values?.description?.trim() ?? '',
      yamlText,
    });
  };

  const handleYamlChange = (value?: string) => {
    setYamlText(value ?? '');
    setDirty(true);
  };

  const runButtonDisabled = !caseId || dirty || createRunMutation.isPending || updateCaseMutation.isPending;
  const visualReportUrl =
    currentRun?.id && visualReport?.path ? getRunArtifactUrl(currentRun.id, visualReport.path) : undefined;

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Space>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/cases')}>
            返回
          </Button>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {caseQuery.data?.name ?? '用例编辑'}
          </Typography.Title>
          {dirty ? <Tag color="orange">未保存</Tag> : null}
        </Space>
        <Space>
          <Button
            aria-label="运行用例"
            icon={<PlayCircleOutlined />}
            disabled={runButtonDisabled}
            loading={createRunMutation.isPending}
            onClick={() => createRunMutation.mutate()}
          >
            运行
          </Button>
          <Button type="primary" icon={<SaveOutlined />} loading={updateCaseMutation.isPending} onClick={handleSave}>
            保存
          </Button>
        </Space>
      </Space>
      {dirty ? <Alert type="info" title="请先保存用例，再运行最新 YAML。" showIcon /> : null}
      {caseQuery.isError ? <Alert type="error" title="用例加载失败" showIcon /> : null}
      {updateCaseMutation.isError ? <Alert type="error" title="保存失败，请检查 YAML 格式。" showIcon /> : null}
      {createRunMutation.isError ? <Alert type="error" title="创建运行任务失败" showIcon /> : null}
      <Card>
        <Form form={form} layout="vertical">
          <Form.Item label="用例名称" name="name" rules={[{ required: true, message: '请输入用例名称' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item label="Midscene YAML" required>
            <Editor
              height="520px"
              defaultLanguage="yaml"
              value={yamlText}
              onChange={handleYamlChange}
              options={{ minimap: { enabled: false } }}
            />
          </Form.Item>
        </Form>
      </Card>
      <Card title="运行状态">
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          <Descriptions
            bordered
            items={[
              { key: 'status', label: '状态', children: currentRun ? renderStatusTag(currentRun.status) : '-' },
              { key: 'startedAt', label: '开始时间', children: formatDateTime(currentRun?.started_at) },
              { key: 'finishedAt', label: '结束时间', children: formatDateTime(currentRun?.finished_at) },
              { key: 'duration', label: '耗时', children: formatDuration(currentRun?.duration_ms) },
              { key: 'exitCode', label: '退出码', children: currentRun?.exit_code ?? '-' },
              { key: 'error', label: '错误信息', children: currentRun?.error_message ?? '-' },
            ]}
          />
          <Space>
            {currentRun && isCancelableRun(currentRun.status) ? (
              <Button
                danger
                icon={<StopOutlined />}
                loading={cancelRunMutation.isPending}
                onClick={() => cancelRunMutation.mutate(currentRun.id)}
              >
                取消运行
              </Button>
            ) : null}
            {visualReportUrl ? (
              <Typography.Link href={visualReportUrl} target="_blank" rel="noreferrer">
                查看 Midscene 报告
              </Typography.Link>
            ) : (
              <Typography.Text type="secondary">{currentRun ? '暂无报告' : '暂无运行记录'}</Typography.Text>
            )}
            {renderArtifactLinks(currentRun, runDetail?.artifacts ?? [])}
          </Space>
        </Space>
      </Card>
    </Space>
  );
}

function isCancelableRun(status: RunStatus) {
  return status === 'pending' || status === 'running';
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

function renderArtifactLinks(run: RunRow | undefined, artifacts: RunArtifactRow[]) {
  if (!run?.id || artifacts.length === 0) {
    return null;
  }

  return artifacts
    .filter((artifact) => artifact?.type !== 'visual_report')
    .map((artifact) => (
      <Typography.Link key={artifact.id} href={getRunArtifactUrl(run.id, artifact.path)} target="_blank" rel="noreferrer">
        {artifactTypeLabel(artifact.type)}
      </Typography.Link>
    ));
}

function artifactTypeLabel(type: RunArtifactRow['type']) {
  const labels: Record<RunArtifactRow['type'], string> = {
    midscene_yaml: 'YAML',
    summary_json: '摘要',
    result_json: '结果',
    visual_report: '报告',
    screenshot: '截图',
    log: '日志',
  };
  return labels[type];
}

function formatDateTime(value: string | null | undefined) {
  return value ? value.slice(0, 19).replace('T', ' ') : '-';
}

function formatDuration(value: number | null | undefined) {
  return typeof value === 'number' ? `${value} ms` : '-';
}
