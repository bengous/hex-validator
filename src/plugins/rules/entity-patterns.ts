import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import { Project, Scope } from 'ts-morph';

type Finding = {
  file: string;
  line?: number;
  level: Message['level'];
  code: string;
  message: string;
  suggestion?: string;
};

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

function push(findings: Finding[], data: Finding) {
  findings.push(data);
}

/**
 * Rule 9: Check for private constructor in entities
 */
function checkPrivateConstructor(project: Project, cwd: string, findings: Finding[]) {
  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());

    if (shouldIgnore(rel)) {
      continue;
    }

    // Only check domain entities
    if (!rel.includes('/core/domain/')) {
      continue;
    }

    const classes = sf.getClasses();

    for (const cls of classes) {
      const constructors = cls.getConstructors();

      for (const ctor of constructors) {
        const scope = ctor.getScope();

        // Private or protected is acceptable
        if (scope !== Scope.Private && scope !== Scope.Protected) {
          const { line } = sf.getLineAndColumnAtPos(ctor.getStart());
          const className = cls.getName() || 'Unknown';

          push(findings, {
            level: 'error',
            file: rel,
            line,
            code: 'entity/private-constructor',
            message: `Entity '${className}' must have private constructor (ADR-002 factory pattern)`,
            suggestion: 'Make constructor private and provide static create() factory method',
          });
        }
      }
    }
  }
}

/**
 * Rule 10: Check that create() returns Result<T>
 */
function checkCreateMethodReturnType(project: Project, cwd: string, findings: Finding[]) {
  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());

    if (shouldIgnore(rel)) {
      continue;
    }

    // Only check domain entities
    if (!rel.includes('/core/domain/')) {
      continue;
    }

    const classes = sf.getClasses();

    for (const cls of classes) {
      const createMethod = cls.getStaticMethod('create');

      if (!createMethod) {
        continue;
      }

      const returnType = createMethod.getReturnType().getText();

      // Check if return type includes Result<
      if (!returnType.includes('Result<')) {
        const { line } = sf.getLineAndColumnAtPos(createMethod.getStart());
        const className = cls.getName() || 'Unknown';

        push(findings, {
          level: 'error',
          file: rel,
          line,
          code: 'entity/create-returns-result',
          message: `Factory method '${className}.create()' must return Result<T> (ADR-002)`,
          suggestion: `Change return type to Result<${className}, string>`,
        });
      }
    }
  }
}

/**
 * Rule 11: Check that mutation methods return Result<void>
 */
function checkMutationMethodsReturnResult(project: Project, cwd: string, findings: Finding[]) {
  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());

    if (shouldIgnore(rel)) {
      continue;
    }

    // Only check domain entities
    if (!rel.includes('/core/domain/')) {
      continue;
    }

    const classes = sf.getClasses();

    for (const cls of classes) {
      const methods = cls.getMethods();

      for (const method of methods) {
        // Skip static methods
        if (method.isStatic()) {
          continue;
        }

        const methodName = method.getName();

        // Check if method name suggests mutation
        const isMutation = /^(set|update|add|remove|delete|change|modify|assign|mark)/.test(
          methodName
        );

        if (!isMutation) {
          continue;
        }

        const returnType = method.getReturnType().getText();

        // Check if return type includes Result<
        if (!returnType.includes('Result<')) {
          const { line } = sf.getLineAndColumnAtPos(method.getStart());

          push(findings, {
            level: 'warn',
            file: rel,
            line,
            code: 'entity/mutation-returns-result',
            message: `Mutation method '${methodName}()' should return Result<void> for error handling`,
            suggestion: 'Return Result<void> to propagate validation errors',
          });
        }
      }
    }
  }
}

/**
 * Main plugin
 */
export const entityPatternsPlugin: Plugin = {
  name: 'Entity Patterns (DDD)',

  async run(ctx: PluginContext): Promise<PluginResult> {
    const cwd = ctx.cwd;

    // Only run if domain files changed
    const baseline =
      ctx.targetFiles ?? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles);
    const changedDomainFiles =
      ctx.scope === 'full' ? true : baseline.some((f) => f.includes('/core/domain/'));

    if (!changedDomainFiles) {
      return { name: this.name, status: 'skipped' };
    }

    const project = new Project({
      tsConfigFilePath: path.join(cwd, 'tsconfig.json'),
      skipAddingFilesFromTsConfig: false,
    });

    const findings: Finding[] = [];

    checkPrivateConstructor(project, cwd, findings);
    checkCreateMethodReturnType(project, cwd, findings);
    checkMutationMethodsReturnResult(project, cwd, findings);

    const messages: Message[] = findings.map((f) => ({
      level: f.level,
      file: f.file,
      ...(typeof f.line === 'number' ? { line: f.line } : {}),
      code: f.code,
      message: f.message,
      ...(f.suggestion ? { suggestion: f.suggestion } : {}),
    }));

    const hasErrors = findings.some((f) => f.level === 'error');
    const hasWarnings = findings.some((f) => f.level === 'warn');

    return {
      name: this.name,
      status: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
      messages,
    };
  },
};
