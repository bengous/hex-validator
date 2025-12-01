import type { Message, PluginResult } from '@validator/types';

export type ReporterContext = {
  ci: boolean;
  summaryOnly?: boolean;
  verbose?: boolean;
};

// Helper to group messages by code
function groupMessages(messages: Message[]) {
  const groups = new Map<string, Message[]>();
  const noCodeKey = 'general/no-code';

  for (const msg of messages) {
    const key = msg.code ?? noCodeKey;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)?.push(msg);
  }
  return groups;
}

// Helper to group files and lines
function groupFiles(messages: Message[]) {
  const files = new Map<string, number[]>();
  for (const msg of messages) {
    if (!msg.file) {
      continue;
    }
    if (!files.has(msg.file)) {
      files.set(msg.file, []);
    }
    if (typeof msg.line === 'number') {
      files.get(msg.file)?.push(msg.line);
    }
  }
  return files;
}

export function terminalReporter(results: PluginResult[], ctx: ReporterContext) {
  const failed = results.filter((r) => r.status === 'fail');
  const warned = results.filter((r) => r.status === 'warn');
  const passed = results.filter((r) => r.status === 'pass');
  const skipped = results.filter((r) => r.status === 'skipped');

  // 1. Summary
  process.stdout.write('\nValidation Pipeline Results\n');
  process.stdout.write('===========================\n');
  process.stdout.write(`Tasks:    ${results.length}\n`);
  process.stdout.write(`Passed:   ${passed.length}\n`);
  process.stdout.write(`Skipped:  ${skipped.length}\n`);
  process.stdout.write(`Warnings: ${warned.length}\n`);
  process.stdout.write(`Failed:   ${failed.length}\n`);

  if (ctx.summaryOnly) {
    return;
  }

  const reportPlugins = [...failed, ...warned];

  if (reportPlugins.length === 0) {
    return;
  }

  for (const result of reportPlugins) {
    const isFail = result.status === 'fail';
    const label = isFail ? '[FAIL]' : '[WARN]';
    const header = `${label} ${result.name}`;

    process.stdout.write(`\n${header}\n`);
    process.stdout.write(`${'='.repeat(header.length)}\n`);

    // If artifacts or stdout exist but no messages, print them
    if (!result.messages || result.messages.length === 0) {
      if (result.stdout) {
        process.stdout.write(`\n${result.stdout}\n`);
      }
      if (result.stderr) {
        process.stdout.write(`\nstderr:\n${result.stderr}\n`);
      }
      continue;
    }

    const groups = groupMessages(result.messages || []);

    for (const [code, msgs] of groups) {
      if (msgs.length === 0) {
        continue;
      }

      const first = msgs[0];
      if (!first) {
        continue; // Safety check for TS
      }

      // Use the first message as the title, stripping dynamic parts if possible or just using it as is.
      const title = code === 'general/no-code' ? 'General Issue' : first.message;

      process.stdout.write(`\nViolation: ${title}\n`);
      process.stdout.write(`${'-'.repeat(11 + title.length)}\n`); // Violation: title

      if (code !== 'general/no-code') {
        process.stdout.write(`Code:   ${code}\n`);
      }

      const fileMap = groupFiles(msgs);
      const totalInstances = msgs.length;
      const totalFiles = fileMap.size;

      process.stdout.write(`Impact: ${totalInstances} instances across ${totalFiles} files\n`);

      if (first.suggestion) {
        process.stdout.write(`Action: ${first.suggestion}\n`);
      }

      if (fileMap.size > 0) {
        process.stdout.write('\nFiles:\n');
        for (const [file, lines] of fileMap) {
          const sortedLines = [...new Set(lines)].sort((a, b) => a - b);
          const lineStr = sortedLines.length > 0 ? `:${sortedLines.join(', ')}` : '';
          process.stdout.write(`  - ${file}${lineStr}\n`);
        }
      }
    }
  }
  process.stdout.write('\n');
}
