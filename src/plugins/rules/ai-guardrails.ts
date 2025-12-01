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
    return fg.sync(['src/**/*.ts', 'src/**/*.tsx'], {
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
    .filter((f) => (f.endsWith('.ts') || f.endsWith('.tsx')) && f.startsWith('src/'));
}

function push(findings: Finding[], data: Finding) {
  findings.push(data);
}

/**
 * Rule 23: Check for emoji in source code
 * Constitutional violation: AI agents add emojis contrary to project style
 */
function checkEmojiInCode(relPath: string, content: string, findings: Finding[]) {
  // Unicode emoji ranges
  const emojiPattern = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      continue;
    }

    const match = emojiPattern.test(line);
    if (match) {
      push(findings, {
        level: 'error',
        file: relPath,
        line: i + 1,
        code: 'ai/emoji-in-code',
        message: 'Emoji detected in source code (CLAUDE.md forbids emojis)',
        suggestion: 'Remove emoji - project uses ASCII-only style',
      });
      // Only report first occurrence per file to avoid spam
      break;
    }
  }
}

/**
 * Rule 24: Check for mocks outside infrastructure/mocks/
 * Constitutional violation: Mocks belong in infrastructure layer only
 */
function checkMockPlacement(relPath: string, findings: Finding[]) {
  // Check if file appears to be a mock based on filename
  const fileName = path.basename(relPath);
  const isMockFile = /^Mock.*\.(ts|tsx)$/i.test(fileName) || /\.mock\.(ts|tsx)$/i.test(fileName);

  if (!isMockFile) {
    return;
  }

  // Check if it's in the correct location
  const isInCorrectLocation = relPath.includes('/infrastructure/mocks/');

  if (!isInCorrectLocation) {
    // Specifically check for core layer violation
    const isInCore = relPath.includes('/core/');

    push(findings, {
      level: 'error',
      file: relPath,
      line: 1,
      code: isInCore ? 'ai/mock-in-core' : 'ai/mock-placement',
      message: isInCore
        ? 'Mock files must not exist in core/ layer (layer violation per ADR-002)'
        : 'Mock files must be placed in infrastructure/mocks/ directory',
      suggestion: `Move to ${relPath.replace(/\/[^/]+\/Mock.*$/, '/infrastructure/mocks/')}`,
    });
  }
}

/**
 * Rule 25: Check for proactive README generation in modules
 * Constitutional violation: AI agents create docs without explicit request
 */
function checkProactiveReadme(root: string, findings: Finding[]) {
  const modulesDir = path.join(root, 'src', 'modules');

  if (!fs.existsSync(modulesDir)) {
    return;
  }

  const modules = fs
    .readdirSync(modulesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const moduleName of modules) {
    const readmePath = path.join(modulesDir, moduleName, 'README.md');
    const relPath = `src/modules/${moduleName}/README.md`;

    if (fs.existsSync(readmePath)) {
      // Check if this README was created recently (heuristic: file is new in git)
      // We'll check git status to see if it's an untracked or newly added file
      // For simplicity in this plugin, we'll just warn about ALL module READMEs
      // since CLAUDE.md explicitly forbids proactive documentation

      push(findings, {
        level: 'warn',
        file: relPath,
        line: 1,
        code: 'ai/proactive-readme',
        message: 'Module README.md detected (CLAUDE.md forbids proactive documentation)',
        suggestion: 'Only create documentation when explicitly requested by user',
      });
    }
  }
}

/**
 * Main plugin
 */
export const aiGuardrailsPlugin: Plugin = {
  name: 'AI Guardrails',

  async run(ctx: PluginContext): Promise<PluginResult> {
    const root = resolveWorkspaceRoot(ctx.cwd);
    const files = collectFiles(ctx, root);

    if (files.length === 0) {
      return { name: this.name, status: 'skipped' };
    }

    const findings: Finding[] = [];

    // Rule 23 & 24: Check source files for emojis and mock placement
    for (const relPath of files) {
      const absPath = path.join(root, relPath);
      if (!fs.existsSync(absPath)) {
        continue;
      }

      const content = fs.readFileSync(absPath, 'utf8');

      checkEmojiInCode(relPath, content, findings);
      checkMockPlacement(relPath, findings);
    }

    // Rule 25: Check for proactive READMEs (only in full scope or when modules/ changed)
    if (ctx.scope === 'full' || files.some((f) => f.startsWith('src/modules/'))) {
      checkProactiveReadme(root, findings);
    }

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
