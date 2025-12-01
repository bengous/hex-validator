import {
  aiGuardrailsPlugin,
  architectureFitnessPlugin,
  astAuditPlugin,
  canonicalStructurePlugin,
  compositionPatternsPlugin,
  contractTestCoveragePlugin,
  depCruiserPlugin,
  domainTypesPlugin,
  drizzlePatternsPlugin,
  entityPatternsPlugin,
  mockCoveragePlugin,
  resultMonadPlugin,
  rscBoundariesPlugin,
  serverDirectivesPlugin,
} from '@validator/plugins';
import type { ValidatorConfig } from '@validator/types';

export function nextjsPreset(): ValidatorConfig {
  return {
    reporters: ['terminal'],
    stages: [
      {
        name: 'Architecture Checks',
        parallel: true,
        failOnWarn: false,
        tasks: [
          { plugin: rscBoundariesPlugin },
          { plugin: astAuditPlugin },
          { plugin: depCruiserPlugin },
          { plugin: serverDirectivesPlugin },
          { plugin: domainTypesPlugin },
          { plugin: drizzlePatternsPlugin },
          { plugin: architectureFitnessPlugin },
          { plugin: canonicalStructurePlugin },
          { plugin: contractTestCoveragePlugin },
          { plugin: mockCoveragePlugin },
          { plugin: resultMonadPlugin },
          { plugin: entityPatternsPlugin },
          { plugin: compositionPatternsPlugin },
          { plugin: aiGuardrailsPlugin },
        ],
      },
    ],
  };
}
