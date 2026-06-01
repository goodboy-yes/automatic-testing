import { useQuery } from '@tanstack/react-query';
import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { listRuns, type RunRow } from '../api/runs';

export function RunListPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ['runs', projectId],
    queryFn: () => listRuns(projectId ?? ''),
    enabled: Boolean(projectId),
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
          <Button type="link" onClick={() => projectId && record?.id && navigate(`/projects/${projectId}/runs/${record.id}`)}>
            查看报告
          </Button>
        ),
      },
    ],
    [navigate, projectId],
  );

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        执行记录
      </Typography.Title>
      <Table loading={isLoading} rowKey="id" columns={columns} dataSource={data} />
    </Space>
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
