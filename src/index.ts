export { runValidation } from './core/orchestrator';
export * as plugins from './plugins';
export * as presets from './presets';
export { diagnosticRegistry } from './rules/registry';
export * as rulesets from './rulesets';
export type {
  E2EMode,
  Plugin,
  PluginContext,
  PluginResult,
  Scope,
  StageSpec,
  TaskSpec,
  ValidatorConfig,
} from './types';
export { defineConfig } from './userland/config';
