import { hasPackageScript, missingScriptResult } from '@validator/core/package-scripts';
import { getCachedToolInfo } from '@validator/core/tool-detection';
import { runPnpm } from '@validator/core/tool-runner';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

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
        messages: [
          {
            level: 'warn',
            code: 'tool/missing-gitleaks',
            message: 'gitleaks binary not found.',
            suggestion: 'Install gitleaks from https://github.com/gitleaks/gitleaks.',
          },
        ],
      };
    }

    const scriptName = ctx.ci ? 'security:scan:ci' : 'security:scan:local';
    if (!hasPackageScript(ctx.cwd, scriptName)) {
      return missingScriptResult('Security (gitleaks)', scriptName);
    }

    const args = ['run', scriptName];
    const res = await runPnpm(args, ctx.cwd);
    // gitleaks returns non-zero on findings; treat as fail
    return {
      name: 'Security (gitleaks)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
