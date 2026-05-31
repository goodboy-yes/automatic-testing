export interface Environment {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  browserType: 'chromium' | 'firefox' | 'webkit';
  viewportWidth: number;
  viewportHeight: number;
  defaultTimeoutMs: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Step {
  id: string;
  type: string;
  title: string;
  enabled: boolean;
  params: Record<string, unknown>;
  timeoutMs?: number;
}

export interface TestCase {
  id: string;
  projectId: string;
  suiteId: string;
  name: string;
  description: string;
  enabled: boolean;
  tags: string[];
  steps: Step[];
  createdAt: string;
  updatedAt: string;
}
