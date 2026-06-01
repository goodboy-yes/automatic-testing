export interface RunCancellationRegistry {
  register(runId: string): AbortController;
  cancel(runId: string): boolean;
  unregister(runId: string): void;
}

export function createRunCancellationRegistry(): RunCancellationRegistry {
  const controllers = new Map<string, AbortController>();

  return {
    register(runId: string) {
      const controller = new AbortController();
      controllers.set(runId, controller);
      return controller;
    },
    cancel(runId: string) {
      const controller = controllers.get(runId);
      if (!controller) {
        return false;
      }
      controller.abort();
      return true;
    },
    unregister(runId: string) {
      controllers.delete(runId);
    },
  };
}
