#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, join } from 'node:path';
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

type PresetName = 'nextjs' | 'library' | 'monorepo';
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

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const opts: CLIOptions = {};

  for (const a of args) {
    const [k, v] = a.includes('=') ? (a.split('=') as [string, string]) : [a, 'true'];
    if (k === '--scope') {
      if (v === 'staged' || v === 'changed' || v === 'full') {
        opts.scope = v;
      }
    } else if (k === '--e2e') {
      if (v === 'auto' || v === 'always' || v === 'off') {
        opts.e2e = v;
      }
    } else if (k === '--report') {
      if (v === 'summary' || v === 'json' || v === 'junit') {
        opts.report = v;
      }
    } else if (k === '--max-workers') {
      opts.maxWorkers = Number(v);
    } else if (k === '--quiet') {
      opts.quiet = v !== 'false';
    } else if (k === '--force') {
      opts.force = v !== 'false';
    } else if (k === '--verbose') {
      opts.verbose = v !== 'false';
    } else if (k === '--preset') {
      if (v === 'nextjs' || v === 'library' || v === 'monorepo') {
        opts.preset = v;
      }
    } else if (k === '--paths') {
      opts.paths = v;
    } else if (k === '--cwd') {
      opts.cwd = v;
    } else if (k === '--help' || k === '-h') {
      opts.help = true;
    } else if (k === '--version' || k === '-v') {
      opts.version = true;
    }
  }

  const first = args.find((a) => !a.startsWith('-')) ?? 'full';
  const cmd = (first === 'init' ? 'init' : first) as 'fast' | 'full' | 'ci' | 'init';

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
    '  --verbose       Show detailed plugin durations',
    '  --paths=file1,dir1,file2  Validate specific files/folders (comma-separated)',
    '  --cwd=path       Run validation in a different directory',
    '  (init) --force   Overwrite files if they exist',
    '  (init) --preset=nextjs|library|monorepo',
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

  const cwd = opts.cwd ? join(process.cwd(), opts.cwd) : process.cwd();
  options.cwd = cwd;
  let config: ValidatorConfig | null = await loadUserConfig(cwd);
  if (!config) {
    config = nextjsPreset();
  }

  const { ok, results } = await runValidation(config, options);
  if (options.report === 'json') {
    jsonReporter(results);
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
  process.exit(1);
});
