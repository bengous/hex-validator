import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Re-export types for convenience
export type { ValidatorConfig } from 'hex-validator';
export { recommendedConfig } from './recommended';

/**
 * Dependency Cruiser Preset
 *
 * This package includes a comprehensive dependency-cruiser preset with 26 rules
 * enforcing hexagonal architecture, canonical structure, and enhanced patterns.
 *
 * Usage (via path):
 * ```javascript
 * // dependency-cruiser.config.cjs
 * const { dependencyCruiserPresetPath } = require('hex-validator/configs');
 * module.exports = require(dependencyCruiserPresetPath);
 * ```
 *
 * Usage (via config object):
 * ```javascript
 * // dependency-cruiser.config.cjs
 * const { dependencyCruiserPreset } = require('hex-validator/configs');
 * module.exports = dependencyCruiserPreset;
 * ```
 *
 * Usage (extending):
 * ```javascript
 * // dependency-cruiser.config.cjs
 * const { dependencyCruiserPreset } = require('hex-validator/configs');
 * module.exports = {
 *   ...dependencyCruiserPreset,
 *   forbidden: [...dependencyCruiserPreset.forbidden]
 * };
 * ```
 *
 * The dep-cruiser plugin automatically falls back to this preset when no
 * project config is found, enabling zero-config architecture validation.
 */

// Export resolved path to the preset file
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const dependencyCruiserPresetPath = path.resolve(__dirname, 'dependency-cruiser.preset.cjs');

// Export the preset configuration object (requires CJS interop)
const require = createRequire(import.meta.url);
export const dependencyCruiserPreset = require('./dependency-cruiser.preset.cjs');
