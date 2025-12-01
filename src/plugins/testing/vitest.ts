import { hasPackageScript, missingScriptResult } from '@validator/core/package-scripts';
import { getCachedToolInfo } from '@validator/core/tool-detection';
import { runPnpm, runPnpmExec } from '@validator/core/tool-runner';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

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

    const runOnce = () =>
      candidates.length > 0
        ? runPnpmExec('vitest', ['related', ...candidates.slice(0, 200)], ctx.cwd)
        : runPnpm(['run', 'test'], ctx.cwd);
    if (candidates.length === 0 && !hasPackageScript(ctx.cwd, 'test')) {
      return missingScriptResult('Unit (vitest)', 'test');
    }
    const retries = Number(process.env.VALIDATOR_RETRIES ?? 0) || 0;
    const retryDelayMs = Number(process.env.VALIDATOR_RETRY_DELAY_MS ?? 0) || 0;
    let attempt = 0;
    let res = await runOnce();
    while (res.code !== 0 && attempt < retries) {
      attempt += 1;
      if (retryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
      res = await runOnce();
    }
    return {
      name: 'Unit (vitest)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
