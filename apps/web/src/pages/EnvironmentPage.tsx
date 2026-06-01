import { PlusOutlined } from '@ant-design/icons';
import { Button, Space, Table, Typography } from 'antd';

export function EnvironmentPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          环境配置
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />}>
          新建环境
        </Button>
      </Space>
      <Table
        rowKey="id"
        columns={[
          { title: '名称', dataIndex: 'name' },
          { title: 'Base URL', dataIndex: 'baseUrl' },
        ]}
        dataSource={[]}
      />
    </Space>
  );
}
