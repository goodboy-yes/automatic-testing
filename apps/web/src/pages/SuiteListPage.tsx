import { PlusOutlined } from '@ant-design/icons';
import { Button, Space, Table, Typography } from 'antd';

export function SuiteListPage() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%' }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          测试套件
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />}>
          新建套件
        </Button>
      </Space>
      <Table
        rowKey="id"
        columns={[
          { title: '套件名称', dataIndex: 'name' },
          { title: '用例数', dataIndex: 'caseCount' },
        ]}
        dataSource={[]}
      />
    </Space>
  );
}
