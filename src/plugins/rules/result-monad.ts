import fs from 'node:fs';
import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import fg from 'fast-glob';
import { Project, type SourceFile, SyntaxKind, type Type } from 'ts-morph';
import { isErrorAccessSafe, isValueAccessSafe } from '../../utils/type-checker';

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
    filePath.includes('/packages/hex-validator/') ||
    filePath.includes('/coverage/') ||
    filePath.includes('/__tests__/') ||
    filePath.includes('.test.') ||
    filePath.includes('.spec.')
  );
}

function collectFiles(ctx: PluginContext, root: string): string[] {
  if (ctx.scope === 'full') {
    return fg.sync(['src/modules/**/*.ts', 'src/modules/**/*.tsx'], {
      cwd: root,
      dot: false,
      ignore: [
        '**/node_modules/**',
        '**/.next/**',
        '**/dist/**',
        '**/__tests__/**',
        '**/*.test.ts',
        '**/*.test.tsx',
        '**/*.spec.ts',
        '**/*.spec.tsx',
      ],
    });
  }
  const baseline = ctx.targetFiles ?? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles);
  return baseline
    .map((file) => path.relative(root, path.resolve(ctx.cwd, file)))
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && f.startsWith('src/modules/'));
}

function push(findings: Finding[], data: Finding) {
  findings.push(data);
}

/**
 * Check if a type is a Result<T, E> type
 *
 * Detects Result types by checking:
 * 1. Type text contains "Result<"
 * 2. Type symbol name is "Result"
 * 3. Has 'ok' and 'value'/'error' properties
 */
function isResultType(type: Type): boolean {
  try {
    const typeText = type.getText();
    if (typeText.includes('Result<')) {
      return true;
    }

    const symbol = type.getSymbol();
    if (symbol?.getName() === 'Result') {
      return true;
    }

    const properties = type.getProperties();
    const propertyNames = properties.map((p) => p.getName());
    const hasOk = propertyNames.includes('ok');
    const hasValueOrError = propertyNames.includes('value') || propertyNames.includes('error');

    if (hasOk && hasValueOrError) {
      return true;
    }

    return false;
  } catch (_error) {
    return false;
  }
}

/**
 * Get suggestion message for property access violation
 */
function getSuggestion(propertyName: string): string {
  switch (propertyName) {
    case 'ok':
      return 'Use: Result.isOk(result) or Result.isErr(result) instead of accessing .ok directly';
    case 'value':
      return 'Use: if (Result.isOk(result)) { const value = result.value; }';
    case 'error':
      return 'Use: if (Result.isErr(result)) { const error = result.error; }';
    default:
      return 'Use Result helper methods instead of direct property access';
  }
}

/**
 * Unified type-aware checker for Result property access
 *
 * Uses TypeScript's type checker to validate .ok, .value, .error accesses
 * on Result<T, E> types, eliminating false positives from non-Result types.
 */
function checkResultPropertyAccess(sourceFile: SourceFile, relPath: string, findings: Finding[]) {
  if (relPath.endsWith('src/lib/core/Result.ts')) {
    return;
  }

  const propertyAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);

  for (const propAccess of propertyAccesses) {
    const propertyName = propAccess.getName();

    if (!['ok', 'value', 'error'].includes(propertyName)) {
      continue;
    }

    try {
      const expression = propAccess.getExpression();
      const objectType = expression.getType();

      if (!isResultType(objectType)) {
        continue;
      }

      let isSafe = false;

      if (propertyName === 'ok') {
        isSafe = false;
      } else if (propertyName === 'value') {
        isSafe = isValueAccessSafe(propAccess);
      } else if (propertyName === 'error') {
        isSafe = isErrorAccessSafe(propAccess);
      }

      if (!isSafe) {
        const { line } = sourceFile.getLineAndColumnAtPos(propAccess.getStart());

        push(findings, {
          level: 'error',
          file: relPath,
          line,
          code: `result/no-${propertyName}-access`,
          message: `Direct .${propertyName} access on Result<T, E> - use Result helpers (CLAUDE.md)`,
          suggestion: getSuggestion(propertyName),
        });
      }
    } catch (_error) {}
  }
}

function checkOkPropertyUsage(relPath: string, content: string, findings: Finding[]) {
  if (relPath.endsWith('src/lib/core/Result.ts')) {
    return;
  }

  // Catch ALL .ok property access but NOT function calls like Result.ok()
  // Negative lookahead (?!\() ensures .ok is not followed by opening parenthesis
  const okPropertyPattern = /\.ok(?!\()\b/g;
  const matches = content.matchAll(okPropertyPattern);

  for (const match of matches) {
    const before = content.slice(0, match.index);
    const line = before.split('\n').length;

    push(findings, {
      level: 'error',
      file: relPath,
      line,
      code: 'result/no-ok-property',
      message: 'Use Result.isOk() type guard instead of .ok property (CLAUDE.md)',
      suggestion: 'Replace with: Result.isOk(result) or Result.unwrapOr(result, default)',
    });
  }
}

function checkErrorPropertyUsage(relPath: string, content: string, findings: Finding[]) {
  if (relPath.endsWith('src/lib/core/Result.ts')) {
    return;
  }

  const errorDirectPattern = /(?:const|let|var)\s+\w+\s*=\s*\w+\.error(?!\w)/g;
  const matches = content.matchAll(errorDirectPattern);

  for (const match of matches) {
    const before = content.slice(0, match.index);
    const line = before.split('\n').length;

    push(findings, {
      level: 'error',
      file: relPath,
      line,
      code: 'result/no-direct-error-access',
      message: 'Access .error only after Result.isErr() type guard (CLAUDE.md)',
      suggestion: 'Use: if (Result.isErr(result)) { const error = result.error; }',
    });
  }
}

function checkThrowInForbiddenLayers(project: Project, cwd: string, findings: Finding[]) {
  const forbiddenPaths = [
    { pattern: /^src\/modules\/[^/]+\/core\/domain\//, layer: 'core/domain' },
    { pattern: /^src\/modules\/[^/]+\/core\/errors\//, layer: 'core/errors' },
    { pattern: /^src\/modules\/[^/]+\/application\/use-cases\//, layer: 'application/use-cases' },
    { pattern: /^src\/modules\/[^/]+\/application\/policies\//, layer: 'application/policies' },
  ];

  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());

    if (shouldIgnore(rel)) {
      continue;
    }

    const matchedPath = forbiddenPaths.find((p) => p.pattern.test(rel));
    if (!matchedPath) {
      continue;
    }

    const throwStatements = sf.getDescendantsOfKind(SyntaxKind.ThrowStatement);

    for (const throwStmt of throwStatements) {
      const { line } = sf.getLineAndColumnAtPos(throwStmt.getStart());

      push(findings, {
        level: 'error',
        file: rel,
        line,
        code: 'result/no-throw-in-domain',
        message: `${matchedPath.layer} must not throw exceptions - return Result.fail() instead (CLAUDE.md)`,
        suggestion: 'Replace throw with: return Result.fail("error message")',
      });
    }
  }
}

/**
 * Check for unsafe .value access using regex (fallback for tests)
 *
 * This is a simpler regex-based approach used when AST is not available.
 * It may produce false positives for early return patterns.
 */
function checkValueAccessWithoutGuardRegex(relPath: string, content: string, findings: Finding[]) {
  if (relPath.endsWith('src/lib/core/Result.ts')) {
    return;
  }

  const valueAccessPattern = /(?:const|let|var)\s+\w+\s*=\s*\w+\.value(?!\w)/g;
  const matches = content.matchAll(valueAccessPattern);

  for (const match of matches) {
    const before = content.slice(0, match.index);
    const line = before.split('\n').length;

    const hasGuardAbove = before.slice(Math.max(0, before.length - 200)).includes('Result.isOk(');

    if (!hasGuardAbove) {
      push(findings, {
        level: 'warn',
        file: relPath,
        line,
        code: 'result/unsafe-value-access',
        message: 'Accessing .value without Result.isOk() guard may be unsafe',
        suggestion: 'Ensure Result.isOk() check precedes .value access',
      });
    }
  }
}

function checkAdapterTryCatch(project: Project, cwd: string, findings: Finding[]) {
  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());

    if (shouldIgnore(rel)) {
      continue;
    }

    if (!rel.includes('/infrastructure/adapters/')) {
      continue;
    }

    const classes = sf.getClasses();
    for (const cls of classes) {
      const methods = cls.getMethods();

      for (const method of methods) {
        const tryStatements = method.getDescendantsOfKind(SyntaxKind.TryStatement);

        if (tryStatements.length === 0 && method.getBody()) {
          const { line } = sf.getLineAndColumnAtPos(method.getStart());

          push(findings, {
            level: 'warn',
            file: rel,
            line,
            code: 'result/adapter-missing-try-catch',
            message: `Adapter method '${method.getName()}' should wrap external calls in try-catch → Result.fail()`,
            suggestion: 'Add try-catch block and return Result.fail() on exceptions',
          });
        }
      }
    }
  }
}

export const resultMonadPlugin: Plugin = {
  name: 'Result Monad',

  async run(ctx: PluginContext): Promise<PluginResult> {
    const root = resolveWorkspaceRoot(ctx.cwd);
    const files = collectFiles(ctx, root);

    if (files.length === 0) {
      return { name: this.name, status: 'skipped' };
    }

    const findings: Finding[] = [];

    // Type-aware AST checks (use TypeScript type checker for accurate detection)
    if (ctx.scope === 'full' || files.length > 0) {
      const project = new Project({
        tsConfigFilePath: path.join(root, 'tsconfig.json'),
        skipAddingFilesFromTsConfig: false,
      });

      const sourceFiles = project.getSourceFiles();

      // If we have real source files, use AST-based type checking
      // Otherwise fall back to regex (e.g., in mocked tests)
      const useASTCheck = sourceFiles.length > 0;

      if (useASTCheck) {
        for (const sf of sourceFiles) {
          const rel = path.relative(root, sf.getFilePath());

          if (shouldIgnore(rel)) {
            continue;
          }

          if (!rel.startsWith('src/modules/')) {
            continue;
          }

          checkResultPropertyAccess(sf, rel, findings);
        }
      } else {
        // Fallback: Regex-based check (used in tests with mocked ts-morph)
        for (const relPath of files) {
          const absPath = path.join(root, relPath);
          if (!fs.existsSync(absPath)) {
            continue;
          }

          const content = fs.readFileSync(absPath, 'utf8');
          // Keep regex fallback for test environments
          checkOkPropertyUsage(relPath, content, findings);
          checkErrorPropertyUsage(relPath, content, findings);
          checkValueAccessWithoutGuardRegex(relPath, content, findings);
        }
      }

      checkThrowInForbiddenLayers(project, root, findings);
      checkAdapterTryCatch(project, root, findings);
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
