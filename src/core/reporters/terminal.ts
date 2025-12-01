import type { Message, PluginResult } from '@validator/types';

export type ReporterContext = {
  ci: boolean;
  summaryOnly?: boolean;
  verbose?: boolean;
};

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

function writeRawOutput(result: PluginResult, ctx: ReporterContext) {
  const hasRawOutput = Boolean(result.stdout || result.stderr);
  if (!hasRawOutput) {
    return;
  }

  if (!ctx.verbose) {
    process.stdout.write('Raw tool output hidden. Re-run with --verbose to inspect stdout/stderr.\n');
    return;
  }

  if (result.stdout) {
    process.stdout.write('\nstdout:\n');
    process.stdout.write(`${result.stdout.trim()}\n`);
  }
  if (result.stderr) {
    process.stdout.write('\nstderr:\n');
    process.stdout.write(`${result.stderr.trim()}\n`);
  }
}

export function terminalReporter(results: PluginResult[], ctx: ReporterContext) {
  const failed = results.filter((r) => r.status === 'fail');
  const warned = results.filter((r) => r.status === 'warn');
  const passed = results.filter((r) => r.status === 'pass');
  const skipped = results.filter((r) => r.status === 'skipped');

  process.stdout.write('\nValidation Pipeline Results\n');
  process.stdout.write('===========================\n');
  process.stdout.write(`Tasks:    ${results.length}\n`);
  process.stdout.write(`Passed:   ${passed.length}\n`);
  process.stdout.write(`Skipped:  ${skipped.length}\n`);
  process.stdout.write(`Warnings: ${warned.length}\n`);
  process.stdout.write(`Failed:   ${failed.length}\n`);
  if (ctx.verbose) {
    const totalDuration = results.reduce((sum, result) => sum + (result.durationMs ?? 0), 0);
    process.stdout.write(`Duration: ${totalDuration}ms\n`);
  }

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
    if (ctx.verbose && typeof result.durationMs === 'number') {
      process.stdout.write(`Duration: ${result.durationMs}ms\n`);
    }

    if (!result.messages || result.messages.length === 0) {
      process.stdout.write('No structured diagnostics.\n');
      writeRawOutput(result, ctx);
      continue;
    }

    const groups = groupMessages(result.messages || []);

    for (const [code, msgs] of groups) {
      if (msgs.length === 0) {
        continue;
      }

      const first = msgs[0];
      if (!first) {
        continue;
      }

      const title = code === 'general/no-code' ? first.message : code;
      process.stdout.write(`\n- ${title}\n`);
      if (code !== 'general/no-code') {
        process.stdout.write(`  Message: ${first.message}\n`);
      }

      const fileMap = groupFiles(msgs);
      const totalInstances = msgs.length;
      const totalFiles = fileMap.size;

      process.stdout.write(`  Impact: ${totalInstances} finding${totalInstances === 1 ? '' : 's'}`);
      if (totalFiles > 0) {
        process.stdout.write(` across ${totalFiles} file${totalFiles === 1 ? '' : 's'}`);
      }
      process.stdout.write('\n');

      if (first.suggestion) {
        process.stdout.write(`  Action: ${first.suggestion}\n`);
      }

      if (fileMap.size > 0) {
        process.stdout.write('  Files:\n');
        for (const [file, lines] of fileMap) {
          const sortedLines = [...new Set(lines)].sort((a, b) => a - b);
          const lineStr = sortedLines.length > 0 ? `:${sortedLines.join(', ')}` : '';
          process.stdout.write(`    - ${file}${lineStr}\n`);
        }
      }
    }
    writeRawOutput(result, ctx);
  }
  process.stdout.write('\n');
}
