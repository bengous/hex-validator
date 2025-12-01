export { runValidation } from './core/orchestrator';
export * as plugins from './plugins';
export * as presets from './presets';
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
