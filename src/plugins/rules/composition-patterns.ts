import fs from 'node:fs';
import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import fg from 'fast-glob';
import { Project, SyntaxKind } from 'ts-morph';

type Finding = {
  file: string;
  line?: number;
  level: Message['level'];
  code: string;
  message: string;
  suggestion?: string;
};

function findUpwards(start: string, filename: string): string | null {
  let current = start;
  while (true) {
    const candidate = path.join(current, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveWorkspaceRoot(cwd: string): string {
  const workspace = findUpwards(cwd, 'pnpm-workspace.yaml');
  if (workspace) {
    return path.dirname(workspace);
  }
  const rootPackage = findUpwards(cwd, 'package.json');
  if (rootPackage) {
    return path.dirname(rootPackage);
  }
  return cwd;
}

function shouldIgnore(filePath: string): boolean {
  return (
    filePath.includes('/node_modules/') ||
    filePath.includes('/dist/') ||
    filePath.includes('/.next/') ||
    filePath.includes('/.ai/') ||
    filePath.includes('/.claude/') ||
    filePath.includes('/.cursor/') ||
    filePath.includes('/test-results/') ||
    filePath.includes('/playwright-report/') ||
    filePath.includes('/coverage/') ||
    filePath.includes('/__tests__/') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  );
}

function collectCompositionFiles(ctx: PluginContext, root: string): string[] {
  if (ctx.scope === 'full') {
    return fg.sync(['src/modules/*/composition/**/*.ts'], {
      cwd: root,
      dot: false,
    });
  }
  const baseline = ctx.targetFiles ?? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles);
  return baseline
    .map((file) => path.relative(root, path.resolve(ctx.cwd, file)))
    .filter((f) => f.endsWith('.ts') && f.includes('/composition/'));
}

function collectServerFiles(ctx: PluginContext, root: string): string[] {
  if (ctx.scope === 'full') {
    // Only infrastructure files - composition files are handled separately
    return fg.sync(['src/modules/*/infrastructure/**/*.ts'], {
      cwd: root,
      dot: false,
    });
  }
  const baseline = ctx.targetFiles ?? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles);
  return baseline
    .map((file) => path.relative(root, path.resolve(ctx.cwd, file)))
    .filter((f) => f.endsWith('.ts') && f.includes('/infrastructure/'));
}

/**
 * Collect all index.ts files in modules for barrel policy checking
 * (includes core/, ui/, domain/, application/, etc.)
 */
function collectBarrelFiles(ctx: PluginContext, root: string): string[] {
  if (ctx.scope === 'full') {
    return fg.sync(['src/modules/**/index.ts'], {
      cwd: root,
      dot: false,
      ignore: ['**/node_modules/**', '**/__tests__/**', '**/*.test.ts', '**/*.spec.ts'],
    });
  }
  const baseline = ctx.targetFiles ?? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles);
  return baseline
    .map((file) => path.relative(root, path.resolve(ctx.cwd, file)))
    .filter((f) => f.endsWith('/index.ts') && f.includes('/modules/'));
}

function push(findings: Finding[], data: Finding) {
  findings.push(data);
}

/**
 * Check if file content has 'use server' directive as the first statement
 * (ignoring BOM, comments, and whitespace)
 */
function hasUseServerDirective(content: string): boolean {
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) {
      continue;
    }

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // First non-comment line should be 'use server'
    return (
      trimmed === "'use server';" ||
      trimmed === '"use server";' ||
      trimmed === "'use server'" ||
      trimmed === '"use server"'
    );
  }

  return false;
}

/**
 * Check if file has 'use server' directive anywhere (not necessarily first)
 */
function containsUseServerDirective(content: string): boolean {
  return /['"]use server['"];?/m.test(content);
}

/**
 * Check if file has 'import server-only' statement
 */
function hasServerOnlyImport(content: string): boolean {
  return /import\s+['"]server-only['"];?/m.test(content);
}

/**
 * Check if file has server-only exemption marker for persistence definitions
 */
function hasServerOnlyExemption(relPath: string, content: string): boolean {
  const hasMarker = /@server-only-exempt\s+persistence-definitions/.test(content);
  if (!hasMarker) {
    return false;
  }

  // Validate marker only in allowed files
  const fileName = path.basename(relPath);
  const isAllowed = ['schema.ts', 'views.ts', 'relations.ts', 'combined.cli.ts'].includes(fileName);

  return isAllowed;
}

/**
 * Check if path is a composition or infrastructure file that should be a pure server module
 */
function isPureServerModule(relPath: string, content: string): boolean {
  // Must be in composition or infrastructure
  const isInServerLayer = relPath.includes('/composition/') || relPath.includes('/infrastructure/');

  if (!isInServerLayer) {
    return false;
  }

  // Exclude test files
  if (relPath.includes('__tests__') || relPath.includes('.test.') || relPath.includes('.spec.')) {
    return false;
  }

  // If file has 'use server' directive, it's a Server Action, not a pure server module
  if (hasUseServerDirective(content)) {
    return false;
  }

  return true;
}

function checkFactoryNaming(relPath: string, content: string, findings: Finding[]) {
  if (
    !relPath.includes('/composition/') ||
    (!relPath.endsWith('/factories.ts') && !relPath.endsWith('/index.ts'))
  ) {
    return;
  }

  const exportedFunctionPattern = /export\s+(?:async\s+)?function\s+(\w+)/g;
  const matches = content.matchAll(exportedFunctionPattern);

  for (const match of matches) {
    const functionName = match[1];

    // Allow 'create*' prefix (factory pattern)
    if (functionName?.startsWith('create')) {
      continue;
    }

    // Allow '*Live' or '*Layer' suffix (Effect.ts architecture)
    if (functionName?.endsWith('Live') || functionName?.endsWith('Layer')) {
      continue;
    }

    // Allow 'register*Handlers' pattern (handler registration - see ADR-002)
    if (functionName?.match(/^register\w+Handlers$/)) {
      continue;
    }

    const before = content.slice(0, match.index);
    const line = before.split('\n').length;

    const firstChar = functionName ? functionName.charAt(0).toUpperCase() : '';
    const restChars = functionName ? functionName.slice(1) : '';

    push(findings, {
      level: 'error',
      file: relPath,
      line,
      code: 'composition/factory-naming',
      message: `Factory function '${functionName}' should start with 'create' prefix or match 'register*Handlers' pattern (ADR-002)`,
      suggestion: `Rename to 'create${firstChar}${restChars}' or 'register${firstChar}${restChars}' (if handler registration)`,
    });
  }
}

function checkDirectAdapterInstantiation(project: Project, cwd: string, findings: Finding[]) {
  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());

    if (!rel.startsWith('src/app/') || shouldIgnore(rel)) {
      continue;
    }

    const newExpressions = sf.getDescendantsOfKind(SyntaxKind.NewExpression);

    for (const newExpr of newExpressions) {
      const expr = newExpr.getExpression();
      const typeName = expr.getText();

      if (typeName.endsWith('Adapter') || typeName.endsWith('Repository')) {
        const { line } = sf.getLineAndColumnAtPos(newExpr.getStart());

        push(findings, {
          level: 'error',
          file: rel,
          line,
          code: 'composition/direct-instantiation',
          message: `Direct instantiation of '${typeName}' in route bypasses composition layer (ADR-001)`,
          suggestion: 'Use factory functions from composition/ layer instead',
        });
      }
    }
  }
}

/**
 * R1: Server Actions must have 'use server' as first statement and NO 'server-only'
 */
function checkServerActionsDirective(relPath: string, content: string, findings: Finding[]) {
  // Only check composition and infrastructure files
  if (!relPath.includes('/composition/') && !relPath.includes('/infrastructure/')) {
    return;
  }

  // Skip test files
  if (relPath.includes('__tests__') || relPath.includes('.test.') || relPath.includes('.spec.')) {
    return;
  }

  // If file doesn't have 'use server', it's not a Server Action
  if (!containsUseServerDirective(content)) {
    return;
  }

  // Check if 'use server' is the first statement
  const isFirst = hasUseServerDirective(content);

  if (!isFirst) {
    push(findings, {
      level: 'error',
      file: relPath,
      line: 1,
      code: 'composition/server-actions',
      message: '"use server" must be the first statement (after comments)',
      suggestion: 'Move "use server" directive to the top of the file',
    });
  }

  // Check if file has 'server-only' import (forbidden for Server Actions)
  if (hasServerOnlyImport(content)) {
    push(findings, {
      level: 'error',
      file: relPath,
      line: 1,
      code: 'composition/server-actions',
      message:
        'Server Action files must NOT include "import \'server-only\'" (use only "use server")',
      suggestion: 'Remove "import \'server-only\';" from this Server Action file',
    });
  }
}

/**
 * R2: Pure server modules (composition/infrastructure) must have 'server-only' and NO 'use server'
 * EXEMPTION: Persistence definition files (schema.ts, views.ts, relations.ts) may use @server-only-exempt marker
 */
function checkServerOnlyRequired(relPath: string, content: string, findings: Finding[]) {
  // Early return if file has 'use server' anywhere - R1 owns all 'use server' diagnostics
  if (containsUseServerDirective(content)) {
    return;
  }

  // Skip barrel files - barrel policy handles them
  if (relPath.endsWith('/index.ts')) {
    return;
  }

  // Only applies to pure server modules (not Server Actions)
  if (!isPureServerModule(relPath, content)) {
    return;
  }

  // Check if file has any imports or exports (i.e., it's not empty)
  const hasImports = /^import\s+/m.test(content);
  const hasExports = /^export\s+/m.test(content);

  if (!hasImports && !hasExports) {
    return; // Empty or comment-only file
  }

  // Check for exemption marker (only valid for schema.ts, views.ts, relations.ts)
  const hasExemption = hasServerOnlyExemption(relPath, content);
  const hasMarkerButNotAllowed =
    /@server-only-exempt\s+persistence-definitions/.test(content) && !hasExemption;

  // If file has exemption marker in non-allowed file, report error
  if (hasMarkerButNotAllowed) {
    const fileName = path.basename(relPath);
    push(findings, {
      level: 'error',
      file: relPath,
      line: 1,
      code: 'composition/server-only-required',
      message: `@server-only-exempt marker is only allowed in schema.ts, views.ts, or relations.ts (found in ${fileName})`,
      suggestion: 'Remove the exemption marker and add "import \'server-only\';" instead',
    });
    return; // Don't check for server-only import if marker is misused
  }

  // If file has valid exemption, skip server-only check
  if (hasExemption) {
    return;
  }

  // Exempt *.cli.ts files (CLI entrypoints for scripts, no server-only by design)
  if (relPath.endsWith('.cli.ts')) {
    return;
  }

  // Check if file has 'server-only' import
  if (!hasServerOnlyImport(content)) {
    push(findings, {
      level: 'error',
      file: relPath,
      line: 1,
      code: 'composition/server-only-required',
      message: 'Pure server modules must include "import \'server-only\'" as first import',
      suggestion: 'Add "import \'server-only\';" at the top of the file (after comments)',
    });
  }
}

/**
 * R3: 'server-only' import must be the first import (after comments)
 */
function checkServerOnlyPlacement(relPath: string, content: string, findings: Finding[]) {
  // Skip barrel files - barrel policy handles them
  if (relPath.endsWith('/index.ts')) {
    return;
  }

  // Only check files that should have server-only
  if (!isPureServerModule(relPath, content)) {
    return;
  }

  // If file doesn't have server-only, that's caught by checkServerOnlyRequired
  if (!hasServerOnlyImport(content)) {
    return;
  }

  const lines = content.split('\n');
  let serverOnlyLine = -1;
  let firstImportLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i]?.trim();

    if (!trimmed) {
      continue;
    }

    // Skip comments
    if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) {
      continue;
    }

    // Check if this is the server-only import
    if (trimmed.includes("import 'server-only'") || trimmed.includes('import "server-only"')) {
      serverOnlyLine = i + 1;
    }

    // Track first import line (any import)
    if (trimmed.startsWith('import ') && firstImportLine === -1) {
      firstImportLine = i + 1;
    }
  }

  // If server-only is not the first import, report error
  if (serverOnlyLine > 0 && firstImportLine > 0 && serverOnlyLine !== firstImportLine) {
    push(findings, {
      level: 'error',
      file: relPath,
      line: serverOnlyLine,
      code: 'composition/server-only-placement',
      message: '"import \'server-only\'" must be the first import statement',
      suggestion: 'Move "import \'server-only\';" before all other imports (after comments)',
    });
  }
}

/**
 * Barrel Policy: FORBID ALL BARRELS (Phase 2: Post barrel-removal migration)
 *
 * Strategy: Zero tolerance for barrel files
 * - ALL index.ts/index.tsx files in src/ are forbidden
 * - No exceptions (composition, infrastructure, domain, ui, etc.)
 * - Use direct imports only
 */
function checkBarrelPolicy(relPath: string, findings: Finding[]) {
  // Only check index.ts and index.tsx files in src/
  if (
    (!relPath.endsWith('/index.ts') && !relPath.endsWith('/index.tsx')) ||
    !(relPath.startsWith('src/') || relPath.includes('/src/'))
  ) {
    return;
  }

  // Skip test files
  if (relPath.includes('__tests__') || relPath.includes('.test.') || relPath.includes('.spec.')) {
    return;
  }

  // FORBID ALL BARRELS (no exceptions)
  push(findings, {
    level: 'error',
    file: relPath,
    line: 1,
    code: 'composition/no-barrels',
    message: 'Barrel files are forbidden. Use direct imports.',
    suggestion: 'Import directly from source file, not from index.ts',
  });
}

/**
 * Cross-Module Infrastructure Check: Forbid infrastructure layer imports between modules
 *
 * Hexagonal architecture rule: Module infrastructure cannot import from another module's infrastructure.
 * Cross-module dependencies must go through application/ports layer (dependency inversion).
 */
function checkCrossModuleInfrastructure(relPath: string, content: string, findings: Finding[]) {
  // Only check files in modules/
  if (!relPath.includes('/modules/')) {
    return;
  }

  // Skip test files
  if (relPath.includes('__tests__') || relPath.includes('.test.') || relPath.includes('.spec.')) {
    return;
  }

  // Exempt schema.ts files: Foreign key references require cross-module table imports (compile-time schema concern)
  if (relPath.endsWith('/schema.ts')) {
    return;
  }

  // Exempt relations.ts files: Drizzle virtual relations require cross-module table imports (ADR-009)
  if (relPath.endsWith('/relations.ts')) {
    return;
  }

  // Extract current module name
  const moduleMatch = relPath.match(/\/modules\/([^/]+)\//);
  if (!moduleMatch) {
    return;
  }
  const currentModule = moduleMatch[1];

  // Find all imports from other modules' infrastructure using matchAll
  const importPattern = /@\/modules\/([^/]+)\/infrastructure/g;
  const matches = content.matchAll(importPattern);
  const lines = content.split('\n');

  for (const match of matches) {
    const importedModule = match[1];

    // If importing from different module's infrastructure, flag it
    if (importedModule !== currentModule) {
      // Find line number
      let lineNum = 1;
      let charCount = 0;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line && charCount + line.length >= match.index) {
          lineNum = i + 1;
          break;
        }
        charCount += (line?.length ?? 0) + 1; // +1 for newline
      }

      push(findings, {
        level: 'error',
        file: relPath,
        line: lineNum,
        code: 'architecture/no-cross-module-infrastructure',
        message: `Module "${currentModule}" cannot import from module "${importedModule}" infrastructure`,
        suggestion: 'Use application/ports interface instead (e.g., IUserLookup, IAssetLookup)',
      });
    }
  }
}

/**
 * R8: CLI Entrypoint Usage
 *
 * *.cli.ts files are for scripts only (no server-only directive).
 * Runtime code must use the non-CLI version.
 *
 * ALLOWED: scripts/ directory
 * FORBIDDEN: src/ directory (runtime code)
 */
function checkCliEntrypointUsage(relPath: string, content: string, findings: Finding[]) {
  // Check if file imports any .cli.ts file (match actual import statements, not comments)
  const cliImportPattern = /^\s*import\s+.*['"].*\.cli['"]/m;
  if (!cliImportPattern.test(content)) {
    return; // No CLI import, skip
  }

  // Allow imports from scripts/ directory
  if (relPath.startsWith('scripts/')) {
    return; // Scripts are allowed to import CLI entrypoints
  }

  // Find the line number of the import
  const lines = content.split('\n');
  let lineNum = 1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line && /^\s*import\s+.*['"].*\.cli['"]/m.test(line)) {
      lineNum = i + 1;
      break;
    }
  }

  push(findings, {
    level: 'error',
    file: relPath,
    line: lineNum,
    code: 'composition/cli-entrypoint-forbidden',
    message: '*.cli.ts files are for scripts only. Runtime code must use the non-CLI version',
    suggestion: 'Remove .cli from the import path to use the runtime-safe version',
  });
}

/**
 * R9: Persistence combined.ts must have combined.cli.ts
 *
 * Ensures CLI tools (seeds/migrations) have a safe entrypoint to database schemas.
 */
function checkCliCounterpart(relPath: string, findings: Finding[], root: string) {
  if (!relPath.endsWith('/infrastructure/persistence/combined.ts')) {
    return;
  }

  const cliPath = relPath.replace('combined.ts', 'combined.cli.ts');
  const absCliPath = path.join(root, cliPath);

  if (!fs.existsSync(absCliPath)) {
    push(findings, {
      level: 'error',
      file: relPath,
      line: 1,
      code: 'composition/missing-cli-counterpart',
      message: 'combined.ts must have a corresponding combined.cli.ts for CLI usage',
      suggestion: 'Create combined.cli.ts with @server-only-exempt',
    });
  }
}

export const compositionPatternsPlugin: Plugin = {
  name: 'Composition Patterns',

  async run(ctx: PluginContext): Promise<PluginResult> {
    const root = resolveWorkspaceRoot(ctx.cwd);
    const compositionFiles = collectCompositionFiles(ctx, root);
    const serverFiles = collectServerFiles(ctx, root);
    const barrelFiles = collectBarrelFiles(ctx, root);

    if (compositionFiles.length === 0 && serverFiles.length === 0 && barrelFiles.length === 0) {
      return { name: this.name, status: 'skipped' };
    }

    const findings: Finding[] = [];

    // Check composition files (already includes composition/index.ts barrels)
    for (const relPath of compositionFiles) {
      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) {
        continue;
      }

      const content = fs.readFileSync(absPath, 'utf8');
      checkFactoryNaming(relPath, content, findings);
      checkServerActionsDirective(relPath, content, findings);
      checkServerOnlyRequired(relPath, content, findings);
      checkServerOnlyPlacement(relPath, content, findings);
      checkBarrelPolicy(relPath, findings);
      checkCrossModuleInfrastructure(relPath, content, findings);
      checkCliEntrypointUsage(relPath, content, findings);
    }

    // Check infrastructure files (already includes infrastructure/*/index.ts barrels)
    for (const relPath of serverFiles) {
      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) {
        continue;
      }

      const content = fs.readFileSync(absPath, 'utf8');
      checkServerActionsDirective(relPath, content, findings);
      checkServerOnlyRequired(relPath, content, findings);
      checkServerOnlyPlacement(relPath, content, findings);
      checkBarrelPolicy(relPath, findings);
      checkCrossModuleInfrastructure(relPath, content, findings);
      checkCliEntrypointUsage(relPath, content, findings);
      checkCliCounterpart(relPath, findings, root);
    }

    // Check ALL barrel files (for forbidden domain/UI barrels)
    // Note: This may overlap with above, but checkBarrelPolicy is idempotent
    for (const relPath of barrelFiles) {
      // Skip if already checked in composition or server files
      if (compositionFiles.includes(relPath) || serverFiles.includes(relPath)) {
        continue;
      }

      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) {
        continue;
      }

      const content = fs.readFileSync(absPath, 'utf8');
      checkBarrelPolicy(relPath, findings);
      checkCrossModuleInfrastructure(relPath, content, findings);
    }

    if (ctx.scope === 'full' || ctx.changedFiles.some((f) => f.startsWith('src/app/'))) {
      const project = new Project({
        tsConfigFilePath: path.join(root, 'tsconfig.json'),
        skipAddingFilesFromTsConfig: false,
      });

      checkDirectAdapterInstantiation(project, root, findings);
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
