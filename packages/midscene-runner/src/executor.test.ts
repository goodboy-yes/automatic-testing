import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runMidsceneYaml, type ProcessRunner } from './executor.js';

describe('runMidsceneYaml', () => {
  it('runs the Midscene CLI with yaml path, output dir, and summary file', async () => {
    const runProcess = vi.fn<ProcessRunner>().mockResolvedValue({
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
    });

    const outputDir = path.resolve('tmp', 'case');
    const yamlPath = path.join(outputDir, 'midscene.yaml');

    const result = await runMidsceneYaml({
      yamlPath,
      outputDir,
      runProcess,
    });

    expect(runProcess.mock.calls?.[0]?.[0]).toMatchObject({
      command: 'midscene',
      args: [yamlPath, '--summary', 'summary.json'],
      cwd: outputDir,
    });
    expect(result).toMatchObject({
      status: 'success',
      exitCode: 0,
      stdout: 'ok',
      stderr: '',
      summaryPath: 'summary.json',
    });
  });

  it('marks non-zero CLI exits as failed', async () => {
    const runProcess = vi.fn<ProcessRunner>().mockResolvedValue({
      exitCode: 1,
      stdout: '',
      stderr: 'failed',
    });

    const result = await runMidsceneYaml({
      yamlPath: '/tmp/case/midscene.yaml',
      outputDir: '/tmp/case',
      runProcess,
    });

    expect(result.status).toBe('failed');
    expect(result.stderr).toBe('failed');
  });

  it('passes AbortSignal to the process runner', async () => {
    const controller = new AbortController();
    const runProcess = vi.fn<ProcessRunner>().mockResolvedValue({
      exitCode: null,
      stdout: '',
      stderr: 'aborted',
    });

    const result = await runMidsceneYaml({
      yamlPath: '/tmp/case/midscene.yaml',
      outputDir: '/tmp/case',
      signal: controller.signal,
      runProcess,
    });

    expect(runProcess.mock.calls?.[0]?.[0]?.signal).toBe(controller.signal);
    expect(result.status).toBe('canceled');
  });
});
