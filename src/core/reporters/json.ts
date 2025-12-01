import type { PluginResult } from '@validator/types';

export function jsonReporter(results: PluginResult[]) {
  const out = JSON.stringify({ results }, null, 2);
  process.stdout.write(`${out}\n`);
}
