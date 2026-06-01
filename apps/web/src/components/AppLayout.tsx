import {
  DashboardOutlined,
  DatabaseOutlined,
  PlayCircleOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import { Layout, Menu, Typography } from 'antd';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { projectId } = useParams();

  const base = projectId ? `/projects/${projectId}` : '/projects';
  const selectedKey = location.pathname.includes('/environments')
    ? 'environments'
    : location.pathname.includes('/suites')
      ? 'suites'
      : location.pathname.includes('/runs')
        ? 'runs'
        : 'overview';

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Header style={{ display: 'flex', alignItems: 'center' }}>
        <Typography.Text style={{ color: '#fff', fontWeight: 600 }}>Midscene 自动化测试平台</Typography.Text>
      </Layout.Header>
      <Layout>
        <Layout.Sider theme="light" width={220}>
          <Menu
            mode="inline"
            selectedKeys={[selectedKey]}
            onClick={({ key }) => navigate(key === 'overview' ? base : `${base}/${key}`)}
            items={[
              { key: 'overview', icon: <DashboardOutlined />, label: '概览' },
              { key: 'environments', icon: <DatabaseOutlined />, label: '环境配置' },
              { key: 'suites', icon: <ProjectOutlined />, label: '测试套件' },
              { key: 'runs', icon: <PlayCircleOutlined />, label: '执行记录' },
            ]}
          />
        </Layout.Sider>
        <Layout.Content style={{ padding: 24 }}>
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
