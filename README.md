# hex-validator

Architecture validator for pnpm-based Next.js TypeScript projects that use a layered hexagonal
structure.

The validator combines dependency-cruiser rules, TypeScript AST checks, structure checks, and
testing coverage checks. Its JSON output is intended to be consumed by coding agents as well as CI.

## Requirements

- Node.js 24+
- pnpm 10+
- TypeScript 5+
- dependency-cruiser 16+

This package is pnpm-first. npm, yarn, and bun consumer workflows are not part of the v1 contract.

## Install

```bash
pnpm add -D hex-validator dependency-cruiser typescript
```

Optional plugins may require additional tools such as Biome, Vitest, Playwright, Drizzle, or
gitleaks depending on the configured rulesets.

## Quick Start

```bash
pnpm exec hex-validate init
pnpm validate
pnpm validate:staged
```

`hex-validate init` is backed by files shipped in the npm tarball under `templates/`.
`hex-validate fast`, `hex-validate full`, and `hex-validate ci` are read-only validation commands.

## Configuration

`hex-validate init` creates a `validator.config.ts` using the strict Next hexagonal preset:

```ts
import { defineConfig, presets } from 'hex-validator';

export default defineConfig(presets.nextHexagonalStrictPreset());
```

The strict preset is assembled from public layer rulesets:

- `core`
- `application`
- `infrastructure`
- `composition`
- `boundary`
- `ui`
- `testing`

## CLI

```bash
hex-validate full --scope=full --report=summary
hex-validate fast --scope=staged --report=summary
hex-validate ci --scope=full --report=json
```

Commands:

- `fast`: default `--scope=staged`.
- `full`: default `--scope=full`.
- `ci`: default `--scope=full` and CI mode.
- `init`: scaffold `validator.config.ts`, `lefthook.yml`, and package scripts.

Options:

- `--scope=staged|changed|full`
- `--e2e=auto|always|off`
- `--report=summary|json|junit`
- `--max-workers=n`
- `--quiet=true|false`
- `--verbose=true|false`
- `--paths=file1,dir1,file2`
- `--cwd=path`
- `--help`, `--version`
- `init --force=true|false`
- `init --preset=nextjs`

Reports:

- `summary`: compact terminal output for humans.
- `json`: structured diagnostics for agents and CI. See `docs/JSON.md`.
- `junit`: CI-compatible XML.

JSON output uses a versioned v1 envelope:

```json
{
  "schemaVersion": 1,
  "ok": true,
  "summary": { "total": 0, "passed": 0, "failed": 0, "warned": 0, "skipped": 0, "durationMs": 0 },
  "runOptions": { "scope": "full", "e2e": "off", "report": "json", "maxWorkers": 4, "ci": false, "quiet": false, "verbose": false },
  "results": []
}
```

Raw `stdout` and `stderr` are excluded unless `--verbose` is set.

## Public API

```ts
import { defineConfig, presets, rulesets, plugins, runValidation } from 'hex-validator';
import { dependencyCruiserPresetPath } from 'hex-validator/configs';
import { validateStructure } from 'hex-validator/validators/structure';
```

Public subpaths:

- `hex-validator`
- `hex-validator/configs`
- `hex-validator/validators/*`

Internal engine modules are not public API.

## Example

The primary product proof lives in `examples/next-hexagonal`.

```bash
pnpm --dir examples/next-hexagonal install --frozen-lockfile
pnpm --dir examples/next-hexagonal typecheck
pnpm validate:example
```

This runs a minimal runnable Next project with `app/layout.tsx`, `app/page.tsx`, React, Next,
`server-only`, a hexagonal users module, a mock, and a contract test.

## Development

```bash
pnpm check
pnpm validate:example
pnpm test:pack
```

`pnpm test:pack` builds the package, creates a tarball, installs it in a temporary pnpm project, and
verifies the documented imports and `hex-validate` binary.

## License

MIT
