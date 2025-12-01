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
  rscBoundariesPlugin,
  serverDirectivesPlugin,
} from '../plugins';
import type { TaskSpec } from '../types';

export type RuleSetName =
  | 'core'
  | 'application'
  | 'infrastructure'
  | 'composition'
  | 'boundary'
  | 'ui'
  | 'testing';

export type RuleSet = {
  name: RuleSetName;
  tasks: TaskSpec[];
};

export const coreRuleSet: RuleSet = {
  name: 'core',
  tasks: [{ plugin: domainTypesPlugin }, { plugin: astAuditPlugin }, { plugin: entityPatternsPlugin }],
};

export const applicationRuleSet: RuleSet = {
  name: 'application',
  tasks: [{ plugin: architectureFitnessPlugin }],
};

export const infrastructureRuleSet: RuleSet = {
  name: 'infrastructure',
  tasks: [{ plugin: drizzlePatternsPlugin }, { plugin: depCruiserPlugin, required: true }],
};

export const compositionRuleSet: RuleSet = {
  name: 'composition',
  tasks: [
    { plugin: canonicalStructurePlugin },
    { plugin: compositionPatternsPlugin },
    { plugin: serverDirectivesPlugin },
    { plugin: depCruiserPlugin, required: true },
  ],
};

export const boundaryRuleSet: RuleSet = {
  name: 'boundary',
  tasks: [{ plugin: serverDirectivesPlugin }, { plugin: rscBoundariesPlugin }],
};

export const uiRuleSet: RuleSet = {
  name: 'ui',
  tasks: [{ plugin: rscBoundariesPlugin }, { plugin: aiGuardrailsPlugin }],
};

export const testingRuleSet: RuleSet = {
  name: 'testing',
  tasks: [{ plugin: contractTestCoveragePlugin }, { plugin: mockCoveragePlugin }],
};

export const layerRuleSets = [
  coreRuleSet,
  applicationRuleSet,
  infrastructureRuleSet,
  compositionRuleSet,
  boundaryRuleSet,
  uiRuleSet,
  testingRuleSet,
] as const;

export function strictNextHexagonalTasks(): TaskSpec[] {
  const seen = new Set<string>();
  const tasks: TaskSpec[] = [];

  for (const ruleset of layerRuleSets) {
    for (const task of ruleset.tasks) {
      const existing = tasks.find((candidate) => candidate.plugin.name === task.plugin.name);
      if (existing) {
        existing.required = Boolean(existing.required || task.required);
        continue;
      }
      if (!seen.has(task.plugin.name)) {
        seen.add(task.plugin.name);
        tasks.push({ ...task });
      }
    }
  }

  return tasks;
}
