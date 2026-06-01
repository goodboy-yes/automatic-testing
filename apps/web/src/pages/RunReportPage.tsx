import { Card, Descriptions, Tabs, Typography } from 'antd';

export function RunReportPage() {
  return (
    <>
      <Typography.Title level={3}>执行报告</Typography.Title>
      <Card>
        <Descriptions items={[{ key: 'status', label: '状态', children: 'pending' }]} />
        <Tabs
          items={[
            { key: 'steps', label: '步骤结果', children: '暂无结果' },
            { key: 'logs', label: '日志', children: '暂无日志' },
          ]}
        />
      </Card>
    </>
  );
}
