import fs from 'node:fs';
import path from 'node:path';
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

/**
 * @deprecated This plugin enforces legacy module structure (server/, ui/, core/, types/)
 * which conflicts with ADR-002 canonical structure (core/, application/, infrastructure/, composition/).
 *
 * DO NOT USE in new projects. This plugin is kept for backward compatibility only.
 *
 * Canonical structure enforcement is now handled by:
 * - dependency-cruiser preset: Forbidden folder rules (no-server-folder, no-db-folder, no-types-folder, etc.)
 * - architecture-fitness plugin: Required folder checks for hexagonal modules
 *
 * See: docs/architecture/decisions/ADR-002-canonical-module-structure.md
 * Migration: Issue #210 - Hexagonal Architecture Migration
 */
const REQUIRED = ['server', 'ui', 'core', 'types'] as const;

function isDir(p: string) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function readFileLines(p: string): string[] {
  try {
    return fs.readFileSync(p, 'utf8').split(/\r?\n/);
  } catch {
    return [];
  }
}

export const moduleStructurePlugin: Plugin = {
  name: 'Module Structure',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const ROOT = ctx.cwd;
    const MODULES_DIR = path.join(ROOT, 'src', 'modules');
    if (!isDir(MODULES_DIR)) {
      return { name: 'Module Structure', status: 'skipped' };
    }
    if (ctx.scope !== 'full') {
      const files = ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles;
      const touchedModules = files.filter((f) => f.startsWith('src/modules/'));
      if (touchedModules.length === 0) {
        return { name: 'Module Structure', status: 'skipped' };
      }
    }

    const messages: PluginResult['messages'] = [];
    const modules = fs.readdirSync(MODULES_DIR).filter((m) => isDir(path.join(MODULES_DIR, m)));
    for (const mod of modules) {
      const modPath = path.join(MODULES_DIR, mod);
      for (const folder of REQUIRED) {
        const dirPath = path.join(modPath, folder);
        if (!isDir(dirPath)) {
          messages.push({
            level: 'error',
            message: `Missing folder ${folder}/ in ${mod}`,
            code: 'module/missing-folder',
          });
          continue;
        }
        const gitkeep = path.join(dirPath, '.gitkeep');
        if (!fs.existsSync(gitkeep)) {
          messages.push({
            level: 'warn',
            message: `Missing .gitkeep in ${mod}/${folder}/`,
            code: 'module/missing-gitkeep',
          });
        }
      }
      const walk = (dir: string) => {
        for (const entry of fs.readdirSync(dir)) {
          const p = path.join(dir, entry);
          const stat = fs.statSync(p);
          if (stat.isDirectory()) {
            walk(p);
          } else if (/\.(ts|tsx)$/.test(entry)) {
            const rel = p.replace(ROOT + path.sep, '');
            const lines = readFileLines(p);
            // Forbid React in server code
            if (/\/server\//.test(rel) && lines.some((l) => /from\s+['"]react['"]/.test(l))) {
              messages.push({
                level: 'error',
                message: `React import in server code: ${rel}`,
                code: 'module/react-in-server',
              });
            }
            // Forbid server/DB imports in UI code
            if (
              /\/ui\//.test(rel) &&
              lines.some((l) => /from\s+'drizzle-orm'|from\s+"drizzle-orm"|from\s+'node:/.test(l))
            ) {
              messages.push({
                level: 'error',
                message: `Server/DB import in UI code: ${rel}`,
                code: 'module/server-in-ui',
              });
            }
            // Enforce index size: error for server/index.ts, warn otherwise
            if (/\/server\/index\.ts$/.test(rel) && lines.length > 200) {
              messages.push({
                level: 'error',
                message: `server/index.ts >200 lines (${lines.length}): ${rel}`,
                code: 'module/large-server-index',
              });
            } else if (
              /\/core\/index\.ts$|\/types\/index\.ts$|\/ui\/index\.tsx?$/.test(rel) &&
              lines.length > 200
            ) {
              messages.push({
                level: 'warn',
                message: `Index file >200 lines (${lines.length}): ${rel}`,
                code: 'module/large-index',
              });
            }

            // Allow module-level 'use server' only in server/actions.ts
            if (/\/src\/modules\/[^/]+\/server\//.test(rel)) {
              const firstNonEmpty = lines.findIndex((l) => l.trim().length > 0);
              const firstLine = lines[firstNonEmpty] || '';
              const hasModuleDirective = /^['"]use server['"];?$/.test(firstLine);
              const isActionsFile = /\/server\/actions\.ts$/.test(rel);
              if (hasModuleDirective && !isActionsFile) {
                messages.push({
                  level: 'error',
                  message: `Module-level 'use server' directive found outside server/actions.ts: ${rel}`,
                  code: 'server/module-level-use-server',
                  suggestion:
                    "Use function-scoped 'use server' in other server files. Keep top-level only in server/actions.ts if importing from Client Components.",
                });
              }
            }

            // Enforce 'use server' occurrences only within server/actions.ts
            if (
              /\/src\/modules\/[^/]+\/server\//.test(rel) &&
              !/\/server\/actions\.ts$/.test(rel)
            ) {
              if (lines.some((l) => /['"]use server['"];?/.test(l))) {
                messages.push({
                  level: 'error',
                  message: `'use server' directive found outside server/actions.ts: ${rel}`,
                  code: 'server/action-directive-out-of-place',
                  suggestion:
                    "Move Server Action logic into server/actions.ts. Use top-level 'use server' there if importing from Client Components.",
                });
              }
            }

            // Enforce cache tag helpers live in core, not server
            if (/\/src\/modules\/[^/]+\/server\//.test(rel)) {
              const hasCacheTagsHelper = lines.some((l) =>
                /export\s+function\s+get\w*CacheTags\s*\(/.test(l)
              );
              if (hasCacheTagsHelper) {
                messages.push({
                  level: 'error',
                  message: `Cache tag builder exported from server file: ${rel}`,
                  code: 'server/cache-tags-in-server',
                  suggestion: 'Move tag builders to core/cache.ts',
                });
              }
            }
          }
        }
      };
      walk(modPath);
    }
    const status = messages.some((m) => m.level === 'error') ? 'fail' : 'pass';
    return { name: 'Module Structure', status, messages };
  },
};
