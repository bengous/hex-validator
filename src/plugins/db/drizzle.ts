import { hasPackageScript, missingScriptResult } from '@validator/core/package-scripts';
import { getCachedToolInfo } from '@validator/core/tool-detection';
import { runPnpm } from '@validator/core/tool-runner';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

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
    if (!hasPackageScript(ctx.cwd, 'db:generate')) {
      return missingScriptResult('DB sanity (drizzle generate)', 'db:generate');
    }
    const res = await runPnpm(['run', 'db:generate'], ctx.cwd);
    return {
      name: 'DB sanity (drizzle generate)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
