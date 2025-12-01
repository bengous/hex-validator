import fs from 'node:fs/promises';
import path from 'node:path';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';
import fg from 'fast-glob';

function isClientFileByName(src: string) {
  return /-client\.(tsx|ts)$/.test(src);
}
function isClientFileByDirective(code: string) {
  const head = code.slice(0, 256);
  return /['"]use client['"];?/.test(head);
}
function isForbiddenImport(importPath: string) {
  if (/^@\/modules\/[^/]+\/server\/actions(\/.*)?$/.test(importPath)) {
    return false;
  }
  return (
    /^@\/modules\/[^/]+\/server$/.test(importPath) ||
    /^@\/modules\/[^/]+\/server\/(index|queries)(\/.*)?$/.test(importPath) ||
    /^@\/server\//.test(importPath) ||
    /^next\/(headers|cache)$/.test(importPath)
  );
}
function extractImports(code: string) {
  const imports: Array<{ isType: boolean; source: string }> = [];
  const importRE = /import\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"];?/g;
  for (const m of code.matchAll(importRE)) {
    const source = m[2];
    if (source !== undefined) {
      imports.push({ isType: Boolean(m[1]), source });
    }
  }
  return imports;
}

export const rscBoundariesPlugin: Plugin = {
  name: 'RSC Boundaries',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const ROOT = ctx.cwd;
    const files =
      ctx.scope === 'full'
        ? await fg(['src/**/*.ts', 'src/**/*.tsx'], { dot: false, cwd: ROOT })
        : (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles).filter(
            (f) => f.startsWith('src/') && /\.(ts|tsx)$/i.test(f)
          );
    if (files.length === 0) {
      return { name: 'RSC Boundaries', status: 'skipped' };
    }
    const violations: Array<{ file: string; importPath: string }> = [];
    for (const file of files) {
      const abs = path.join(ROOT, file);

      // TODO: Add existence check before reading file
      // ISSUE: When --scope=changed is used, git diff includes deleted files as "changed"
      // SYMPTOM: ENOENT error when trying to read deleted files (e.g., architecture.fitness.test.ts after deletion)
      // FIX: Add `if (!existsSync(abs)) continue;` before readFile to skip deleted files
      // REASON: Full scope uses glob (only existing files), but changed scope uses git diff (includes deletions)
      // IMPACT: Minor - only affects transition period after file deletion, not CI/hooks
      const code = await fs.readFile(abs, 'utf8');
      const isClient = isClientFileByName(file) || isClientFileByDirective(code);
      if (!isClient) {
        continue;
      }
      for (const spec of extractImports(code)) {
        if (spec.isType) {
          continue;
        }
        if (isForbiddenImport(spec.source)) {
          violations.push({ file, importPath: spec.source });
        }
      }
    }
    if (violations.length) {
      return {
        name: 'RSC Boundaries',
        status: 'fail',
        messages: violations.map((v) => ({
          level: 'error',
          file: v.file,
          message: `imports ${v.importPath}`,
          code: 'rsc/forbidden-import',
          suggestion: 'Import server actions from "@/modules/<feature>/server/actions"',
        })),
      };
    }
    return { name: 'RSC Boundaries', status: 'pass' };
  },
};
