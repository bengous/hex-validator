import { jsonReporter } from '@validator/core/reporters/json';
import type { PluginResult, RunOptions } from '@validator/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

const options: RunOptions = {
  scope: 'full',
  ci: true,
  maxWorkers: 2,
  report: 'json',
  e2e: 'off',
  cwd: '/repo',
};

describe('jsonReporter', () => {
  beforeEach(() => {
    writeSpy.mockClear();
  });

  afterEach(() => {
    writeSpy.mockClear();
  });

  function outputFor(results: PluginResult[], verbose = false) {
    jsonReporter({ ok: !results.some((r) => r.status === 'fail'), results, options, verbose });
    return JSON.parse(String(writeSpy.mock.calls.at(-1)?.[0]).trim()) as Record<string, unknown>;
  }

  it('emits the versioned v1 envelope with summary and run options', () => {
    const parsed = outputFor([
      { name: 'A', status: 'pass', durationMs: 5 },
      { name: 'B', status: 'fail', stage: 'checks', messages: [{ level: 'error', message: 'x' }] },
    ]);

    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.ok).toBe(false);
    expect(parsed.summary).toMatchObject({ total: 2, passed: 1, failed: 1 });
    expect(parsed.runOptions).toMatchObject({ scope: 'full', e2e: 'off', report: 'json' });
    expect(parsed.results).toEqual([
      { name: 'A', status: 'pass', durationMs: 5 },
      {
        name: 'B',
        status: 'fail',
        stage: 'checks',
        messages: [{ level: 'error', message: 'x' }],
      },
    ]);
  });

  it('hides raw stdout and stderr unless verbose is enabled', () => {
    const nonVerbose = outputFor([{ name: 'A', status: 'fail', stdout: 'secret', stderr: 'raw' }]);
    expect(JSON.stringify(nonVerbose)).not.toContain('secret');
    expect(JSON.stringify(nonVerbose)).not.toContain('raw');

    const verbose = outputFor([{ name: 'A', status: 'fail', stdout: 'secret', stderr: 'raw' }], true);
    expect(JSON.stringify(verbose)).toContain('rawOutput');
    expect(JSON.stringify(verbose)).toContain('secret');
    expect(JSON.stringify(verbose)).toContain('raw');
  });
});
