import { EventEmitter } from 'node:events';

export interface RunEvent {
  runId: string;
  type: 'status' | 'log';
  payload: unknown;
}

export const runEvents = new EventEmitter();

export function emitRunEvent(event: RunEvent) {
  runEvents.emit(event.runId, event);
}
