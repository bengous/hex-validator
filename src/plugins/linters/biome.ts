import { spawn } from 'node:child_process';
import path from 'node:path';
import { hashFile, loadCache, saveCache } from '@validator/core/cache';
import { getCachedToolInfo } from '@validator/core/tool-detection';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';

function run(
  cmd: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
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

export const biomePlugin: Plugin = {
  name: 'Biome',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const start = Date.now();

    const toolInfo = await getCachedToolInfo('biome', ctx.cwd);

    if (!toolInfo.available) {
      return {
        name: 'Biome',
        status: 'skipped',
        durationMs: Date.now() - start,
        stdout: [
          '@biomejs/biome not found.',
          'Install it with: pnpm add -D @biomejs/biome',
          '',
          'This check is skipped for now.',
        ].join('\n'),
      };
    }

    const candidates = ctx.targetFiles
      ? ctx.targetFiles.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|scss)$/i.test(f))
      : (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles).filter((f) =>
          /\.(ts|tsx|js|jsx|mjs|cjs|json|jsonc|css|scss)$/i.test(f)
        );

    if (!ctx.targetFiles && ctx.scope !== 'full' && candidates.length > 0) {
      const cache = loadCache();
      const pluginKey = 'biome';
      const prev = cache.plugins[pluginKey] || {};
      const changed = candidates.filter((f) => {
        const abs = path.join(ctx.cwd, f);
        const h = hashFile(abs) || '';
        return !prev[f] || prev[f] !== h;
      });
      if (changed.length === 0) {
        return { name: 'Biome', status: 'skipped' };
      }
    }

    if (!ctx.targetFiles && ctx.scope === 'staged' && candidates.length > 0) {
      await run(
        'pnpm',
        ['exec', 'biome', 'check', '--write', '--no-errors-on-unmatched', ...candidates],
        ctx.cwd
      );
    }

    const args =
      (ctx.targetFiles || ctx.scope === 'staged') && candidates.length > 0
        ? [
            'exec',
            'biome',
            'check',
            '--reporter=json',
            '--files-ignore-unknown=true',
            '--max-diagnostics=none',
            '--no-errors-on-unmatched',
            ...candidates,
          ]
        : ['exec', 'biome', 'check', '--reporter=json', '--max-diagnostics=none', '.'];

    const res = await run('pnpm', args, ctx.cwd);
    if (!ctx.targetFiles && ctx.scope !== 'full' && candidates.length > 0) {
      const cache = loadCache();
      const pluginKey = 'biome';
      cache.plugins[pluginKey] = cache.plugins[pluginKey] || {};
      for (const f of candidates) {
        const abs = path.join(ctx.cwd, f);
        const h = hashFile(abs);
        if (h) {
          cache.plugins[pluginKey][f] = h;
        }
      }
      saveCache(cache);
    }
    const jsonLine = res.stdout
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith('{'))
      .pop();
    if (jsonLine) {
      try {
        const raw: unknown = JSON.parse(jsonLine);
        const isObj = (v: unknown): v is Record<string, unknown> =>
          !!v && typeof v === 'object' && !Array.isArray(v);
        const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
        const data = isObj(raw) ? raw : {};
        const summary = isObj(data.summary) ? data.summary : {};
        const warnings = Number((summary.warnings as number | undefined) ?? 0);
        const errors = Number((summary.errors as number | undefined) ?? 0);
        const messages = [] as NonNullable<PluginResult['messages']>;
        const rootDiagnostics = asArr((data as Record<string, unknown>).diagnostics);
        if (rootDiagnostics.length) {
          for (const dRaw of rootDiagnostics) {
            const d = isObj(dRaw) ? dRaw : {};
            const levelStr = String((d.severity as string | undefined) ?? 'info').toLowerCase();
            const level =
              levelStr === 'error' ? 'error' : levelStr.startsWith('warn') ? 'warn' : 'info';
            const loc = isObj(d.location) ? d.location : {};
            const locPath = isObj((loc as Record<string, unknown>).path)
              ? ((loc as Record<string, unknown>).path as Record<string, unknown>)
              : {};
            const fileFromLoc =
              typeof locPath.file === 'string' ? (locPath.file as string) : undefined;
            const filePath =
              typeof (d as Record<string, unknown>).filePath === 'string'
                ? ((d as Record<string, unknown>).filePath as string)
                : undefined;
            const file = fileFromLoc ?? filePath;
            const start = isObj(loc.start) ? (loc.start as Record<string, unknown>) : {};
            const cat =
              typeof (d as Record<string, unknown>).category === 'string'
                ? ((d as Record<string, unknown>).category as string)
                : undefined;
            const messageObj: Message = {
              level,
              message: (() => {
                const msg = (d as Record<string, unknown>).message;
                if (Array.isArray(msg)) {
                  return msg
                    .map((m) =>
                      isObj(m) && typeof m.content === 'string' ? (m.content as string) : ''
                    )
                    .join('');
                }
                const desc = (d as Record<string, unknown>).description;
                if (typeof desc === 'string') {
                  return desc as string;
                }
                if (typeof msg === 'string') {
                  return msg as string;
                }
                return '';
              })(),
            };
            if (file !== undefined) {
              messageObj.file = file;
            }
            const lineNum = Number((start.line as number | undefined) ?? 0);
            if (lineNum) {
              messageObj.line = lineNum;
            }
            const colNum = Number((start.column as number | undefined) ?? 0);
            if (colNum) {
              messageObj.col = colNum;
            }
            if (cat !== undefined) {
              messageObj.code = cat;
            }
            messages.push(messageObj);
          }
        } else {
          const files = asArr((data as Record<string, unknown>).files);
          for (const fRaw of files) {
            const f = isObj(fRaw) ? fRaw : {};
            const file = typeof f.path === 'string' ? (f.path as string) : undefined;
            const diagnostics = asArr(f.diagnostics);
            for (const dRaw of diagnostics) {
              const d = isObj(dRaw) ? dRaw : {};
              const levelStr = String((d.severity as string | undefined) ?? 'info').toLowerCase();
              const level =
                levelStr === 'error' ? 'error' : levelStr === 'warning' ? 'warn' : 'info';
              const cat =
                typeof (d as Record<string, unknown>).category === 'string'
                  ? ((d as Record<string, unknown>).category as string)
                  : undefined;
              const messageObj: Message = {
                level,
                message:
                  typeof (d as Record<string, unknown>).message === 'string'
                    ? ((d as Record<string, unknown>).message as string)
                    : '',
              };
              if (file !== undefined) {
                messageObj.file = file;
              }
              const lineNum = Number(
                isObj(d.location) && isObj((d.location as Record<string, unknown>).start)
                  ? (((d.location as Record<string, unknown>).start as Record<string, unknown>)
                      .line as number | undefined)
                  : 0
              );
              if (lineNum) {
                messageObj.line = lineNum;
              }
              const colNum = Number(
                isObj(d.location) && isObj((d.location as Record<string, unknown>).start)
                  ? (((d.location as Record<string, unknown>).start as Record<string, unknown>)
                      .column as number | undefined)
                  : 0
              );
              if (colNum) {
                messageObj.col = colNum;
              }
              if (cat !== undefined) {
                messageObj.code = cat;
              }
              messages.push(messageObj);
            }
          }
        }
        return {
          name: 'Biome',
          status: errors > 0 ? 'fail' : warnings > 0 ? 'warn' : 'pass',
          messages,
          stdout: res.stdout,
          stderr: res.stderr,
        };
      } catch {}
    }
    const isConfigError = res.code > 1;
    const hasErrors = res.code !== 0 || (res.stdout + res.stderr).toLowerCase().includes('error');
    const hasWarnings = (res.stdout + res.stderr).toLowerCase().includes('warn');

    const result: PluginResult = {
      name: 'Biome',
      status: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
      stdout: res.stdout,
      stderr: res.stderr,
    };

    if (isConfigError) {
      result.messages = [
        {
          level: 'error' as const,
          message: 'Biome configuration or execution error. Check stderr for details.',
        },
      ];
    }

    return result;
  },
};
