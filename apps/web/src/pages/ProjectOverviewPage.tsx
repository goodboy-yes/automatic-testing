import { Card, Col, Row, Statistic, Typography } from 'antd';

export function ProjectOverviewPage() {
  return (
    <>
      <Typography.Title level={3}>项目概览</Typography.Title>
      <Row gutter={16}>
        <Col span={6}>
          <Card>
            <Statistic title="环境" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="套件" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="用例" value={0} />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic title="最近成功率" value={0} suffix="%" />
          </Card>
        </Col>
      </Row>
    </>
  );
}
