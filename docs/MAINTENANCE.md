# Maintenance

## Required Gates

Run these before publishing or opening a release PR:

```bash
pnpm check
pnpm validate:example
pnpm test:pack
```

## Package API

Keep these imports working:

```ts
import { defineConfig, presets, rulesets, plugins, runValidation } from 'hex-validator';
import { dependencyCruiserPresetPath } from 'hex-validator/configs';
import { validateStructure } from 'hex-validator/validators/structure';
```

When adding a public export, update:

- `package.json` `exports`
- `README.md`
- `scripts/test-pack.ts`

## Rules

Public diagnostic metadata lives in `src/rules/registry.ts`.

When adding or renaming a diagnostic code:

- update the registry;
- update `docs/RULES.md`;
- add or update a fixture/test that emits the code.

## Plugins

Plugins must:

- use `ctx.cwd`;
- execute external tools through `src/core/tool-runner.ts`;
- return structured messages and artifacts where possible;
- avoid rewriting user files from validation commands.

## Example App

`examples/next-hexagonal` is the primary proof for the strict preset. If a rule changes, update the
example or explicitly move the rule out of the strict preset.
