import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import type { Expression, SourceFile, Node as TsNode } from 'ts-morph';
import { Project, SyntaxKind } from 'ts-morph';

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
    filePath.includes('/coverage/')
  );
}

type LiteralSet = {
  key: string;
  name: string;
  values: string[];
  file: string;
  module: string;
};

function valuesKey(values: string[]): string {
  return [...new Set(values)].sort().join('|');
}

function extractStringArray(expr: Expression | undefined): string[] | null {
  if (!expr) {
    return null;
  }
  const arr = expr.asKind(SyntaxKind.ArrayLiteralExpression);
  if (arr) {
    const values: string[] = [];
    for (const el of arr.getElements()) {
      const literal = el.asKind(SyntaxKind.StringLiteral);
      if (!literal) {
        return null;
      }
      values.push(literal.getLiteralText());
    }
    return values.length > 0 ? values : null;
  }
  const asExpr = expr.asKind(SyntaxKind.AsExpression);
  if (asExpr) {
    return extractStringArray(asExpr.getExpression());
  }
  return null;
}

function gatherCanonicalSets(
  project: Project,
  cwd: string
): { sets: Map<string, LiteralSet[]>; modulesWithSchema: Set<string> } {
  const sets = new Map<string, LiteralSet[]>();
  const modulesWithSchema = new Set<string>();

  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());
    const match = rel.match(/^src\/modules\/([^/]+)\/db\/schema\.ts$/);
    if (!match) {
      continue;
    }
    const moduleName = match[1];
    if (!moduleName) {
      continue;
    }
    modulesWithSchema.add(moduleName);
    for (const decl of sf.getVariableDeclarations()) {
      const statement = decl.getVariableStatement();
      if (!statement?.isExported()) {
        continue;
      }
      if (decl.getKind() !== SyntaxKind.VariableDeclaration) {
        continue;
      }
      const initializer = decl.getInitializer();
      const strings = extractStringArray(initializer);
      if (!strings) {
        continue;
      }
      const key = valuesKey(strings);
      const entry: LiteralSet = {
        key,
        name: decl.getName(),
        values: strings,
        file: rel,
        module: moduleName,
      };
      if (!sets.has(key)) {
        sets.set(key, []);
      }
      sets.get(key)?.push(entry);
    }
  }
  return { sets, modulesWithSchema };
}

function reportManualLiteral(
  params: {
    relPath: string;
    node: TsNode;
    values: string[];
    canonical: LiteralSet;
  },
  messages: Message[]
) {
  const { relPath, node, values, canonical } = params;
  const { line, column } = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  messages.push({
    level: 'error',
    file: relPath,
    line,
    col: column,
    code: 'ast/manual-literal-union',
    message: `Literal set ${values.join(', ')} duplicates ${canonical.name}. Import from ${canonical.file}.`,
    suggestion: `Import { ${canonical.name} } from '@/modules/${canonical.module}/db/schema'.`,
  });
}

function checkUnionTypes(
  sf: SourceFile,
  rel: string,
  canonicalSets: Map<string, LiteralSet[]>,
  messages: Message[]
) {
  const handled = new Set<number>();
  sf.forEachDescendant((node) => {
    if (node.getKind() === SyntaxKind.TypeAliasDeclaration) {
      const alias = node.asKind(SyntaxKind.TypeAliasDeclaration);
      if (!alias) {
        return;
      }
      const typeNode = alias.getTypeNode()?.asKind(SyntaxKind.UnionType);
      if (!typeNode) {
        return;
      }
      const values: string[] = [];
      for (const t of typeNode.getTypeNodes()) {
        const literal = t
          .asKind(SyntaxKind.LiteralType)
          ?.getFirstChildByKind(SyntaxKind.StringLiteral);
        if (!literal) {
          return;
        }
        values.push(literal.getLiteralText());
      }
      if (!values.length) {
        return;
      }
      const key = valuesKey(values);
      const canonical = canonicalSets.get(key);
      if (!canonical) {
        return;
      }
      if (canonical.some((c) => c.file === rel)) {
        return;
      }
      if (handled.has(alias.getPos())) {
        return;
      }
      const canonicalEntry = canonical[0];
      if (!canonicalEntry) {
        return;
      }
      reportManualLiteral(
        { relPath: rel, node: alias, values, canonical: canonicalEntry },
        messages
      );
      handled.add(alias.getPos());
    }
  });
}

function checkVariableLiterals(
  sf: SourceFile,
  rel: string,
  canonicalSets: Map<string, LiteralSet[]>,
  messages: Message[]
) {
  for (const decl of sf.getVariableDeclarations()) {
    const initializer = decl.getInitializer();
    const values = extractStringArray(initializer);
    if (!values?.length) {
      continue;
    }
    const key = valuesKey(values);
    const canonical = canonicalSets.get(key);
    if (!canonical || canonical.some((c) => c.file === rel)) {
      continue;
    }
    const canonicalEntry = canonical[0];
    if (!canonicalEntry) {
      continue;
    }
    reportManualLiteral({ relPath: rel, node: decl, values, canonical: canonicalEntry }, messages);
  }
}

function checkZodEnums(
  sf: SourceFile,
  rel: string,
  canonicalSets: Map<string, LiteralSet[]>,
  messages: Message[]
) {
  sf.forEachDescendant((node) => {
    if (node.getKind() !== SyntaxKind.CallExpression) {
      return;
    }
    const call = node.asKind(SyntaxKind.CallExpression);
    if (!call) {
      return;
    }
    const exprText = call.getExpression().getText();
    if (!/(?:^|\.)enum$/.test(exprText)) {
      return;
    }
    const firstArg = call.getArguments()[0] as Expression | undefined;
    const values = extractStringArray(firstArg);
    if (!values?.length) {
      return;
    }
    const key = valuesKey(values);
    const canonical = canonicalSets.get(key);
    if (!canonical || canonical.some((c) => c.file === rel)) {
      return;
    }
    const canonicalEntry = canonical[0];
    if (!canonicalEntry) {
      return;
    }
    reportManualLiteral({ relPath: rel, node: call, values, canonical: canonicalEntry }, messages);
  });
}

function checkViewsSchemaImport(
  sf: SourceFile,
  rel: string,
  modulesWithSchema: Set<string>,
  messages: Message[]
) {
  const match = rel.match(/^src\/modules\/([^/]+)\/db\/views\.ts$/);
  if (!match) {
    return;
  }
  const moduleName = match[1];
  if (!moduleName) {
    return;
  }
  if (!modulesWithSchema.has(moduleName)) {
    return;
  }
  const hasSchemaImport = sf.getImportDeclarations().some((imp) => {
    const spec = imp.getModuleSpecifierValue();
    return (
      spec === `@/modules/${moduleName}/db/schema` || spec === './schema' || spec === '../db/schema'
    );
  });
  if (!hasSchemaImport) {
    messages.push({
      level: 'error',
      file: rel,
      code: 'ast/views-missing-schema-import',
      message: `db/views.ts must import canonical schemas from '@/modules/${moduleName}/db/schema'.`,
      suggestion: `Add 'import { ... } from '@/modules/${moduleName}/db/schema';'`,
    });
  }
}

const CORE_SIDE_EFFECT_PATTERNS = [
  /\bnew\s+Date\b/,
  /\bDate\.now\b/,
  /\bMath\.random\b/,
  /\bcrypto\.randomUUID\b/,
  /\bfetch\s*\(/,
];

function checkCorePurity(sf: SourceFile, rel: string, messages: Message[]) {
  const match = rel.match(/^src\/modules\/([^/]+)\/core\//);
  if (!match) {
    return;
  }
  for (const imp of sf.getImportDeclarations()) {
    const spec = imp.getModuleSpecifierValue();
    if (spec.startsWith('next/') || spec.startsWith('react')) {
      const { line, column } = sf.getLineAndColumnAtPos(imp.getStart());
      messages.push({
        level: 'error',
        file: rel,
        line,
        col: column,
        code: 'ast/core-imports-forbidden',
        message: `Core modules must remain pure. Remove import from '${spec}'.`,
      });
    }
  }
  const text = sf.getFullText();
  for (const pattern of CORE_SIDE_EFFECT_PATTERNS) {
    const matchPattern = text.match(pattern);
    if (!matchPattern) {
      continue;
    }
    const index = matchPattern.index ?? 0;
    const { line, column } = sf.getLineAndColumnAtPos(index);
    messages.push({
      level: 'warn',
      file: rel,
      line,
      col: column,
      code: 'ast/core-side-effect',
      message: 'Core modules should avoid side-effectful APIs such as Date/Math.random/fetch.',
      suggestion: 'Move this logic into infrastructure/adapters or ui/ layers (ADR-002).',
    });
    break;
  }
}

export function runAstAudit(cwd: string): PluginResult {
  const project = new Project({
    tsConfigFilePath: path.join(cwd, 'tsconfig.json'),
    skipAddingFilesFromTsConfig: false,
  });

  const messages: Message[] = [];
  const { sets: canonicalSets, modulesWithSchema } = gatherCanonicalSets(project, cwd);

  for (const sf of project.getSourceFiles()) {
    const rel = path.relative(cwd, sf.getFilePath());
    if (shouldIgnore(rel) || rel.endsWith('.d.ts') || /\.test\.|\.spec\./.test(rel)) {
      continue;
    }

    checkUnionTypes(sf, rel, canonicalSets, messages);
    checkVariableLiterals(sf, rel, canonicalSets, messages);
    checkZodEnums(sf, rel, canonicalSets, messages);
    checkViewsSchemaImport(sf, rel, modulesWithSchema, messages);
    checkCorePurity(sf, rel, messages);
  }

  const hasError = messages.some((m) => m.level === 'error');
  const status: PluginResult['status'] = hasError ? 'fail' : messages.length > 0 ? 'warn' : 'pass';

  return {
    name: 'AST Audit (domain architecture)',
    status,
    messages,
  };
}

export const astAuditPlugin: Plugin = {
  name: 'AST Audit (domain architecture)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const changed =
      ctx.scope === 'full' ? true : ctx.changedFiles.some((f) => f.startsWith('src/modules/'));
    if (!changed) {
      return { name: 'AST Audit (domain architecture)', status: 'skipped' };
    }
    return runAstAudit(ctx.cwd);
  },
};
