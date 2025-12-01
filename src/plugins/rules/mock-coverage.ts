import type { Message, Plugin, PluginResult } from '@validator/types';
import { validateMocks } from '../../validators/mocks';

const PLUGIN_NAME = 'Mock Coverage';

function formatCoverage(covered: number, total: number): string {
  if (total === 0) {
    return 'No ports discovered in src/modules.';
  }

  const percentage = Math.round((covered / total) * 100);
  return `Coverage: ${covered}/${total} ports (${percentage}%).`;
}

export const mockCoveragePlugin: Plugin = {
  name: PLUGIN_NAME,
  async run(): Promise<PluginResult> {
    const { missing, total, covered } = await validateMocks();

    const messages: Message[] = [
      {
        level: 'info',
        code: 'mocks/summary',
        message: formatCoverage(covered, total),
      },
    ];

    for (const { port, expectedMock } of missing) {
      messages.push({
        level: 'warn',
        code: 'mocks/missing',
        message: `Missing mock for ${port} (expected ${expectedMock}).`,
      });
    }

    const status: PluginResult['status'] = missing.length > 0 ? 'warn' : 'pass';

    return {
      name: PLUGIN_NAME,
      status,
      messages,
      artifacts: {
        totalPorts: total,
        coveredPorts: covered,
        missingPorts: missing.length,
      },
    };
  },
};
