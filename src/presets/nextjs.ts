import { strictNextHexagonalTasks } from '@validator/rulesets';
import type { ValidatorConfig } from '@validator/types';

export function nextHexagonalStrictPreset(): ValidatorConfig {
  return {
    reporters: ['terminal'],
    stages: [
      {
        name: 'Architecture Checks',
        parallel: true,
        failOnWarn: false,
        tasks: strictNextHexagonalTasks(),
      },
    ],
  };
}

export const nextjsPreset = nextHexagonalStrictPreset;
