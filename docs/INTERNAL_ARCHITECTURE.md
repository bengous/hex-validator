# Validator Package Architecture

## Design Principles

### 1. Standalone Package

The validator is architecturally independent from the monorepo:
- Own `biome.json`, `tsconfig.json`, quality rules
- Never inherits from root configuration
- Can be `npm install`ed in any project
- Monorepo placement is for development convenience only

### 2. Peer Dependencies Pattern

Tools (biome, tsc, vitest) are peer dependencies:
- Package stays lightweight (~50KB)
- Consumers control tool versions
- Graceful degradation if tools missing

### 3. Meta-Framework Design

Validator orchestrates but doesn't bundle:
- Unified interface across multiple tools
- Consistent error reporting
- Parallel execution
- Smart caching

## Directory Structure

```
packages/hex-validator/
├── configs/              # Exportable preset configs
│   ├── biome.preset.json
│   ├── tsconfig.preset.json
│   └── recommended.ts
├── scripts/              # Dev convenience scripts
├── src/
│   ├── cli/             # CLI entry point
│   ├── core/            # Orchestrator, caching, tool detection
│   ├── plugins/         # Tool integrations
│   │   ├── linters/     # Biome
│   │   ├── ts/          # TypeScript
│   │   ├── testing/     # Vitest, Playwright
│   │   ├── rules/       # Architecture rules
│   │   └── db/          # Drizzle patterns
│   └── presets/         # Preset pipelines
├── dist/                # Build output (gitignored)
├── biome.json           # Validator's own rules
├── tsconfig.json        # Dev config (includes tests)
└── tsconfig.build.json  # Production build config
```

## Plugin Lifecycle

1. **Detection**: Check if tool is available
2. **Scope**: Determine which files to check
3. **Execution**: Run tool with appropriate args
4. **Parsing**: Parse tool output into standard format
5. **Reporting**: Format results for user

## Tool Detection

Each plugin checks for tool availability:

```typescript
const toolInfo = await getCachedToolInfo('biome', ctx.cwd);

if (!toolInfo.available) {
  return {
    status: 'skipped',
    stdout: 'Tool not found. Install with: pnpm add -D <tool>'
  };
}
```

This ensures graceful degradation instead of crashes.

## Configuration Isolation

### Validator's Own Checks
```bash
cd packages/hex-validator
pnpm lint        # Uses packages/hex-validator/biome.json
pnpm type-check  # Uses packages/hex-validator/tsconfig.json
```

### Root Project Checks
```bash
pnpm lint        # Uses root biome.json, excludes validator
pnpm type-check  # Uses root tsconfig.json, excludes validator
```

### Validator Running On Root Project
```bash
hex-validate fast --scope=staged
# Uses root project configs to validate root code
```

## Publishing

The package is publishable to npm:

```bash
pnpm prepublishOnly  # Runs: check + build
pnpm publish --access public
```

Files included in package:
- `dist/` - Built JavaScript + type definitions
- `configs/` - Preset configurations
- `README.md`, `LICENSE`

Files excluded:
- `src/` - TypeScript source
- `**/*.test.ts` - Test files
- Dev configs (vitest.config.ts, etc.)