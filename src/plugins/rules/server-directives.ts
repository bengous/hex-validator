import fs from 'node:fs';
import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import { resolveWorkspaceRoot } from '../../utils/fs-utils';
import { collectFiles, createFinding } from '../../utils/plugin-utils';

/**
 * Check for redundant function-level 'use server' directives when file has file-level directive
 * Supports both /server/ and /infrastructure/adapters/ paths (hexagonal architecture)
 */
function checkRedundantUseServer(relPath: string, content: string, findings: Message[]) {
  if (
    !relPath.endsWith('/server/actions.ts') &&
    !relPath.endsWith('/infrastructure/adapters/actions.ts')
  ) {
    return;
  }

  // Check if file starts with 'use server'
  const fileLevelMatch = content.match(/^'use server';/m);
  if (!fileLevelMatch) {
    return;
  }

  // Find all function-level 'use server' directives (indented)
  const funcDirectivePattern = /^\s+'use server';/gm;
  const funcMatches = [...content.matchAll(funcDirectivePattern)];

  for (const match of funcMatches) {
    const before = content.slice(0, match.index ?? 0);
    const line = before.split('\n').length;

    findings.push(
      createFinding(
        relPath,
        line,
        'error',
        'server/redundant-use-server',
        'Redundant function-level "use server" when file has file-level directive',
        'Remove function-level directive - file-level "use server" at line 1 already marks all exports as Server Actions'
      )
    );
  }
}

/**
 * Check that actions.ts files have file-level 'use server' directive
 * Allows comments/whitespace before the directive
 * Supports both /server/ and /infrastructure/adapters/ paths (hexagonal architecture)
 */
function checkMissingUseServer(relPath: string, content: string, findings: Message[]) {
  if (
    !relPath.endsWith('/server/actions.ts') &&
    !relPath.endsWith('/infrastructure/adapters/actions.ts')
  ) {
    return;
  }

  // Check for 'use server' at file level (not indented, allows preceding comments)
  const hasFileLevel = /^["']use server["'];/m.test(content);

  if (!hasFileLevel) {
    findings.push(
      createFinding(
        relPath,
        1,
        'error',
        'server/missing-use-server',
        'actions.ts must have file-level "use server" directive',
        'Add "use server" at top of file (after imports/comments) to mark all exports as Server Actions'
      )
    );
  }
}

/**
 * Check that queries.ts and services.ts files have 'import server-only'
 * Allows whitespace/comments before the import
 * Supports both /server/ and /infrastructure/adapters/ paths (hexagonal architecture)
 */
function checkMissingServerOnly(relPath: string, content: string, findings: Message[]) {
  const match = relPath.match(/\/(server|infrastructure\/adapters)\/(queries|services)\.ts$/);
  if (!match) {
    return;
  }

  const fileType = match[2];

  // Check for import 'server-only' anywhere in imports section
  const hasServerOnly = /^import\s+['"]server-only['"];?/m.test(content);

  if (!hasServerOnly) {
    findings.push(
      createFinding(
        relPath,
        1,
        'error',
        'server/missing-server-only',
        `${fileType}.ts must have "import 'server-only'" directive`,
        `Add import 'server-only' at top of file to prevent client-side imports`
      )
    );
  }
}

/**
 * Check that queries.ts doesn't incorrectly use 'use server'
 */
function checkWrongDirectiveInQueries(relPath: string, content: string, findings: Message[]) {
  if (!relPath.match(/\/server\/(queries|services)\.ts$/)) {
    return;
  }

  // Check for 'use server' directive in queries/services files
  const hasUseServer = /^'use server';/m.test(content);

  if (hasUseServer) {
    findings.push(
      createFinding(
        relPath,
        1,
        'error',
        'server/wrong-directive-type',
        'queries.ts/services.ts should use "import \'server-only\'" not "use server"',
        'Replace "use server" with "import \'server-only\'" - these are utilities, not Server Actions'
      )
    );
  }
}

/**
 * Main plugin
 */
export const serverDirectivesPlugin: Plugin = {
  name: 'Server Directives',

  async run(ctx: PluginContext): Promise<PluginResult> {
    const root = resolveWorkspaceRoot(ctx.cwd);
    const files = collectFiles(
      ctx,
      root,
      ['src/modules/**/server/*.ts', 'src/modules/**/infrastructure/adapters/*.ts'],
      (f) =>
        f.endsWith('.ts') && (f.includes('/server/') || f.includes('/infrastructure/adapters/'))
    );

    if (files.length === 0) {
      return { name: this.name, status: 'skipped' };
    }

    const findings: Message[] = [];

    for (const relPath of files) {
      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) {
        continue;
      }

      const content = fs.readFileSync(absPath, 'utf8');

      // Run all checks
      checkRedundantUseServer(relPath, content, findings);
      checkMissingUseServer(relPath, content, findings);
      checkMissingServerOnly(relPath, content, findings);
      checkWrongDirectiveInQueries(relPath, content, findings);
    }

    const hasErrors = findings.some((f) => f.level === 'error');
    const hasWarnings = findings.some((f) => f.level === 'warn');

    return {
      name: this.name,
      status: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
      messages: findings,
    };
  },
};
