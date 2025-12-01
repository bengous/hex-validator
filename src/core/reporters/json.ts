import type { PluginResult, RunOptions } from '@validator/types';

export type JsonReporterInput = {
  ok: boolean;
  results: PluginResult[];
  options: RunOptions;
  verbose?: boolean;
};

function serializeResult(result: PluginResult, verbose: boolean) {
  const serialized: Record<string, unknown> = {
    name: result.name,
    status: result.status,
  };
  if (result.stage) {
    serialized.stage = result.stage;
  }
  if (typeof result.durationMs === 'number') {
    serialized.durationMs = result.durationMs;
  }
  if (result.messages) {
    serialized.messages = result.messages;
  }
  if (result.artifacts) {
    serialized.artifacts = result.artifacts;
  }
  if (verbose && (result.stdout || result.stderr)) {
    serialized.rawOutput = {
      ...(result.stdout ? { stdout: result.stdout } : {}),
      ...(result.stderr ? { stderr: result.stderr } : {}),
    };
  }
  return serialized;
}

export function jsonReporter(input: JsonReporterInput) {
  const { ok, options, results, verbose = false } = input;
  const summary = {
    total: results.length,
    passed: results.filter((r) => r.status === 'pass').length,
    failed: results.filter((r) => r.status === 'fail').length,
    warned: results.filter((r) => r.status === 'warn').length,
    skipped: results.filter((r) => r.status === 'skipped').length,
    durationMs: results.reduce((total, result) => total + (result.durationMs ?? 0), 0),
  };
  const out = JSON.stringify(
    {
      schemaVersion: 1,
      ok,
      summary,
      runOptions: {
        scope: options.scope,
        e2e: options.e2e,
        report: options.report,
        maxWorkers: options.maxWorkers,
        ci: options.ci,
        quiet: Boolean(options.quiet),
        verbose,
        ...(options.paths ? { paths: options.paths } : {}),
        ...(options.cwd ? { cwd: options.cwd } : {}),
      },
      results: results.map((result) => serializeResult(result, verbose)),
    },
    null,
    2
  );
  process.stdout.write(`${out}\n`);
}
