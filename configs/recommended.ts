import type { ValidatorConfig } from 'hex-validator';
import { plugins } from 'hex-validator';

export const recommendedConfig: ValidatorConfig = {
  reporters: ['terminal'],
  stages: [
    {
      name: 'Code Quality',
      parallel: true,
      failOnWarn: false,
      tasks: [{ plugin: plugins.biomePlugin }, { plugin: plugins.tscPlugin }],
    },
    {
      name: 'Architecture',
      parallel: true,
      failOnWarn: false,
      tasks: [{ plugin: plugins.rscBoundariesPlugin }, { plugin: plugins.depCruiserPlugin }],
    },
    {
      name: 'Tests',
      parallel: false,
      failOnWarn: false,
      tasks: [{ plugin: plugins.vitestPlugin }],
    },
  ],
};
