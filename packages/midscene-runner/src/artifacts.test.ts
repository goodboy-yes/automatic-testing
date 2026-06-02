import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectMidsceneArtifacts, parseMidsceneStepResults } from './artifacts.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('collectMidsceneArtifacts', () => {
  it('finds summary, result json, visual report, screenshots, and logs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midscene-artifacts-'));
    tempDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'screenshots'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'summary.json'), JSON.stringify({ pass: 1, fail: 0 }), 'utf8');
    fs.writeFileSync(path.join(dir, 'result-login.json'), JSON.stringify({ tasks: [] }), 'utf8');
    fs.writeFileSync(path.join(dir, 'visual-report.html'), '<html></html>', 'utf8');
    fs.writeFileSync(path.join(dir, 'screenshots', 'step-1.png'), 'png', 'utf8');
    fs.writeFileSync(path.join(dir, 'run.log'), 'log', 'utf8');

    const artifacts = collectMidsceneArtifacts(dir);

    expect(artifacts.map((artifact) => artifact.type)).toEqual([
      'summary_json',
      'result_json',
      'visual_report',
      'screenshot',
      'log',
    ]);
    expect(artifacts.map((artifact) => artifact.path)).toContain('visual-report.html');
  });

  it('recognizes nested Midscene summary files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'midscene-artifacts-'));
    tempDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'midscene_run', 'output'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'midscene_run', 'output', 'summary.json'), JSON.stringify({ failed: 1 }), 'utf8');

    const artifacts = collectMidsceneArtifacts(dir);

    expect(artifacts).toEqual([
      { type: 'summary_json', path: 'midscene_run/output/summary.json' },
    ]);
  });
});

describe('parseMidsceneStepResults', () => {
  it('normalizes step status, error, raw result, and screenshot from result json', () => {
    const steps = parseMidsceneStepResults({
      tasks: [
        {
          title: '点击登录',
          type: 'aiTap',
          status: 'passed',
          screenshot: 'screenshots/step-1.png',
          output: { locate: '登录按钮' },
        },
        {
          title: '检查首页',
          type: 'aiAssert',
          status: 'failed',
          error: '找不到首页',
        },
      ],
    });

    expect(steps).toEqual([
      {
        index: 0,
        title: '点击登录',
        type: 'aiTap',
        status: 'success',
        errorMessage: null,
        screenshotPath: 'screenshots/step-1.png',
        rawResultJson: JSON.stringify({
          title: '点击登录',
          type: 'aiTap',
          status: 'passed',
          screenshot: 'screenshots/step-1.png',
          output: { locate: '登录按钮' },
        }),
      },
      {
        index: 1,
        title: '检查首页',
        type: 'aiAssert',
        status: 'failed',
        errorMessage: '找不到首页',
        screenshotPath: null,
        rawResultJson: JSON.stringify({
          title: '检查首页',
          type: 'aiAssert',
          status: 'failed',
          error: '找不到首页',
        }),
      },
    ]);
  });
});
