import type { PluginResult } from '@validator/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terminalReporter } from './terminal';

const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

function getOutput() {
  return writeSpy.mock.calls.map((call) => call[0]).join('');
}

describe('terminalReporter', () => {
  afterEach(() => {
    writeSpy.mockClear();
  });

  it('hides raw stdout and stderr unless verbose is enabled', () => {
    const results: PluginResult[] = [
      {
        name: 'Tool',
        status: 'fail',
        stdout: 'raw stdout payload',
        stderr: 'raw stderr payload',
      },
    ];

    terminalReporter(results, { ci: false, verbose: false });

    const output = getOutput();
    expect(output).toContain('Raw tool output hidden');
    expect(output).not.toContain('raw stdout payload');
    expect(output).not.toContain('raw stderr payload');
  });

  it('prints raw stdout and stderr when verbose is enabled', () => {
    const results: PluginResult[] = [
      {
        name: 'Tool',
        status: 'fail',
        stdout: 'raw stdout payload',
        stderr: 'raw stderr payload',
        durationMs: 12,
      },
    ];

    terminalReporter(results, { ci: false, verbose: true });

    const output = getOutput();
    expect(output).toContain('Duration: 12ms');
    expect(output).toContain('stdout:');
    expect(output).toContain('raw stdout payload');
    expect(output).toContain('stderr:');
    expect(output).toContain('raw stderr payload');
  });

  it('groups structured diagnostics into actionable summaries', () => {
    const results: PluginResult[] = [
      {
        name: 'Architecture',
        status: 'fail',
        messages: [
          {
            level: 'error',
            code: 'arch/missing-core-folder',
            message: 'Module is missing a core folder.',
            suggestion: 'Create src/modules/users/core/.',
            file: 'src/modules/users',
            line: 1,
          },
        ],
      },
    ];

    terminalReporter(results, { ci: false });

    const output = getOutput();
    expect(output).toContain('- arch/missing-core-folder');
    expect(output).toContain('Message: Module is missing a core folder.');
    expect(output).toContain('Action: Create src/modules/users/core/.');
    expect(output).toContain('src/modules/users:1');
  });
});
