import { spawn } from 'node:child_process';
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

export const buildPlugin: Plugin = {
  name: 'Build (next build)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const shouldRun = ctx.ci || process.env.RUN_BUILD === '1';
    if (!shouldRun) {
      return { name: 'Build (next build)', status: 'skipped' };
    }
    const res = await run('pnpm', ['run', 'build'], ctx.cwd);
    return {
      name: 'Build (next build)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
