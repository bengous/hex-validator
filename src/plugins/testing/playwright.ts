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

async function shouldRunE2E(ctx: PluginContext, mode: 'auto' | 'always' | 'off') {
  if (mode === 'off') {
    return false;
  }
  if (mode === 'always') {
    return true;
  }
  const files = ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles;
  const e2ePatterns = [
    /^src\/app\//,
    /^src\/modules\/[^/]+\/(ui|server)\//,
    /^src\/styles\//,
    /^next\.config\.ts$/,
    /^playwright\.config\.ts$/,
    /^tests\/e2e\//,
  ];
  return anyMatch(files, e2ePatterns);
}

export const playwrightPlugin: Plugin = {
  name: 'E2E (playwright)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const start = Date.now();
    const e2eMode = ctx.config?.e2e ?? 'auto';
    const runE2E = await shouldRunE2E(ctx, e2eMode);
    if (!runE2E) {
      return { name: 'E2E (playwright)', status: 'skipped' };
    }

    const toolInfo = await getCachedToolInfo('playwright', ctx.cwd);

    if (!toolInfo.available) {
      return {
        name: 'E2E (playwright)',
        status: 'skipped',
        durationMs: Date.now() - start,
        stdout: [
          'Playwright not found.',
          'Install it with: pnpm add -D playwright',
          '',
          'This check is skipped for now.',
        ].join('\n'),
      };
    }
    const args = ctx.ci ? ['run', 'test:e2e:ci'] : ['run', 'test:e2e'];
    const retries = Number(process.env.VALIDATOR_RETRIES ?? 0) || 0;
    const retryDelayMs = Number(process.env.VALIDATOR_RETRY_DELAY_MS ?? 0) || 0;
    let attempt = 0;
    let res = await run('pnpm', args, ctx.cwd);
    while (res.code !== 0 && attempt < retries) {
      attempt += 1;
      if (retryDelayMs > 0) {
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
      res = await run('pnpm', args, ctx.cwd);
    }
    return {
      name: 'E2E (playwright)',
      status: res.code === 0 ? 'pass' : 'fail',
      stdout: res.stdout,
      stderr: res.stderr,
    };
  },
};
