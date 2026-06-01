import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Descriptions, Space, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { getRun, getRunArtifactUrl, type RunCaseRow, type RunRow, type RunStepRow } from '../api/runs';

export function RunReportPage() {
  const { runId } = useParams();
  const runQuery = useQuery({
    queryKey: ['run', runId],
    queryFn: () => getRun(runId ?? ''),
    enabled: Boolean(runId),
  });
  const run = runQuery.data?.run;
  const runArtifactId = run?.id ?? runId ?? '';
  const caseByRunCaseId = useMemo(() => {
    const entries = runQuery.data?.cases?.map((runCase) => [runCase.id, runCase] as const) ?? [];
    return new Map(entries);
  }, [runQuery.data?.cases]);

  const caseColumns = useMemo<ColumnsType<RunCaseRow>>(
    () => [
      { title: '用例 ID', dataIndex: 'test_case_id' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (status: RunCaseRow['status']) => renderStatusTag(status),
      },
      {
        title: '耗时',
        dataIndex: 'duration_ms',
        render: (value: number | null) => formatDuration(value),
      },
      { title: '错误信息', dataIndex: 'error_message', render: (value: string | null) => value ?? '-' },
      {
        title: '产物路径',
        dataIndex: 'artifact_path',
        render: (value: string | null) => renderCaseArtifactLink(runArtifactId, value),
      },
    ],
    [runArtifactId],
  );
  const stepColumns = useMemo<ColumnsType<RunStepRow>>(
    () => [
      {
        title: '用例 ID',
        dataIndex: 'run_case_id',
        render: (_value, record) => caseByRunCaseId.get(record.run_case_id)?.test_case_id ?? record.run_case_id,
      },
      { title: '#', dataIndex: 'step_index', render: (value: number) => value + 1, width: 64 },
      { title: '步骤标题', dataIndex: 'step_title' },
      { title: '类型', dataIndex: 'step_type' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (status: RunStepRow['status']) => renderStatusTag(status),
      },
      {
        title: '耗时',
        dataIndex: 'duration_ms',
        render: (value: number | null) => formatDuration(value),
      },
      { title: '错误信息', dataIndex: 'error_message', render: (value: string | null) => value ?? '-' },
      {
        title: '截图',
        dataIndex: 'screenshot_path',
        render: (value: string | null) => renderArtifactLink(runArtifactId, value, '查看截图'),
      },
    ],
    [caseByRunCaseId, runArtifactId],
  );

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3}>执行报告</Typography.Title>
      {runQuery.isError ? <Alert type="error" title="执行报告加载失败" showIcon /> : null}
      <Card>
        <Descriptions
          bordered
          items={[
            { key: 'status', label: '状态', children: run ? renderStatusTag(run.status) : '-' },
            { key: 'scope', label: '范围', children: run ? scopeTypeLabel(run.scope_type) : '-' },
            {
              key: 'totals',
              label: '通过 / 失败 / 总数',
              children: run ? `${run.passed_cases} / ${run.failed_cases} / ${run.total_cases}` : '-',
            },
            { key: 'environment', label: '环境 ID', children: run?.environment_id ?? '-' },
            { key: 'startedAt', label: '开始时间', children: formatDateTime(run?.started_at ?? null) },
            { key: 'finishedAt', label: '结束时间', children: formatDateTime(run?.finished_at ?? null) },
            { key: 'duration', label: '耗时', children: formatDuration(run?.duration_ms ?? null) },
          ]}
        />
        <Tabs
          style={{ marginTop: 16 }}
          items={[
            {
              key: 'cases',
              label: '用例结果',
              children: (
                <Table
                  loading={runQuery.isLoading}
                  rowKey="id"
                  columns={caseColumns}
                  dataSource={runQuery.data?.cases ?? []}
                  pagination={false}
                />
              ),
            },
            {
              key: 'steps',
              label: '步骤结果',
              children: (
                <Table
                  loading={runQuery.isLoading}
                  rowKey="id"
                  columns={stepColumns}
                  dataSource={runQuery.data?.steps ?? []}
                  pagination={false}
                />
              ),
            },
            {
              key: 'logs',
              label: '日志',
              children: renderRunArtifactLinks(runArtifactId),
            },
          ]}
        />
      </Card>
    </Space>
  );
}

function renderRunArtifactLinks(runId: string) {
  if (!runId) {
    return <Typography.Text type="secondary">暂无产物</Typography.Text>;
  }

  return (
    <Space size={12}>
      <Typography.Link href={getRunArtifactUrl(runId, 'midscene.yaml')} target="_blank" rel="noreferrer">
        运行 YAML
      </Typography.Link>
      <Typography.Link href={getRunArtifactUrl(runId, 'logs/run.log')} target="_blank" rel="noreferrer">
        运行日志
      </Typography.Link>
    </Space>
  );
}

function renderCaseArtifactLink(runId: string, artifactPath: string | null) {
  if (!artifactPath || !runId) {
    return '-';
  }

  return (
    <Space size={8}>
      <Typography.Text code>{artifactPath}</Typography.Text>
      <Typography.Link href={getRunArtifactUrl(runId, `${artifactPath}/midscene.yaml`)} target="_blank" rel="noreferrer">
        用例 YAML
      </Typography.Link>
    </Space>
  );
}

function renderArtifactLink(runId: string, artifactPath: string | null, label: string) {
  if (!artifactPath || !runId) {
    return '-';
  }

  return (
    <Typography.Link href={getRunArtifactUrl(runId, artifactPath)} target="_blank" rel="noreferrer">
      {label}
    </Typography.Link>
  );
}

function renderStatusTag(status: RunRow['status']) {
  const colorMap: Record<RunRow['status'], string> = {
    pending: 'default',
    running: 'processing',
    success: 'success',
    failed: 'error',
    canceled: 'warning',
  };

  return <Tag color={colorMap[status]}>{statusLabel(status)}</Tag>;
}

function statusLabel(status: RunRow['status']) {
  const labels: Record<RunRow['status'], string> = {
    pending: '排队中',
    running: '运行中',
    success: '成功',
    failed: '失败',
    canceled: '已取消',
  };
  return labels[status];
}

function scopeTypeLabel(scopeType: RunRow['scope_type']) {
  const labels: Record<RunRow['scope_type'], string> = {
    case: '用例',
    suite: '套件',
    selection: '选中用例',
  };
  return labels[scopeType];
}

function formatDateTime(value: string | null) {
  return value ? value.slice(0, 19).replace('T', ' ') : '-';
}

function formatDuration(value: number | null) {
  if (typeof value !== 'number') {
    return '-';
  }

  return `${value} ms`;
}
