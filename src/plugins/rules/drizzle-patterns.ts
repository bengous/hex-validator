import fs from 'node:fs';
import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import fg from 'fast-glob';

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

function collectFiles(ctx: PluginContext, root: string): string[] {
  if (ctx.scope === 'full') {
    return fg.sync(['src/modules/**/server/**/*.ts', 'src/app/**/*.{ts,tsx}'], {
      cwd: root,
      dot: false,
    });
  }
  const baseline = ctx.targetFiles ?? (ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles);
  return baseline
    .map((file) => path.relative(root, path.resolve(ctx.cwd, file)))
    .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
}

function push(findings: Finding[], data: Finding) {
  findings.push(data);
}

function checkRawReturn(relPath: string, content: string, findings: Finding[]) {
  if (!relPath.includes('/server/actions')) {
    return;
  }
  const pattern = /return\s*{[\s\S]*?success\s*:\s*true\s*,[\s\S]*?}/g;
  for (const match of content.matchAll(pattern)) {
    const snippet = match[0];
    const context = content.slice(Math.max(0, (match.index ?? 0) - 200), match.index ?? 0);
    if (
      snippet.includes('.parse(') ||
      context.includes('.parse(') ||
      context.includes('.safeParse(')
    ) {
      continue;
    }
    const before = content.slice(0, match.index ?? 0);
    const line = before.split('\n').length;
    push(findings, {
      level: 'warn',
      file: relPath,
      line,
      code: 'drizzle/raw-return',
      message: 'Returning success payload without view parsing or schema validation.',
      suggestion: 'Parse the payload through the appropriate View schema before returning.',
    });
  }
}

function checkManualZObject(relPath: string, lines: string[], findings: Finding[]) {
  if (!relPath.includes('/server/actions')) {
    return;
  }
  lines.forEach((line, idx) => {
    if (line.includes('z.object({')) {
      push(findings, {
        level: 'warn',
        file: relPath,
        line: idx + 1,
        code: 'drizzle/manual-z-object',
        message: 'Consider reusing drizzle-zod generated schemas instead of manual z.object.',
        suggestion: 'Import the generated insert/update schema from the module db/schema file.',
      });
    }
  });
}

function checkUnvalidatedInsert(relPath: string, content: string, findings: Finding[]) {
  const insertRegex = /db(?:\(\))?\.insert\([^)]+\)\.values\(([^)]+)\)/g;
  for (const match of content.matchAll(insertRegex)) {
    const snippet = match[1] ?? '';
    if (!/(validated|parsed|parse\(|safeParse|input)/i.test(snippet)) {
      const before = content.slice(0, match.index ?? 0);
      const line = before.split('\n').length;
      push(findings, {
        level: 'warn',
        file: relPath,
        line,
        code: 'drizzle/unvalidated-insert',
        message: 'Insert call may be using unvalidated input.',
        suggestion: 'Validate data via drizzle-zod schema before calling .values().',
      });
    }
  }
}

function checkLegacyAdapters(relPath: string, content: string, findings: Finding[]) {
  if (content.includes("from '@/server/db/adapters")) {
    push(findings, {
      level: 'error',
      file: relPath,
      code: 'drizzle/legacy-adapter',
      message: 'Legacy adapter import detected. Replace with module-owned schema helpers.',
    });
  }
}

function checkQueryParsing(relPath: string, content: string, findings: Finding[]) {
  if (!relPath.includes('/server/queries')) {
    return;
  }
  const hasParse = /(View|view)\.(?:safeParse|parse)\(/.test(content);
  if (!hasParse) {
    push(findings, {
      level: 'warn',
      file: relPath,
      code: 'drizzle/missing-view-parse',
      message: 'Query result not parsed through a view schema.',
      suggestion: 'Wrap DB results with the appropriate View.parse().',
    });
  }
}

function checkDirectDbReturns(relPath: string, content: string, findings: Finding[]) {
  const pattern = /return\s+(?:await\s+)?db\.query\./;
  if (pattern.test(content)) {
    push(findings, {
      level: 'warn',
      file: relPath,
      code: 'drizzle/direct-db-return',
      message: 'Returning raw db.query results without view parsing.',
      suggestion: 'Parse query results through a view before returning.',
    });
  }
}

export const drizzlePatternsPlugin: Plugin = {
  name: 'Drizzle Patterns',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const workspaceRoot = resolveWorkspaceRoot(ctx.cwd);
    const files = collectFiles(ctx, workspaceRoot);
    if (files.length === 0) {
      return { name: 'Drizzle Patterns', status: 'skipped' };
    }

    const findings: Finding[] = [];
    for (const relPath of files) {
      const abs = path.join(workspaceRoot, relPath);
      if (!fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
        continue;
      }
      const content = fs.readFileSync(abs, 'utf8');
      // Skip views and validator package itself
      if (relPath.includes('/views/') || relPath.startsWith('packages/')) {
        continue;
      }

      const lines = content.split(/\r?\n/);

      checkRawReturn(relPath, content, findings);
      checkManualZObject(relPath, lines, findings);
      checkUnvalidatedInsert(relPath, content, findings);
      checkLegacyAdapters(relPath, content, findings);
      checkQueryParsing(relPath, content, findings);
      checkDirectDbReturns(relPath, content, findings);
    }

    if (findings.length === 0) {
      return { name: 'Drizzle Patterns', status: 'pass' };
    }

    const hasErrors = findings.some((f) => f.level === 'error');

    return {
      name: 'Drizzle Patterns',
      status: hasErrors ? 'fail' : 'warn',
      messages: findings,
    };
  },
};
