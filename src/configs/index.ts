import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type { ValidatorConfig } from '../types';
export { recommendedConfig } from './recommended';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const dependencyCruiserPresetPath = path.resolve(
  __dirname,
  '../../configs/dependency-cruiser.preset.cjs'
);

const require = createRequire(import.meta.url);
export const dependencyCruiserPreset = require(dependencyCruiserPresetPath);
