import { spawn } from 'node:child_process';
import path from 'node:path';

export type MidsceneExecutionStatus = 'success' | 'failed' | 'canceled';

export interface RunProcessInput {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  shell?: boolean;
  signal?: AbortSignal;
  killProcessTree?: (pid: number) => Promise<void>;
}

export interface RunProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export type ProcessRunner = (input: RunProcessInput) => Promise<RunProcessResult>;

export interface RunMidsceneYamlInput {
  yamlPath: string;
  outputDir: string;
  command?: string;
  summaryFilename?: string;
  env?: NodeJS.ProcessEnv;
  signal?: AbortSignal;
  runProcess?: ProcessRunner;
}

export interface RunMidsceneYamlResult extends RunProcessResult {
  status: MidsceneExecutionStatus;
  summaryPath: string;
}

export async function runMidsceneYaml(input: RunMidsceneYamlInput): Promise<RunMidsceneYamlResult> {
  const summaryPath = input.summaryFilename ?? 'summary.json';
  const cwd = path.resolve(input.outputDir);
  const runProcess = input.runProcess ?? spawnProcess;
  const processResult = await runProcess({
    command: input.command ?? 'midscene',
    args: [path.resolve(input.yamlPath), '--summary', summaryPath],
    cwd,
    env: input.env,
    signal: input.signal,
  });

  return {
    ...processResult,
    summaryPath,
    status: getExecutionStatus(processResult),
  };
}

export function spawnProcess(input: RunProcessInput): Promise<RunProcessResult> {
  return new Promise((resolve) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...input.env },
      shell: input.shell ?? (process.platform === 'win32'),
      detached: process.platform !== 'win32',
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let aborted = false;

    const abortListener = () => {
      aborted = true;
      if (child.pid) {
        void (input.killProcessTree ?? defaultKillProcessTree)(child.pid);
      }
    };

    if (input.signal?.aborted) {
      abortListener();
    } else {
      input.signal?.addEventListener('abort', abortListener, { once: true });
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      stderr += error.message;
    });
    child.on('close', (exitCode) => {
      input.signal?.removeEventListener('abort', abortListener);
      resolve({ exitCode: aborted ? null : exitCode, stdout, stderr });
    });
  });
}

async function defaultKillProcessTree(pid: number) {
  if (process.platform === 'win32') {
    await spawnProcess({ command: 'taskkill', args: ['/pid', String(pid), '/T', '/F'], cwd: process.cwd(), shell: true });
    return;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    process.kill(pid, 'SIGTERM');
  }
}

function getExecutionStatus(result: RunProcessResult): MidsceneExecutionStatus {
  if (result.exitCode === null) {
    return 'canceled';
  }
  return result.exitCode === 0 ? 'success' : 'failed';
}
