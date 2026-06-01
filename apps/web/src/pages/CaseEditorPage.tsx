import Editor from '@monaco-editor/react';
import { Card, Col, Row, Tabs, Typography } from 'antd';
import { useCaseEditorStore } from '../stores/caseEditorStore';

export function CaseEditorPage() {
  const yamlText = useCaseEditorStore((state) => state.yamlText);
  const setYamlText = useCaseEditorStore((state) => state.setYamlText);

  return (
    <>
      <Typography.Title level={3}>用例编辑器</Typography.Title>
      <Row gutter={16}>
        <Col span={6}>
          <Card title="步骤列表">暂无步骤</Card>
        </Col>
        <Col span={12}>
          <Card>
            <Tabs
              items={[
                { key: 'flow', label: '步骤流', children: '步骤表单' },
                {
                  key: 'yaml',
                  label: 'YAML 源码',
                  children: (
                    <Editor
                      height="520px"
                      defaultLanguage="yaml"
                      value={yamlText}
                      onChange={(value) => setYamlText(value ?? '')}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card title="运行预览">暂无预览</Card>
        </Col>
      </Row>
    </>
  );
}
