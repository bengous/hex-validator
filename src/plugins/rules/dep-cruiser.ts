import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path, { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCachedToolInfo } from '@validator/core/tool-detection';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';

type DependencyCruiserSeverity = 'error' | 'warn' | 'info';

type ViolationGroup = {
  rule: string;
  severity: DependencyCruiserSeverity;
  count: number;
  fileViolations: Map<string, number>;
  targets: string[];
  comment?: string;
  suggestion?: string;
};

type ParsedViolations = {
  groups: ViolationGroup[];
  totalViolations: number;
  fileCount: number;
  hasErrors: boolean;
};

const SEVERITY_ORDER: Record<DependencyCruiserSeverity, number> = {
  error: 0,
  warn: 1,
  info: 2,
};

const SEVERITY_TO_LEVEL: Record<DependencyCruiserSeverity, Message['level']> = {
  error: 'error',
  warn: 'warn',
  info: 'info',
};

function run(cmd: string, args: string[], cwd: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
    const c = cmd === 'pnpm' ? 'pnpm' : cmd;
    const child = spawn(c, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.stderr.on('data', (d) => {
      err += d.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: out, stderr: err });
    });
  });
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

function normalizeSeverity(value: unknown): DependencyCruiserSeverity {
  if (value === 'error') {
    return 'error';
  }
  if (value === 'warn') {
    return 'warn';
  }
  return 'info';
}

function parseDependencyCruiserOutput(stdout: string): ParsedViolations {
  const data: unknown = JSON.parse(stdout);
  const isObj = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  const asArr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const root = isObj(data) ? data : {};
  const summary = isObj(root.summary) ? root.summary : {};
  const violations = asArr(root.violations).length
    ? asArr(root.violations)
    : asArr(summary.violations);

  const groupsMap = new Map<
    string,
    {
      rule: string;
      severity: DependencyCruiserSeverity;
      count: number;
      fileViolations: Map<string, number>;
      targets: Set<string>;
      comment?: string;
      suggestion?: string;
    }
  >();
  const allFiles = new Set<string>();

  for (const raw of violations) {
    if (!isObj(raw)) {
      continue;
    }
    const ruleObj = isObj(raw.rule) ? raw.rule : {};
    const severity = normalizeSeverity(ruleObj.severity);
    const ruleName =
      typeof ruleObj.name === 'string' && ruleObj.name.length > 0 ? ruleObj.name : 'rule-violation';
    const comment = typeof ruleObj.comment === 'string' ? ruleObj.comment : undefined;
    const suggestion = typeof raw.suggestion === 'string' ? raw.suggestion : undefined;
    const from = typeof raw.from === 'string' ? raw.from : undefined;
    const to = typeof raw.to === 'string' ? raw.to : undefined;

    const key = ruleName;
    if (!groupsMap.has(key)) {
      const newGroup: {
        rule: string;
        severity: DependencyCruiserSeverity;
        count: number;
        fileViolations: Map<string, number>;
        targets: Set<string>;
        comment?: string;
        suggestion?: string;
      } = {
        rule: ruleName,
        severity,
        count: 0,
        fileViolations: new Map<string, number>(),
        targets: new Set<string>(),
      };
      if (comment) {
        newGroup.comment = comment;
      }
      if (suggestion) {
        newGroup.suggestion = suggestion;
      }
      groupsMap.set(key, newGroup);
    }
    const group = groupsMap.get(key);
    if (!group) {
      continue;
    }
    if (severity === 'error') {
      group.severity = 'error';
    } else if (severity === 'warn' && group.severity === 'info') {
      group.severity = 'warn';
    }
    group.count += 1;
    if (from) {
      const currentCount = group.fileViolations.get(from) ?? 0;
      group.fileViolations.set(from, currentCount + 1);
      allFiles.add(from);
    }
    if (to) {
      group.targets.add(to);
    }
    if (!group.comment && comment) {
      group.comment = comment;
    }
    if (!group.suggestion && suggestion) {
      group.suggestion = suggestion;
    }
  }

  const groups: ViolationGroup[] = [...groupsMap.values()]
    .map((group) => {
      // Sort files alphabetically and create Map with sorted entries
      const sortedFileViolations = new Map(
        [...group.fileViolations.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      );
      const violationGroup: ViolationGroup = {
        rule: group.rule,
        severity: group.severity,
        count: group.count,
        fileViolations: sortedFileViolations,
        targets: [...group.targets].sort(),
      };
      if (group.comment) {
        violationGroup.comment = group.comment;
      }
      if (group.suggestion) {
        violationGroup.suggestion = group.suggestion;
      }
      return violationGroup;
    })
    .sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return a.rule.localeCompare(b.rule);
    });

  const totalViolations = groups.reduce((acc, group) => acc + group.count, 0);

  return {
    groups,
    totalViolations,
    fileCount: allFiles.size,
    hasErrors: groups.some((group) => group.severity === 'error'),
  } satisfies ParsedViolations;
}

function buildMessagesFromGroups(groups: ViolationGroup[]): Message[] {
  const messages: Message[] = [];

  for (const group of groups) {
    const suggestion =
      group.suggestion ??
      group.comment ??
      `Review the "${group.rule}" rule in dependency-cruiser configuration for remediation guidance.`;

    const filesList =
      group.fileViolations.size > 0
        ? [...group.fileViolations.entries()]
            .map(([file, count]) => `    - ${file} [${count}]`)
            .join('\n')
        : '    (no files recorded)';

    const messageParts = [
      `${group.rule} [${group.count} | ${group.fileViolations.size}]`,
      `  Fix: ${suggestion}`,
      '  List:',
      filesList,
    ];

    messages.push({
      level: SEVERITY_TO_LEVEL[group.severity],
      message: messageParts.join('\n'),
    });
  }
  return messages;
}

function createOutputSnippet(stdout: string): string {
  const lines = stdout.split(/\r?\n/).filter(Boolean).slice(0, 5);
  if (lines.length === 0) {
    return 'No stdout captured from dependency-cruiser.';
  }
  return [
    'First lines from dependency-cruiser output:',
    ...lines.map((line) => `    ${line}`),
  ].join('\n');
}

export const depCruiserPlugin: Plugin = {
  name: 'Architecture (dependency-cruiser)',
  async run(ctx: PluginContext): Promise<PluginResult> {
    const start = Date.now();

    const toolInfo = await getCachedToolInfo('depcruise', ctx.cwd);

    if (!toolInfo.available) {
      return {
        name: 'Architecture (dependency-cruiser)',
        status: 'skipped',
        durationMs: Date.now() - start,
        stdout: [
          'dependency-cruiser not found.',
          'Install it with: pnpm add -D dependency-cruiser',
          '',
          'This check is skipped for now.',
        ].join('\n'),
      };
    }

    // Find project root by looking for pnpm-workspace.yaml or package.json with workspaces
    let projectRoot = ctx.cwd;
    let current = ctx.cwd;
    while (true) {
      // Check for pnpm-workspace.yaml (pnpm workspaces)
      if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
        projectRoot = current;
        break;
      }
      // Check for package.json with workspaces field (npm/yarn workspaces)
      const pkgPath = path.join(current, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
          if (pkg.workspaces) {
            projectRoot = current;
            break;
          }
        } catch {
          // ignore
        }
      }
      const parent = path.dirname(current);
      if (parent === current) {
        break;
      }
      current = parent;
    }

    // Try to find project config, fall back to preset if not found
    let configPath = findUpwards(projectRoot, 'dependency-cruiser.config.cjs');
    let usingPreset = false;

    if (!configPath) {
      // Calculate preset path relative to this file
      const currentFileDir = dirname(fileURLToPath(import.meta.url));
      const presetPath = path.resolve(
        currentFileDir,
        '../../../configs/dependency-cruiser.preset.cjs'
      );

      if (fs.existsSync(presetPath)) {
        configPath = presetPath;
        usingPreset = true;
      } else {
        return {
          name: 'Architecture (dependency-cruiser)',
          status: 'skipped',
          messages: [
            {
              level: 'info',
              message: 'dependency-cruiser.config.cjs not found. Skipping dependency checks.',
            },
          ],
        } satisfies PluginResult;
      }
    }

    // Skip if no relevant changes and not in full scope
    const changed =
      ctx.scope === 'full' ? true : ctx.changedFiles.some((f) => f.startsWith('src/'));
    if (!changed) {
      return { name: 'Architecture (dependency-cruiser)', status: 'skipped' };
    }
    const args = [
      'exec',
      'dependency-cruiser',
      '--config',
      configPath,
      '--output-type',
      'json',
      path.join(projectRoot, 'src'),
    ];
    const res = await run('pnpm', args, projectRoot);

    const messages: Message[] = [];
    let failed = res.code !== 0;
    let parsed: ParsedViolations | null = null;
    let parseError: unknown;

    try {
      parsed = parseDependencyCruiserOutput(res.stdout);
    } catch (err) {
      parseError = err;
      failed = true;
    }

    if (parsed) {
      messages.push(...buildMessagesFromGroups(parsed.groups));
      if (parsed.hasErrors) {
        failed = true;
      }
    }

    if (parseError) {
      messages.push({
        level: 'error',
        code: 'dependency-cruiser-parse-error',
        message: 'Failed to parse dependency-cruiser JSON output.',
        suggestion:
          'Re-run `pnpm exec dependency-cruiser --config <path> --output-type json` to inspect the raw report.',
      });
      if (res.stdout.trim().length > 0) {
        messages.push({
          level: 'info',
          code: 'dependency-cruiser-output-snippet',
          message: createOutputSnippet(res.stdout),
        });
      }
    }

    if (usingPreset) {
      messages.push({
        level: 'info',
        message: 'Using hex-validator preset (no project config found).',
      });
    }

    const artifacts = parsed
      ? {
          dependencyCruiser: {
            summary: {
              totalViolations: parsed.totalViolations,
              fileCount: parsed.fileCount,
            },
            groups: parsed.groups,
          },
        }
      : undefined;

    // Add legend to stdout if there are violations
    let legendText = '';
    if (parsed && parsed.groups.length > 0) {
      const errorCount = parsed.groups.filter((g) => g.severity === 'error').length;
      const warnCount = parsed.groups.filter((g) => g.severity === 'warn').length;
      const infoCount = parsed.groups.filter((g) => g.severity === 'info').length;
      const totalRules = parsed.groups.length;

      const summaryParts: string[] = [];
      if (errorCount > 0) {
        summaryParts.push(`${errorCount} error${errorCount === 1 ? '' : 's'}`);
      }
      if (warnCount > 0) {
        summaryParts.push(`${warnCount} warning${warnCount === 1 ? '' : 's'}`);
      }
      if (infoCount > 0) {
        summaryParts.push(`${infoCount} info`);
      }

      legendText = [
        '----------------------------------------------------------',
        `${totalRules} rule${totalRules === 1 ? '' : 's'} violated: ${summaryParts.join(', ')}`,
        'LEGEND:',
        '  SEVERITY: rule_code [violations | files]',
        '  Fix: <remediation>',
        '  List: file:line [count]',
        '----------------------------------------------------------',
        '',
      ].join('\n');
    }

    const result: PluginResult = {
      name: 'Architecture (dependency-cruiser)',
      status: failed ? 'fail' : 'pass',
      durationMs: Date.now() - start,
    };

    if (messages.length > 0) {
      result.messages = messages;
    }
    if (legendText) {
      result.stdout = legendText;
    }
    if (artifacts) {
      result.artifacts = artifacts;
    }
    if (res.stderr.trim().length > 0) {
      result.stderr = res.stderr;
    }
    return result;
  },
};
