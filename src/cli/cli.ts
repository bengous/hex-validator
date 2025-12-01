#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runValidation } from '@validator/core/orchestrator';
import { jsonReporter, junitReporter, terminalReporter } from '@validator/core/reporters';
import { nextjsPreset } from '@validator/presets/nextjs';
import type { RunOptions, ValidatorConfig } from '@validator/types';
import { loadUserConfig } from './config-loader';
import { initProject } from './init';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { version: string };

type PresetName = 'nextjs';
type CLIOptions = {
  scope?: 'staged' | 'changed' | 'full';
  e2e?: 'auto' | 'always' | 'off';
  report?: 'summary' | 'json' | 'junit';
  maxWorkers?: number;
  quiet?: boolean;
  verbose?: boolean;
  help?: boolean;
  version?: boolean;
  force?: boolean;
  preset?: PresetName;
  paths?: string;
  cwd?: string;
};

class CliUsageError extends Error {
  readonly exitCode = 2;
}

function parseBooleanFlag(name: string, value: string): boolean {
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new CliUsageError(`${name} expects true or false when a value is provided.`);
}

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const opts: CLIOptions = {};

  for (const a of args) {
    const [k, v] = a.includes('=') ? (a.split('=') as [string, string]) : [a, 'true'];
    if (k === '--scope') {
      if (v === 'staged' || v === 'changed' || v === 'full') {
        opts.scope = v;
      } else {
        throw new CliUsageError(`Invalid --scope value: ${v}`);
      }
    } else if (k === '--e2e') {
      if (v === 'auto' || v === 'always' || v === 'off') {
        opts.e2e = v;
      } else {
        throw new CliUsageError(`Invalid --e2e value: ${v}`);
      }
    } else if (k === '--report') {
      if (v === 'summary' || v === 'json' || v === 'junit') {
        opts.report = v;
      } else {
        throw new CliUsageError(`Invalid --report value: ${v}`);
      }
    } else if (k === '--max-workers') {
      opts.maxWorkers = Number(v);
      if (!Number.isInteger(opts.maxWorkers) || opts.maxWorkers < 1) {
        throw new CliUsageError('--max-workers must be a positive integer.');
      }
    } else if (k === '--quiet') {
      opts.quiet = parseBooleanFlag(k, v);
    } else if (k === '--force') {
      opts.force = parseBooleanFlag(k, v);
    } else if (k === '--verbose') {
      opts.verbose = parseBooleanFlag(k, v);
    } else if (k === '--preset') {
      if (v === 'nextjs') {
        opts.preset = v;
      } else {
        throw new CliUsageError(`Invalid --preset value: ${v}`);
      }
    } else if (k === '--paths') {
      opts.paths = v;
    } else if (k === '--cwd') {
      opts.cwd = v;
    } else if (k === '--help' || k === '-h') {
      opts.help = true;
    } else if (k === '--version' || k === '-v') {
      opts.version = true;
    } else if (k.startsWith('-')) {
      throw new CliUsageError(`Unknown option: ${k}`);
    }
  }

  const first = args.find((a) => !a.startsWith('-')) ?? 'full';
  if (first !== 'fast' && first !== 'full' && first !== 'ci' && first !== 'init') {
    throw new CliUsageError(`Unknown command: ${first}`);
  }
  const cmd = first;

  return { cmd, opts } as const;
}

function buildOptions(mode: 'fast' | 'full' | 'ci', opts: CLIOptions): RunOptions {
  const isCI = mode === 'ci' || Boolean(process.env.CI);
  const result: RunOptions = {
    scope: opts.scope ?? (mode === 'fast' ? 'staged' : 'full'),
    e2e: opts.e2e ?? 'off',
    report: opts.report ?? 'summary',
    maxWorkers: Math.max(1, opts.maxWorkers ?? Math.min(4, Math.max(2, os.cpus().length - 1))),
    ci: isCI,
    quiet: opts.quiet ?? false,
    verbose: opts.verbose ?? false,
  };
  if (opts.paths) {
    result.paths = opts.paths
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
  }
  return result;
}

function printHelp() {
  const lines = [
    'Usage: hex-validate <command> [options]',
    '',
    'Commands:',
    '  fast|full|ci    Run validation pipeline',
    '  init            Scaffold validator.config.ts and lefthook.yml',
    '',
    'Options:',
    '  --help, -h      Show this help message',
    '  --version, -v   Show version number',
    '  --scope=staged|changed|full',
    '  --e2e=auto|always|off',
    '  --report=summary|json|junit',
    '  --max-workers=n',
    '  --quiet',
    '  --verbose       Show plugin durations and raw stdout/stderr',
    '  --paths=file1,dir1,file2  Validate specific files/folders (comma-separated)',
    '  --cwd=path       Run validation in a different directory',
    '  (init) --force   Overwrite files if they exist',
    '  (init) --preset=nextjs',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function main() {
  const { cmd, opts } = parseArgs(process.argv);
  if (opts.help) {
    printHelp();
    return;
  }
  if (opts.version) {
    process.stdout.write(`${pkg.version}\n`);
    return;
  }
  if (cmd === 'init') {
    const initOpts: { cwd: string; force: boolean; preset?: PresetName } = {
      cwd: process.cwd(),
      force: Boolean(opts.force),
    };
    if (opts.preset) {
      initOpts.preset = opts.preset;
    }
    await initProject(initOpts);
    process.exit(0);
    return;
  }
  const mode = cmd === 'fast' ? 'fast' : cmd === 'ci' ? 'ci' : 'full';
  const options = buildOptions(mode, opts);

  const cwd = opts.cwd ? resolve(process.cwd(), opts.cwd) : process.cwd();
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new CliUsageError(`--cwd must point to an existing directory: ${cwd}`);
  }
  options.cwd = cwd;
  let config: ValidatorConfig | null = await loadUserConfig(cwd);
  if (!config) {
    config = nextjsPreset();
  }

  const { ok, results } = await runValidation(config, options);
  if (options.report === 'json') {
    jsonReporter({ ok, results, options, verbose: Boolean(options.verbose) });
  } else if (options.report === 'junit') {
    junitReporter(results);
  } else {
    const reporterCtx: { ci: boolean; summaryOnly?: boolean; verbose?: boolean } = {
      ci: options.ci,
    };
    if (options.quiet !== undefined) {
      reporterCtx.summaryOnly = options.quiet;
    }
    if (options.verbose !== undefined) {
      reporterCtx.verbose = options.verbose;
    }
    terminalReporter(results, reporterCtx);
  }
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  process.stderr.write(`${String(err)}\n`);
  process.exit(err instanceof CliUsageError ? err.exitCode : 1);
});
