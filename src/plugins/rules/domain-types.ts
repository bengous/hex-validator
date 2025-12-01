import fs from 'node:fs';
import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import {
  type ElementAccessExpression,
  Node,
  Project,
  type PropertyAccessExpression,
  type SourceFile,
  SyntaxKind,
  type Type,
} from 'ts-morph';

function hasUndefinedUnion(type: Type): boolean {
  return type.isUnion() && type.getUnionTypes().some((t) => t.isUndefined());
}

function isDomainFile(relPath: string): boolean {
  return (
    relPath.startsWith('src/modules/') &&
    (relPath.includes('/server/') || relPath.includes('/core/')) &&
    (relPath.endsWith('.ts') || relPath.endsWith('.tsx'))
  );
}

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

function resolveTsConfig(cwd: string): { path: string; root: string } | null {
  const domain = findUpwards(cwd, 'tsconfig.domain.json');
  if (domain) {
    return { path: domain, root: path.dirname(domain) };
  }
  const general = findUpwards(cwd, 'tsconfig.json');
  if (general) {
    return { path: general, root: path.dirname(general) };
  }
  return null;
}

function collectTargetFiles(ctx: PluginContext, root: string): string[] {
  if (ctx.scope === 'full') {
    return [];
  }
  const baseline = ctx.targetFiles ?? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles);
  return baseline
    .map((file) => path.relative(root, path.resolve(ctx.cwd, file)))
    .filter(isDomainFile);
}

function checkFile(file: SourceFile, root: string, messages: Message[]): void {
  const rel = path.relative(root, file.getFilePath());

  file.getDescendantsOfKind(SyntaxKind.ElementAccessExpression).forEach((expr) => {
    const element = expr as ElementAccessExpression;
    const argument = element.getArgumentExpression();
    if (!argument) {
      return;
    }
    const text = argument.getText();
    if (text === "'_input'" || text === '"_input"') {
      messages.push({
        level: 'error',
        file: rel,
        code: 'domain/view-input-cast',
        message:
          "Avoid casting view outputs via ['_input']; create dedicated view builders instead.",
      });
    }
  });

  file.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).forEach((expr) => {
    const access = expr as PropertyAccessExpression;
    if (access.getName() !== 'unknown') {
      return;
    }
    const expressionText = access.getExpression().getText();
    if (expressionText === 'z') {
      const { line, column } = file.getLineAndColumnAtPos(access.getNameNode().getStart());
      messages.push({
        level: 'warn',
        file: rel,
        line,
        col: column,
        code: 'domain/z-unknown',
        message: 'Avoid using z.unknown() in domain views; prefer explicit shapes.',
      });
    }
  });

  file.getExportedDeclarations().forEach((decls, name) => {
    decls.forEach((decl) => {
      const typedDecl = decl as unknown as { getType?: () => Type };
      if (typeof typedDecl.getType !== 'function') {
        return;
      }
      const type = typedDecl.getType();
      if (hasUndefinedUnion(type)) {
        const { line, column } = decl.getSourceFile().getLineAndColumnAtPos(decl.getStart());
        messages.push({
          level: 'error',
          file: rel,
          line,
          col: column,
          code: 'domain/undefined-union',
          message: `Export "${name}" includes '| undefined'. Prefer explicit Option types instead.`,
          suggestion: `Replace '| undefined' in ${name} with nullables or dedicated Option helpers.`,
        });
      }

      if (
        (Node.isPropertySignature(decl) || Node.isMethodSignature(decl)) &&
        decl.hasQuestionToken() &&
        hasUndefinedUnion(type)
      ) {
        const { line, column } = decl.getSourceFile().getLineAndColumnAtPos(decl.getStart());
        messages.push({
          level: 'error',
          file: rel,
          line,
          col: column,
          code: 'domain/optional-undefined',
          message: `Optional member "${name}" redundantly unions with undefined.`,
          suggestion: 'Remove the explicit undefined or drop the optional marker.',
        });
      }
    });
  });

  file.getDescendantsOfKind(SyntaxKind.ReturnStatement).forEach((stmt) => {
    const expr = stmt.getExpression();
    if (!expr) {
      return;
    }
    if (expr.getText().trim() === 'undefined') {
      const { line, column } = file.getLineAndColumnAtPos(stmt.getStart());
      messages.push({
        level: 'warn',
        file: rel,
        line,
        col: column,
        code: 'domain/return-undefined',
        message: "Avoid returning bare 'undefined' from domain code.",
        suggestion: 'Return a Result/Option type instead of undefined.',
      });
    }
  });
}

export const domainTypesPlugin: Plugin = {
  name: 'Domain Type Purity',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const tsconfig = resolveTsConfig(ctx.cwd);
    if (!tsconfig) {
      return {
        name: 'Domain Type Purity',
        status: 'skipped',
        messages: [
          {
            level: 'info',
            message: 'tsconfig not found. Domain checks skipped.',
          },
        ],
      } satisfies PluginResult;
    }

    const project = new Project({ tsConfigFilePath: tsconfig.path });
    const workspaceRoot = tsconfig.root;

    const targetFiles = collectTargetFiles(ctx, workspaceRoot);
    const sourceFiles =
      ctx.scope === 'full'
        ? project.getSourceFiles(['src/modules/**/server/**/*.ts', 'src/modules/**/core/**/*.ts'])
        : targetFiles
            .map((relPath) => project.getSourceFile(path.join(workspaceRoot, relPath)))
            .filter((file): file is SourceFile => Boolean(file));

    if (sourceFiles.length === 0) {
      return { name: 'Domain Type Purity', status: 'skipped' };
    }

    const messages: Message[] = [];
    for (const file of sourceFiles) {
      checkFile(file, workspaceRoot, messages);
    }

    const hasError = messages.some((m) => m.level === 'error');
    const status: PluginResult['status'] = hasError ? 'fail' : messages.length ? 'warn' : 'pass';
    return {
      name: 'Domain Type Purity',
      status,
      ...(messages.length ? { messages } : {}),
    };
  },
};
