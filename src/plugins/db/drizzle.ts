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

function anyMatch(files: string[], patterns: RegExp[]): boolean {
  return files.some((f) => patterns.some((re) => re.test(f)));
}

export const drizzleGeneratePlugin: Plugin = {
  name: 'DB sanity (drizzle generate)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const start = Date.now();

    const toolInfo = await getCachedToolInfo('drizzle-kit', ctx.cwd);

    if (!toolInfo.available) {
      return {
        name: 'DB sanity (drizzle generate)',
        status: 'skipped',
        durationMs: Date.now() - start,
        stdout: [
          'drizzle-kit not found.',
          'Install it with: pnpm add -D drizzle-kit',
          '',
          'This check is skipped for now.',
        ].join('\n'),
      };
    }

    const shouldRun = anyMatch(ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles, [
      /^src\/server\/db\//,
      /^drizzle\.config\.ts$/i,
      /^scripts\/db\//,
    ]);
    if (!shouldRun) {
      return { name: 'DB sanity (drizzle generate)', status: 'skipped' };
    }
    const res = await run('pnpm', ['run', 'db:generate'], ctx.cwd);
    return {
      name: 'DB sanity (drizzle generate)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
