import { Layout, Typography } from 'antd';
import { Outlet } from 'react-router-dom';

export function AppLayout() {
  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Text style={{ color: '#fff', fontWeight: 600 }}>
          Midscene 测试平台
        </Typography.Text>
      </Layout.Header>
      <Layout.Content style={{ padding: 24 }}>
        <Outlet />
      </Layout.Content>
    </Layout>
  );
}
