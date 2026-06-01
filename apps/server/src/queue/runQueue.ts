import type { RunWorker } from '../worker/runWorker.js';

export interface RunJob {
  runId: string;
}

export interface RunQueuePort {
  enqueue(job: RunJob): void;
}

export class RunQueue implements RunQueuePort {
  private readonly jobs: RunJob[] = [];
  private active = 0;

  constructor(
    private readonly worker: RunWorker,
    private readonly maxConcurrency: number,
  ) {}

  enqueue(job: RunJob) {
    this.jobs.push(job);
    void this.drain();
  }

  private async drain() {
    while (this.active < this.maxConcurrency && this.jobs.length > 0) {
      const job = this.jobs.shift();
      if (!job) {
        return;
      }

      this.active += 1;
      this.worker.run(job).finally(() => {
        this.active -= 1;
        void this.drain();
      });
    }
  }
}
