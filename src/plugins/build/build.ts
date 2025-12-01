import { hasPackageScript, missingScriptResult } from '@validator/core/package-scripts';
import { runPnpm } from '@validator/core/tool-runner';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

export const buildPlugin: Plugin = {
  name: 'Build (next build)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const shouldRun = ctx.ci || process.env.RUN_BUILD === '1';
    if (!shouldRun) {
      return { name: 'Build (next build)', status: 'skipped' };
    }
    if (!hasPackageScript(ctx.cwd, 'build')) {
      return missingScriptResult('Build (next build)', 'build');
    }
    const res = await runPnpm(['run', 'build'], ctx.cwd);
    return {
      name: 'Build (next build)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
