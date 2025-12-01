import path from 'node:path';
import type { Message, PluginContext } from '@validator/types';
import fg from 'fast-glob';

/**
 * Collect files based on the current execution scope (full, staged, changed).
 *
 * @param ctx The plugin context
 * @param root The workspace root
 * @param patterns Glob patterns for 'full' scope scan
 * @param filterFn Predicate function to filter files in 'staged'/'changed' scope
 */
export function collectFiles(
  ctx: PluginContext,
  root: string,
  patterns: string[],
  filterFn: (relPath: string) => boolean
): string[] {
  // 1. Explicit target files (e.g. --paths)
  if (ctx.targetFiles) {
    return ctx.targetFiles
      .map((file) => path.relative(root, path.resolve(ctx.cwd, file)))
      .filter(filterFn);
  }

  // 2. Full scan using globs
  if (ctx.scope === 'full') {
    return fg.sync(patterns, {
      cwd: root,
      dot: false,
    });
  }

  // 3. Staged/Changed files (git based)
  const baseline = ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles;
  return baseline.map((file) => path.relative(root, path.resolve(ctx.cwd, file))).filter(filterFn);
}

/**
 * Helper to create a standardized finding object.
 * Useful for type safety and consistency.
 */
export function createFinding(
  file: string,
  line: number | undefined,
  level: Message['level'],
  code: string,
  message: string,
  suggestion?: string
): Message {
  const msg: Message = {
    file,
    level,
    code,
    message,
  };
  if (line !== undefined) {
    msg.line = line;
  }
  if (suggestion) {
    msg.suggestion = suggestion;
  }
  return msg;
}
