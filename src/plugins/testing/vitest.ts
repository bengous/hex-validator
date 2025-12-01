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

export const vitestPlugin: Plugin = {
  name: 'Unit (vitest)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const start = Date.now();

    const toolInfo = await getCachedToolInfo('vitest', ctx.cwd);

    if (!toolInfo.available) {
      return {
        name: 'Unit (vitest)',
        status: 'skipped',
        durationMs: Date.now() - start,
        stdout: [
          'Vitest not found.',
          'Install it with: pnpm add -D vitest',
          '',
          'This check is skipped for now.',
        ].join('\n'),
      };
    }

    const candidates = ctx.targetFiles
      ? ctx.targetFiles.filter((f) => /\.(ts|tsx|js|jsx)$/.test(f))
      : ctx.scope !== 'full'
        ? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles).filter((f) =>
            /\.(ts|tsx|js|jsx)$/.test(f)
          )
        : [];

    if (ctx.targetFiles && candidates.length === 0) {
      return {
        name: 'Unit (vitest)',
        status: 'skipped',
        messages: [{ level: 'info', message: 'No testable files in target paths' }],
      };
    }

    const args =
      candidates.length > 0
        ? ['exec', 'vitest', 'related', ...candidates.slice(0, 200)]
        : ['run', 'test'];
    const usePnpm = args[0] === 'run';
    const baseArgs = usePnpm ? ['run', 'test'] : args;
    const retries = Number(process.env.VALIDATOR_RETRIES ?? 0) || 0;
    const retryDelayMs = Number(process.env.VALIDATOR_RETRY_DELAY_MS ?? 0) || 0;
    let attempt = 0;
    let res = await run('pnpm', baseArgs, ctx.cwd);
    while (res.code !== 0 && attempt < retries) {
      attempt += 1;
      if (retryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
      res = await run('pnpm', baseArgs, ctx.cwd);
    }
    return {
      name: 'Unit (vitest)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
