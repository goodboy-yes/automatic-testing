import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRunArtifactUrl, subscribeRunEvents } from './runs';

interface EventSourceMessage {
  data: string;
}

class EventSourceMock {
  static instances: EventSourceMock[] = [];

  onmessage: ((event: EventSourceMessage) => void) | null = null;

  closed = false;

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this);
  }

  close() {
    this.closed = true;
  }

  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

describe('runs API helpers', () => {
  afterEach(() => {
    EventSourceMock.instances = [];
    vi.unstubAllGlobals();
  });

  it('builds encoded run artifact URLs', () => {
    expect(getRunArtifactUrl('run 1', 'cases/run case 1/midscene.yaml')).toBe(
      '/api/runs/run%201/artifacts/cases/run%20case%201/midscene.yaml',
    );
  });

  it('subscribes to run events and closes the event source', () => {
    vi.stubGlobal('EventSource', EventSourceMock);
    const receivedEvents: unknown[] = [];

    const unsubscribe = subscribeRunEvents('run 1', (event) => {
      receivedEvents.push(event);
    });

    const source = EventSourceMock.instances?.[0];
    if (!source) {
      throw new Error('EventSource was not created');
    }

    source.emit({ runId: 'run 1', type: 'log', payload: { message: '开始执行' } });
    unsubscribe();

    expect(source.url).toBe('/api/runs/run%201/events');
    expect(receivedEvents).toEqual([{ runId: 'run 1', type: 'log', payload: { message: '开始执行' } }]);
    expect(source.closed).toBe(true);
  });
});
