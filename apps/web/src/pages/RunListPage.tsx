import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cancelRun, listRuns, type RunRow } from '../api/runs';

const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'pending', label: '排队中' },
  { value: 'running', label: '运行中' },
  { value: 'success', label: '成功' },
  { value: 'failed', label: '失败' },
  { value: 'canceled', label: '已取消' },
];

const SCOPE_OPTIONS = [
  { value: '', label: '全部范围' },
  { value: 'case', label: '用例' },
  { value: 'suite', label: '套件' },
  { value: 'selection', label: '选中用例' },
];

export function RunListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [scopeTypeFilter, setScopeTypeFilter] = useState<string>('');

  const { data = [], isLoading } = useQuery({
    queryKey: ['runs', projectId, statusFilter, scopeTypeFilter],
    queryFn: () =>
      listRuns(projectId ?? '', {
        status: statusFilter || undefined,
        scopeType: scopeTypeFilter || undefined,
      }),
    enabled: Boolean(projectId),
  });
  const cancelRunMutation = useMutation({
    mutationFn: (runId: string) => cancelRun(runId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['runs', projectId] });
    },
  });

  const columns = useMemo<ColumnsType<RunRow>>(
    () => [
      {
        title: '状态',
        dataIndex: 'status',
        render: (status: RunRow['status']) => renderStatusTag(status),
      },
      {
        title: '范围',
        dataIndex: 'scope_type',
        render: (scopeType: RunRow['scope_type']) => scopeTypeLabel(scopeType),
      },
      {
        title: '通过 / 失败 / 总数',
        key: 'totals',
        render: (_value, record) => `${record?.passed_cases} / ${record?.failed_cases} / ${record?.total_cases}`,
      },
      {
        title: '开始时间',
        dataIndex: 'started_at',
        render: (value: string | null) => formatDateTime(value),
      },
      {
        title: '结束时间',
        dataIndex: 'finished_at',
        render: (value: string | null) => formatDateTime(value),
      },
      {
        title: '耗时',
        dataIndex: 'duration_ms',
        render: (value: number | null) => formatDuration(value),
      },
      {
        title: '创建时间',
        dataIndex: 'created_at',
        render: (value: string) => formatDateTime(value),
      },
      {
        title: '操作',
        key: 'actions',
        render: (_value, record) => (
          <Space size={4}>
            <Button
              type="link"
              onClick={() => projectId && record?.id && navigate(`/projects/${projectId}/runs/${record.id}`)}
            >
              查看报告
            </Button>
            {isCancelableRun(record.status) ? (
              <Button
                danger
                loading={cancelRunMutation.isPending && cancelRunMutation.variables === record.id}
                type="link"
                onClick={() => record?.id && cancelRunMutation.mutate(record.id)}
              >
                取消运行
              </Button>
            ) : null}
          </Space>
        ),
      },
    ],
    [cancelRunMutation, navigate, projectId],
  );

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        执行记录
      </Typography.Title>
      <Space size={12}>
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_OPTIONS}
          style={{ width: 140 }}
        />
        <Select
          value={scopeTypeFilter}
          onChange={setScopeTypeFilter}
          options={SCOPE_OPTIONS}
          style={{ width: 140 }}
        />
      </Space>
      <Table loading={isLoading} rowKey="id" columns={columns} dataSource={data} />
    </Space>
  );
}

function isCancelableRun(status: RunRow['status']) {
  return status === 'pending' || status === 'running';
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
