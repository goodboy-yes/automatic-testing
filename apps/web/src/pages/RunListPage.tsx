import { Space, Table, Typography } from 'antd';

export function RunListPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Typography.Title level={3} style={{ margin: 0 }}>
        执行记录
      </Typography.Title>
      <Table
        rowKey="id"
        columns={[
          { title: '状态', dataIndex: 'status' },
          { title: '开始时间', dataIndex: 'startedAt' },
        ]}
        dataSource={[]}
      />
    </Space>
  );
}
