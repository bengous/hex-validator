import { spawn } from 'node:child_process';
import { getCachedToolInfo } from '@validator/core/tool-detection';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

function run(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: out, stderr: err });
    });
  });
}

export const gitleaksPlugin: Plugin = {
  name: 'Security (gitleaks)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const start = Date.now();

    const toolInfo = await getCachedToolInfo('gitleaks', ctx.cwd);

    if (!toolInfo.available) {
      return {
        name: 'Security (gitleaks)',
        status: 'skipped',
        durationMs: Date.now() - start,
        stdout: [
          'gitleaks not found.',
          'Install it with: pnpm add -D gitleaks',
          '',
          'This check is skipped for now.',
        ].join('\n'),
      };
    }

    const args = ctx.ci ? ['run', 'security:scan:ci'] : ['run', 'security:scan:local'];
    const res = await run('pnpm', args, ctx.cwd);
    // gitleaks returns non-zero on findings; treat as fail
    return {
      name: 'Security (gitleaks)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
