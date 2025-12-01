# Plugins

Plugins return normalized `PluginResult` objects. Public plugin values are available from:

```ts
import { plugins } from 'hex-validator';
```

Direct imports from internal plugin paths are not public API.

| Plugin | Stability | Required in strict preset | Dependencies | Expected scripts |
| :--- | :--- | :--- | :--- | :--- |
| AI Guardrails | experimental | optional | none | none |
| Architecture Fitness (Hexagonal) | stable | optional | none | none |
| AST Audit (domain architecture) | experimental | optional | ts-morph | none |
| Build (next build) | stable | optional | pnpm | `build` when enabled |
| Canonical Module Structure | stable | optional | none | none |
| Composition Patterns | stable | optional | ts-morph | none |
| Contract Test Coverage | stable | optional | none | none |
| DB sanity (drizzle generate) | experimental | optional | drizzle-kit, pnpm | `db:generate` when DB files changed |
| Domain Type Purity | experimental | optional | ts-morph, tsconfig | none |
| Drizzle Patterns | experimental | optional | none | none |
| Entity Patterns (DDD) | experimental | optional | ts-morph | none |
| E2E (playwright) | stable | optional | playwright, pnpm | `test:e2e` or `test:e2e:ci` when enabled |
| Mock Coverage | stable | optional | none | none |
| RSC Boundaries | experimental | optional | none | none |
| Result Monad | experimental | optional | ts-morph | none |
| Security (gitleaks) | stable | optional | official gitleaks binary, pnpm | `security:scan:local` or `security:scan:ci` |
| Server Directives | experimental | optional | none | none |
| TypeScript | stable | optional | typescript | none |
| Unit (vitest) | stable | optional | vitest, pnpm | `test` for full runs |
| Architecture (dependency-cruiser) | stable | required | dependency-cruiser | none |

## Contract

A plugin receives a `PluginContext` and returns:

- `name`
- `status`
- `messages`
- `artifacts`
- optional raw `stdout` / `stderr`

Plugins must respect `ctx.cwd`. They must not fall back to `process.cwd()` for project scanning.

## Tool Execution

External tools run through `src/core/tool-runner.ts`.

The runner resolves a local `node_modules/.bin` first, then falls back to `pnpm exec` only when the
binary is not found. A non-zero tool exit is reported once; it is not retried through another
resolution path. Tool output is capped and commands have a timeout.

Plugins that call package scripts check `package.json#scripts` first and return
`tool/missing-package-script` when the script is absent.
