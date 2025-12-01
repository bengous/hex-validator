import type { Message } from '@validator/types';

type Finding = {
  file: string;
  line?: number;
  level: Message['level'];
  code: string;
  message: string;
  suggestion?: string;
};

type RuleViolation = {
  rule: string;
  severity: 'error' | 'warn' | 'info';
  count: number;
  fileViolations: Map<string, { count: number; lines: number[] }>;
  suggestion?: string;
};

const SEVERITY_ORDER: Record<'error' | 'warn' | 'info', number> = {
  error: 0,
  warn: 1,
  info: 2,
};

/**
 * Aggregate findings by rule code, tracking per-file violation counts
 */
export function aggregateByRule(findings: Finding[]): RuleViolation[] {
  const groupsMap = new Map<
    string,
    {
      rule: string;
      severity: 'error' | 'warn' | 'info';
      count: number;
      fileViolations: Map<string, { count: number; lines: number[] }>;
      suggestion?: string;
    }
  >();

  for (const finding of findings) {
    const key = finding.code;
    if (!groupsMap.has(key)) {
      const newGroup: {
        rule: string;
        severity: 'error' | 'warn' | 'info';
        count: number;
        fileViolations: Map<string, { count: number; lines: number[] }>;
        suggestion?: string;
      } = {
        rule: key,
        severity: finding.level,
        count: 0,
        fileViolations: new Map(),
      };
      if (finding.suggestion) {
        newGroup.suggestion = finding.suggestion;
      }
      groupsMap.set(key, newGroup);
    }

    const group = groupsMap.get(key);
    if (!group) {
      continue;
    }

    if (SEVERITY_ORDER[finding.level] < SEVERITY_ORDER[group.severity]) {
      group.severity = finding.level;
    }

    group.count += 1;

    if (finding.file) {
      const fileKey = finding.line ? `${finding.file}:${finding.line}` : finding.file;
      const existingFileData = group.fileViolations.get(fileKey);
      const currentFileData = existingFileData
        ? existingFileData
        : { count: 0, lines: [] as number[] };
      currentFileData.count += 1;
      if (finding.line) {
        currentFileData.lines.push(finding.line);
      }
      group.fileViolations.set(fileKey, currentFileData);
    }

    if (!group.suggestion && finding.suggestion) {
      group.suggestion = finding.suggestion;
    }
  }

  const violations: RuleViolation[] = [...groupsMap.values()]
    .map((group) => {
      const sortedFileViolations = new Map(
        [...group.fileViolations.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      );
      const violation: RuleViolation = {
        rule: group.rule,
        severity: group.severity,
        count: group.count,
        fileViolations: sortedFileViolations,
      };
      if (group.suggestion) {
        violation.suggestion = group.suggestion;
      }
      return violation;
    })
    .sort((a, b) => {
      const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severityDiff !== 0) {
        return severityDiff;
      }
      return a.rule.localeCompare(b.rule);
    });

  return violations;
}

/**
 * Build canonical format messages from aggregated violations
 */
export function buildCanonicalMessages(violations: RuleViolation[]): Message[] {
  const messages: Message[] = [];

  for (const violation of violations) {
    const fileCount = violation.fileViolations.size;
    const suggestion =
      violation.suggestion ?? `Review the "${violation.rule}" rule for remediation guidance.`;

    const filesList =
      fileCount > 0
        ? [...violation.fileViolations.entries()]
            .map(([file, data]) => {
              return data.count > 1 ? `    - ${file} [${data.count}]` : `    - ${file}`;
            })
            .join('\n')
        : '    (no files recorded)';

    const messageParts = [
      `${violation.rule} [${violation.count} | ${fileCount}]`,
      `  Fix: ${suggestion}`,
      '  List:',
      filesList,
    ];

    messages.push({
      level: violation.severity,
      message: messageParts.join('\n'),
    });
  }

  return messages;
}

/**
 * Create canonical legend for validators
 */
export function createLegend(): string {
  return `----------------------------------------------------------
LEGEND:
  SEVERITY: rule_code [violations | files]
  Fix: <remediation>
  List: file:line [count]
----------------------------------------------------------
`;
}
