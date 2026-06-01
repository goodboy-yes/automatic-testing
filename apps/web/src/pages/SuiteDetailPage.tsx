import { PlayCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Space, Table, Typography } from 'antd';

export function SuiteDetailPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          套件详情
        </Typography.Title>
        <Space>
          <Button icon={<PlayCircleOutlined />}>运行套件</Button>
          <Button type="primary" icon={<PlusOutlined />}>
            新建用例
          </Button>
        </Space>
      </Space>
      <Table
        rowKey="id"
        columns={[
          { title: '用例名称', dataIndex: 'name' },
          { title: '标签', dataIndex: 'tags' },
        ]}
        dataSource={[]}
      />
    </Space>
  );
}
