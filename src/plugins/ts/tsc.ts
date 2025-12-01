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

export const tscPlugin: Plugin = {
  name: 'Types (tsc)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const start = Date.now();

    const toolInfo = await getCachedToolInfo('tsc', ctx.cwd);

    if (!toolInfo.available) {
      return {
        name: 'TypeScript',
        status: 'skipped',
        durationMs: Date.now() - start,
        stdout: [
          'TypeScript (tsc) not found.',
          'Install it with: pnpm add -D typescript',
          '',
          'This check is skipped for now.',
        ].join('\n'),
      };
    }

    const args = [
      'exec',
      'tsc',
      '--noEmit',
      '--esModuleInterop',
      '--skipLibCheck',
      '--target',
      'ES2020',
      '--module',
      'ESNext',
      '--moduleResolution',
      'Bundler',
    ];

    if (ctx.targetFiles) {
      const tsFiles = ctx.targetFiles
        .filter((f) => /\.(ts|tsx)$/i.test(f))
        .filter((f) => !/templates\//.test(f));
      if (tsFiles.length === 0) {
        return {
          name: 'Types (tsc)',
          status: 'skipped',
          messages: [{ level: 'info', message: 'No TypeScript files in target paths' }],
        };
      }
      args.push(...tsFiles);
    } else if (!ctx.ci) {
      args.push('--incremental');
    }

    const res = await run('pnpm', args, ctx.cwd);
    return {
      name: 'Types (tsc)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
