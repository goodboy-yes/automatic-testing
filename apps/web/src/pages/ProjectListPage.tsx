import { PlusOutlined } from '@ant-design/icons';
import { Button, Layout, Space, Table, Typography } from 'antd';

export function ProjectListPage() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ color: '#fff', fontWeight: 600 }}>Midscene 自动化测试平台</Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Typography.Title level={3} style={{ margin: 0 }}>
              项目
            </Typography.Title>
            <Button type="primary" icon={<PlusOutlined />}>
              新建项目
            </Button>
          </Space>
          <Table
            rowKey="id"
            columns={[
              { title: '项目名称', dataIndex: 'name' },
              { title: '描述', dataIndex: 'description' },
              { title: '更新时间', dataIndex: 'updatedAt' },
            ]}
            dataSource={[]}
          />
        </Space>
      </Layout.Content>
    </Layout>
  );
}
