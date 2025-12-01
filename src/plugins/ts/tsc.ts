import { getCachedToolInfo } from '@validator/core/tool-detection';
import { runPnpmExec } from '@validator/core/tool-runner';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

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

    const args = ['--noEmit'];

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
      args.push('--project', 'tsconfig.json');
    } else if (!ctx.ci) {
      args.push('--incremental');
    }

    const res = await runPnpmExec('tsc', args, ctx.cwd);
    return {
      name: 'Types (tsc)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
