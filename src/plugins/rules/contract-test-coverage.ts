import type { Message, Plugin, PluginResult } from '@validator/types';
import { validateContractTests } from '../../validators/contract-tests';

const PLUGIN_NAME = 'Contract Test Coverage';

function formatCoverage(covered: number, total: number): string {
  if (total === 0) {
    return 'No ports discovered in src/modules.';
  }

  const percentage = Math.round((covered / total) * 100);
  return `Coverage: ${covered}/${total} ports (${percentage}%).`;
}

export const contractTestCoveragePlugin: Plugin = {
  name: PLUGIN_NAME,
  async run(): Promise<PluginResult> {
    const { missing, total, covered } = await validateContractTests();

    const messages: Message[] = [
      {
        level: 'info',
        code: 'contracts/summary',
        message: formatCoverage(covered, total),
      },
    ];

    for (const { port, expectedTest } of missing) {
      messages.push({
        level: 'warn',
        code: 'contracts/missing',
        message: `Missing contract test for ${port} (expected ${expectedTest}).`,
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
