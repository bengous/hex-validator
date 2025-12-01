# hex-validator

A comprehensive architecture validator for hexagonal (ports & adapters) TypeScript projects. Enforces dependency boundaries, canonical structure, and architectural patterns through static analysis.

## Features

- **36 dependency-cruiser rules** enforcing hexagonal architecture boundaries
- **Multi-tool orchestration** (dependency-cruiser, TypeScript compiler, Biome, Vitest, Playwright)
- **Custom AST validation** for patterns not detectable by import analysis
- **Flexible plugin system** for extending validation rules
- **Multiple output formats** (terminal, JSON, JUnit)
- **Git-aware** staged file detection for pre-commit hooks
- **Zero-config operation** with sensible defaults

## Installation

```bash
npm install --save-dev hex-validator
# or
pnpm add -D hex-validator
# or
yarn add -D hex-validator
```

## Quick Start

```bash
# Initialize configuration files
npx hex-validate init

# Run validation
npx hex-validate full

# Run on staged files only (pre-commit)
npx hex-validate fast --scope=staged
```

## Architecture Rules

hex-validator enforces 36 rules organized into 5 categories:

### 1. Core Purity & Dependency Direction (11 rules)

- Core layer must be pure (no framework dependencies)
- Dependencies flow inward: UI → Boundary → Application → Core
- Infrastructure depends on ports, not use cases
- No circular dependencies

### 2. Hexagonal Architecture Enforcement (10 rules)

- Routes cannot import infrastructure directly
- Use cases must use ports, not infrastructure
- Application ports are pure interfaces
- Infrastructure implements ports
- Composition layer wiring rules

### 3. Canonical Structure (6 rules)

Forbidden folders that violate canonical structure:
- `server/` (use `boundary/actions.ts` instead)
- `db/` (use `infrastructure/persistence/` instead)
- `types/` at module root (colocate with `core/domain/` or `application/`)
- `core/use-cases/` (use `application/use-cases/`)
- `core/adapters/` (use `infrastructure/adapters/`)
- `core/rules/` (use `application/policies/`)

### 4. Enhanced Post-Migration Rules (4 rules)

- Mocks must be in `infrastructure/mocks/` folder
- Client components cannot import composition layer
- No cross-module core type coupling
- Shared components cannot import infrastructure

### 5. Request-Boundary Composition (5 rules)

- UI must import from boundary/actions, not composition
- Composition exports only factory functions
- Use cases instantiated per-request, never at module scope
- Controlled singleton exceptions for technical constraints

## Expected Project Structure

```
src/
├── app/                      # App Router (Next.js) or routes
├── modules/<feature>/        # Feature modules
│   ├── core/                 # Pure domain
│   │   ├── domain/           # Entities, Value Objects
│   │   └── errors/           # Domain errors
│   ├── application/          # Use case orchestration
│   │   ├── ports/            # Interfaces
│   │   ├── use-cases/        # Application logic
│   │   └── policies/         # Business rules
│   ├── infrastructure/       # Adapters
│   │   ├── adapters/         # External services
│   │   ├── persistence/      # Database
│   │   └── mocks/            # Test doubles
│   ├── composition/          # DI wiring (optional)
│   │   └── factories.ts      # Factory functions
│   ├── boundary/             # Primary adapters
│   │   ├── actions.ts        # Server actions
│   │   └── types.ts          # UI DTOs
│   └── ui/                   # React components (optional)
├── components/               # Shared UI components
└── lib/                      # Shared utilities
```

## Configuration

Create `validator.config.ts` in your project root:

```typescript
import { defineConfig } from 'hex-validator';

export default defineConfig({
  plugins: [
    'dep-cruiser',      // Import dependency rules
    'tsc',              // TypeScript compilation
    'biome',            // Linting
    'vitest',           // Unit tests
    'architecture-fitness', // AST rules
    'entity-patterns',  // Entity validation
    'result-monad',     // Error handling patterns
  ],
});
```

## Documentation

- **[Architectural Rules & Guardrails](docs/RULES.md)** - The single source of truth for all architectural rules
- **[Validator Architecture](docs/INTERNAL_ARCHITECTURE.md)** - How the validator itself is built
- **[Maintenance Guide](docs/MAINTENANCE.md)** - For developers working on the validator package
- **[Plugins Reference](docs/PLUGINS.md)** - Detailed documentation of validation plugins

## CLI Commands

```bash
# Full validation (all plugins, all files)
hex-validate full --scope=full --report=summary

# Fast validation (staged files only)
hex-validate fast --scope=staged --report=summary

# CI mode (strict exit codes)
hex-validate ci --scope=full --report=junit

# Initialize project
hex-validate init
```

## Plugin System

hex-validator includes several built-in plugins:

- **dep-cruiser**: Import dependency validation (36 rules)
- **tsc**: TypeScript compilation check
- **biome**: Code linting and formatting
- **vitest**: Unit test execution
- **playwright**: E2E test execution
- **architecture-fitness**: AST-based pattern validation
- **entity-patterns**: Entity/Value Object structure validation
- **result-monad**: Error handling pattern enforcement
- **composition-patterns**: DI pattern validation
- **gitleaks**: Secret detection

## Integration with Git Hooks

Using [lefthook](https://github.com/evilmartians/lefthook):

```yaml
# lefthook.yml
pre-commit:
  commands:
    validator:
      run: npx hex-validate fast --scope=staged --report=summary
```

## Output Formats

- **terminal**: Human-readable colored output (default)
- **json**: Machine-readable JSON for CI integration
- **junit**: JUnit XML format for CI/CD systems
- **summary**: Condensed overview

## Advanced Configuration

### Custom Dependency Rules

Extend the preset in your project's `dependency-cruiser.config.cjs`:

```javascript
const { dependencyCruiserPreset } = require('hex-validator/configs');

module.exports = {
  ...dependencyCruiserPreset,
  forbidden: [
    ...dependencyCruiserPreset.forbidden,
    // Your custom rules
  ],
};
```

### Selective Plugin Execution

```typescript
// validator.config.ts
import { defineConfig } from 'hex-validator';

export default defineConfig({
  plugins: [
    'dep-cruiser',
    { name: 'vitest', enabled: process.env.CI === 'true' },
  ],
});
```

## Framework Support

While the rules are framework-agnostic, hex-validator includes preset configurations for:

- **Next.js** (App Router with Server Actions)
- **Generic TypeScript** projects

## Requirements

- Node.js 18+
- TypeScript 5+
- Optional peer dependencies:
  - `dependency-cruiser` >=16 (for import rules)
  - `@biomejs/biome` >=2 (for linting)
  - `vitest` >=1 (for tests)
  - `playwright` >=1 (for E2E)

## Development

```bash
# Build
pnpm build

# Test
pnpm test

# Lint
pnpm lint

# Type check
pnpm type-check

# Run all checks
pnpm check
```

## License

MIT

## Contributing

Contributions are welcome. Please ensure:

1. All tests pass (`pnpm test`)
2. Code is formatted (`pnpm lint:fix`)
3. TypeScript compiles without errors (`pnpm type-check`)
4. Documentation is updated for new rules or plugins

## Credits

Originally developed for enforcing hexagonal architecture in production TypeScript applications. Extracted and generalized for public use