import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { diagnosticRegistry } from '../src/rules/registry';
import { layerRuleSets } from '../src/rulesets';

const docs = readFileSync(join(process.cwd(), 'docs/RULES.md'), 'utf8');
const missing: string[] = [];

const sortedCodes = diagnosticRegistry.map((rule) => rule.code).sort();
const uniqueCodes = new Set(sortedCodes);
if (uniqueCodes.size !== diagnosticRegistry.length) {
  missing.push('duplicate diagnostic registry codes');
}

const sortedRegistry = [...diagnosticRegistry].sort((a, b) => a.code.localeCompare(b.code));
if (JSON.stringify(sortedCodes) !== JSON.stringify(sortedRegistry.map((rule) => rule.code))) {
  missing.push('diagnostic registry is not sorted by code');
}

for (const rule of diagnosticRegistry) {
  if (!docs.includes(`\`${rule.code}\``)) {
    missing.push(`diagnostic code ${rule.code}`);
  }
  const row = `| \`${rule.code}\` | ${rule.severity} | ${rule.layer} | ${rule.stability} | ${
    rule.fixable ? 'yes' : 'no'
  } | ${rule.description} |`;
  if (!docs.includes(row)) {
    missing.push(`diagnostic row ${rule.code}`);
  }
}

for (const ruleset of layerRuleSets) {
  if (!docs.includes(`\`${ruleset.name}\``)) {
    missing.push(`ruleset ${ruleset.name}`);
  }
}

if (missing.length > 0) {
  process.stderr.write(`docs/RULES.md is out of sync:\n${missing.map((item) => `- ${item}`).join('\n')}\n`);
  process.exit(1);
}
