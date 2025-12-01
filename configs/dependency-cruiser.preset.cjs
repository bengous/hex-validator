/**
 * dependency-cruiser configuration
 *
 * Total Rules: 36
 * - Core purity & dependency direction: 11 rules
 * - Hexagonal architecture enforcement: 10 rules
 * - Canonical structure (forbidden folders): 6 rules
 * - Enhanced post-migration rules: 4 rules
 * - Request-boundary composition (ADR-007): 5 rules (includes boundary-uses-composition)
 *
 * Coverage:
 * - Hexagonal architecture: 100% (dependency structure)
 * - Canonical structure: 100% (forbidden folders)
 * - Client/server boundary: 90% (with naming convention)
 * - Layer boundaries: 95% (comprehensive direction enforcement)
 * - Violation detection: ~85% (up from ~75% pre-enhancement)
 *
 * ⚠️  CRITICAL: Backreference Syntax
 * ================================
 * Dependency-cruiser uses $1, $2, $3 for backreferences (NOT \1, \2, \3)
 *
 * Example:
 *   from: { path: '^src/modules/([^/]+)/infrastructure/' }  // Captures module name
 *   to:   { path: '^src/modules/$1/application/' }          // $1 = captured module name
 *
 * This ensures rules apply WITHIN the same module (e.g., auth/infrastructure → auth/application)
 * Using \1 will cause rules to silently fail and report false "OK" status.
 *
 * See: packages/hex-validator/MAINTENANCE.md (Troubleshooting section)
 * See: docs/architecture/validator-enhancement-spec.md
 * Issue: #216 - Validator Enhancement (40% gap closure)
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'No circular dependencies allowed',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-server-in-ui',
      comment: 'UI components cannot import server-side code',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/ui/' },
      to: {
        path: '^src/modules/[^/]+/server/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'no-ui-in-server',
      comment: 'Server code cannot import UI components',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/server/' },
      to: { path: '^src/modules/[^/]+/ui/' },
    },
    {
      name: 'core-must-be-pure',
      comment:
        'core/ must be pure domain logic (ADR-002). Cannot import from application/, infrastructure/, composition/, ui/ within same module, even type-only imports.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/core/' },
      to: {
        path: '^src/modules/$1/(application|infrastructure|composition|ui)/',
        // No dependencyTypesNot exception - even type imports violate core purity
      },
    },
    {
      name: 'types-are-leaves',
      comment: 'types/ should not depend on server/ui/core directories within the same module.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/types/' },
      to: { path: '^src/modules/[^/]+/(server|ui|core)/' },
    },

    // === COMPREHENSIVE LAYER BOUNDARY RULES (ADR-005) ===
    {
      name: 'ui-layer-boundaries',
      comment:
        'UI layer (app/, components/) can only import from boundary/ and shared utilities. Cannot import from composition, infrastructure, application, or core layers directly.',
      severity: 'error',
      from: { path: '^src/(app|components)/' },
      to: {
        path: '^src/modules/[^/]+/(composition|infrastructure|application|core)/',
        pathNot: [
          // Allow imports from boundary layer
          '^src/modules/[^/]+/boundary/',
          // Allow type-only imports from views/schemas (data structures)
          '^src/modules/[^/]+/infrastructure/persistence/(views|schema)',
        ],
      },
    },
    {
      name: 'boundary-layer-boundaries',
      severity: 'warn',
      from: {
        path: '^src/modules/([^/]+)/boundary/',
      },
      to: {
        path: [
          // Forbidden: infrastructure implementations (except via composition)
          '^src/modules/$1/infrastructure/',
        ],
        pathNot: [
          // Allowed: composition factories (preferred)
          '^src/modules/$1/composition',
          // Allowed: Effect Layers (Effect.ts architecture)
          '^src/modules/$1/infrastructure/layers/',
          // Allowed: application layer (use cases, errors, queries) - ADR-011
          '^src/modules/$1/application',
          // Allowed: core/domain (types, errors, pure functions) - ADR-011
          '^src/modules/$1/core/domain',
          // Allowed: shared utilities
          '^src/(lib|types|hooks|i18n)',
          // Allowed: cross-module boundary/types
          '^src/modules/[^/]+/boundary/types',
          // Pragmatic exception: DB views/schemas for queries
          '^src/modules/$1/infrastructure/persistence/(views|schema)\\.ts$',
        ],
      },
      comment:
        'Boundary layer (primary adapter) can import: composition (preferred), application (use cases/errors), core/domain (types/errors/pure functions) per ADR-011. Cannot import: infrastructure implementations (use composition or DI). Pragmatic exception: DB views/schemas for queries.',
    },
    {
      name: 'composition-layer-boundaries',
      comment:
        'Composition layer can import from application, infrastructure, and core (DI wiring). Cannot import from boundary (circular dependency).',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/composition/' },
      to: { path: '^src/modules/$1/boundary/' },
    },
    {
      name: 'application-layer-boundaries',
      comment:
        'Application layer can only import from core and ports (same or cross-module). Cannot import from infrastructure, composition, or boundary. Tests and mocks are exempt.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/application/',
        pathNot: [
          // Exclude test files (need to import mocks)
          '__tests__/.*\\.test\\.ts$',
          '.*\\.test\\.ts$',
          '.*\\.spec\\.ts$',
        ],
      },
      to: {
        path: [
          '^src/modules/$1/(infrastructure|composition|boundary)/',
          // Cross-module: only allow ports
          '^src/modules/(?!$1)[^/]+/(?!application/ports)',
        ],
        pathNot: [
          // Allow imports of mocks for testing
          '^src/modules/[^/]+/infrastructure/mocks/',
        ],
      },
    },
    {
      name: 'infrastructure-layer-boundaries',
      comment:
        'Infrastructure layer can import from application/ports and core. Cannot import from application/use-cases, composition, or boundary.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/infrastructure/' },
      to: {
        path: ['^src/modules/$1/(composition|boundary)/', '^src/modules/$1/application/(?!ports)'],
      },
    },

    {
      name: 'no-cross-module-internals',
      comment:
        "Modules cannot import other modules' internal implementation layers (ADR-002). " +
        'ALLOWED: (1) Port interfaces (application/ports/), (2) Core domain types (core/domain/), ' +
        '(3) External facades (composition/external.ts), (4) Relations files (ADR-009), ' +
        '(5) Schema/view imports for queries (performance optimization).',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/(composition|ui|core|infrastructure|application)/',
        pathNot: [
          // Test files can import schemas for fixtures
          '\\.(test|spec|integration\\.test)\\.ts$',
        ],
      },
      to: {
        path: '^src/modules/(?!$1)[^/]+/(composition|ui|core|infrastructure|application)/',
        pathNot: [
          // Allow barrel imports (legacy pattern, not recommended per ADR-008)
          '^src/modules/([^/]+)/(composition|ui|core|infrastructure|application)/index\\.ts$',
          '^src/modules/([^/]+)/(composition|ui|core|infrastructure|application)$',

          // Cross-module architectural patterns (legitimate exceptions):

          // 1. Port interfaces (dependency inversion, hexagonal architecture)
          '^src/modules/[^/]+/application/ports/',

          // 2. Core domain (pure types/enums/value objects, ADR-002)
          '^src/modules/[^/]+/core/domain/',

          // 3. External facades (public API for cross-module use, ADR-009)
          '^src/modules/[^/]+/composition/external\\.ts$',

          // 4. Relations files (Drizzle query building, ADR-009 exception)
          '^src/modules/[^/]+/infrastructure/persistence/relations\\.ts$',

          // 5. Schema files (query functions, JOIN operations, view composition)
          '^src/modules/[^/]+/infrastructure/persistence/schema\\.ts$',

          // 6. View schemas (boundary layer type definitions, read-only)
          '^src/modules/[^/]+/infrastructure/persistence/views(\\.ts)?$',
        ],
      },
    },
    {
      name: 'not-to-test',
      comment: 'Production code cannot import test files',
      severity: 'error',
      from: { pathNot: '\\.(test|spec)\\.(ts|tsx)$' },
      to: { path: '\\.(test|spec)\\.(ts|tsx)$' },
    },

    // =========================================================================
    // Hexagonal Architecture Rules (ADR-001: Hexagonal Everywhere)
    //
    // CRITICAL SEVERITY:
    // - These rules prevent architectural violations that cost us 25+ hours
    //   to fix across Agents 1-9 (Issue #210 migration)
    // - Upgraded from 'warn' to 'error' after migration completion
    // - DO NOT downgrade severity without ADR approval
    //
    // See: docs/architecture/validator-enhancement-plan.md
    // =========================================================================

    {
      name: 'no-routes-to-infrastructure',
      comment:
        'Routes cannot import infrastructure adapters directly (ADR-001). Import from boundary/actions instead. EXCEPTION: infrastructure access inside integration tests.',
      severity: 'error',
      from: {
        path: '^src/app/',
        pathNot: [
          // Exception: Integration tests can import infrastructure for testing
          '\\.integration\\.test\\.ts$',
        ],
      },
      to: {
        path: '^src/modules/[^/]+/infrastructure/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-routes-to-adapters',
      comment:
        'Routes cannot import adapters directly (ADR-001). Use boundary/actions instead.',
      severity: 'error',
      from: { path: '^src/app/' },
      to: {
        path: '^src/modules/[^/]+/infrastructure/adapters/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-routes-to-repositories',
      comment:
        'Routes cannot import repositories directly (ADR-001). Use use cases from composition layer instead.',
      severity: 'error',
      from: { path: '^src/app/' },
      to: {
        path: '^src/modules/[^/]+/infrastructure/repositories/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'composition-imports-allowed',
      comment: 'Routes should import from composition layer (use cases only per ADR-001).',
      severity: 'info',
      from: { path: '^src/app/' },
      to: {
        path: '^src/modules/[^/]+/composition/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'hexagonal-dependency-direction',
      comment:
        'Hexagonal architecture: infrastructure cannot import from composition (wrong direction). ' +
        'EXCEPTION: Boundary layer (primary adapters) imports from composition for per-request dependency wiring (ADR-007). ' +
        'Repositories and persistence layers should NOT import from composition.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/infrastructure/',
        pathNot: [
          // Exception: Tests
          '\\.(test|spec)\\.ts$',
        ],
      },
      to: { path: '^src/modules/$1/composition/' },
    },

    {
      name: 'boundary-uses-composition',
      severity: 'info',
      comment:
        'Boundary layer (primary adapters: server actions) may import from composition for dependency injection. ' +
        'This is the canonical pattern for request-scoped dependency wiring per ADR-007.',
      from: { path: '^src/modules/([^/]+)/boundary/' },
      to: { path: '^src/modules/$1/composition/' },
    },

    {
      name: 'application-ports-are-pure',
      comment:
        'Application ports cannot import infrastructure (dependency inversion principle, ADR-002)',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/application/ports/',
        pathNot: '\\.(test|spec)\\.(ts|tsx)$', // Exclude test files - contract tests need infrastructure imports
      },
      to: {
        path: '^src/modules/$1/infrastructure/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'use-cases-use-ports-only',
      comment:
        'Use cases cannot import infrastructure directly (must use ports, ADR-002). ' +
        'EXCEPTION: Test files can import mocks from infrastructure/mocks.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/application/use-cases/',
        pathNot: [
          // Allow test files to import mocks
          '__tests__/.*\\.test\\.ts$',
          '__tests__/.*\\.test\\.tsx$',
          '__tests__/.*\\.spec\\.ts$',
          '__tests__/.*\\.spec\\.tsx$',
          '.*\\.test\\.ts$',
          '.*\\.test\\.tsx$',
          '.*\\.spec\\.ts$',
          '.*\\.spec\\.tsx$',
        ],
      },
      to: {
        path: '^src/modules/$1/infrastructure/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'infrastructure-depends-on-ports-only',
      comment:
        'Infrastructure adapters can import domain and ports, but not application use-cases (dependency inversion, ADR-001)',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/infrastructure/' },
      to: {
        path: '^src/modules/$1/application/(use-cases|policies)/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-core-to-infrastructure',
      comment:
        'Core cannot import from infrastructure layer (dependency direction violation, ADR-002)',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/core/' },
      to: {
        path: '^src/modules/$1/infrastructure/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-core-to-composition',
      comment:
        'Core cannot import from composition layer (dependency direction violation, ADR-002)',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/core/' },
      to: {
        path: '^src/modules/$1/composition/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-application-to-infrastructure',
      comment:
        'Application cannot import from infrastructure (must use ports, ADR-002). ' +
        'EXCEPTION: Test files can import mocks from infrastructure/mocks/. ' +
        'Rationale: Unit tests need direct access to mock implementations for isolated testing. ' +
        'This is a pragmatic exception - tests are not production code.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/application/',
        pathNot: [
          // Allow contract tests to import infrastructure for LSP compliance testing
          '__tests__/.*\\.contract\\.test\\.ts$',
          // Allow all test files to import mocks from infrastructure/mocks
          '__tests__/.*\\.test\\.ts$',
          '__tests__/.*\\.test\\.tsx$',
          '__tests__/.*\\.spec\\.ts$',
          '__tests__/.*\\.spec\\.tsx$',
          '.*\\.test\\.ts$',
          '.*\\.test\\.tsx$',
          '.*\\.spec\\.ts$',
          '.*\\.spec\\.tsx$',
        ],
      },
      to: {
        path: '^src/modules/$1/infrastructure/',
      },
    },

    {
      name: 'no-application-to-composition',
      comment:
        'Application cannot import from composition layer (dependency direction violation, ADR-002)',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/application/' },
      to: {
        path: '^src/modules/$1/composition/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-ui-to-infrastructure',
      comment: 'UI components cannot import infrastructure directly (use composition)',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/ui/' },
      to: {
        path: '^src/modules/[^/]+/infrastructure/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-app-to-infrastructure',
      comment:
        'App routes/components cannot import infrastructure directly (use boundary/ for primary adapters, composition for use cases, or domain types)',
      severity: 'error',
      from: {
        path: '^src/app/',
        pathNot: [
          // Exempt integration tests
          '\\.integration\\.test\\.ts$',
        ],
      },
      to: {
        path: '^src/modules/[^/]+/infrastructure/',
        // Allow type-only imports (read-path optimization: database views/schema types)
        dependencyTypesNot: ['type-only'],
      },
    },

    // =========================================================================
    // Canonical Structure Enforcement (ADR-002)
    // =========================================================================

    {
      name: 'no-server-folder',
      comment:
        'Modules must NOT have server/ folder (ADR-002). Use infrastructure/adapters/NextJsActions.ts instead.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/server/' },
      to: {},
    },

    {
      name: 'no-db-folder',
      comment:
        'Modules must NOT have db/ folder (ADR-002). Use infrastructure/persistence/ instead.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/db/' },
      to: {},
    },

    {
      name: 'no-types-folder',
      comment:
        'Modules must NOT have types/ folder (ADR-002). Colocate types with core/domain/ or application/.',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/types/' },
      to: {},
    },

    {
      name: 'no-core-use-cases',
      comment: 'Use-cases must be in application/use-cases/, not core/use-cases/ (ADR-002).',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/core/use-cases/' },
      to: {},
    },

    {
      name: 'no-core-adapters',
      comment: 'Adapters must be in infrastructure/adapters/, not core/adapters/ (ADR-002).',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/core/adapters/' },
      to: {},
    },

    {
      name: 'no-core-rules',
      comment: 'Rules/policies must be in application/policies/, not core/rules/ (ADR-002).',
      severity: 'error',
      from: { path: '^src/modules/[^/]+/core/rules/' },
      to: {},
    },

    // =========================================================================
    // Enhanced Architecture Rules (Post-Migration Enforcement)
    // =========================================================================

    {
      name: 'mocks-only-in-infrastructure-mocks',
      comment:
        'Mock implementations (Mock*.ts or *.mock.ts files) must be in infrastructure/mocks/ folder (ADR-002). Prevents mocks from being placed in adapters/ or core/. Supports both naming conventions.',
      severity: 'error',
      from: {
        path: '(Mock[A-Z].*|.*\\.mock)\\.ts$',
        pathNot: '^src/modules/[^/]+/infrastructure/mocks/',
      },
      to: {},
    },

    {
      name: 'no-client-components-to-composition',
      comment:
        'Client components (files ending in -client.tsx) cannot import from composition layer. Pass server actions as props instead (Next.js 15 pattern).',
      severity: 'error',
      from: { path: '-client\\.tsx$' },
      to: {
        path: '^src/modules/[^/]+/composition/',
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'no-cross-module-core-type-coupling',
      comment:
        "Core domain should not import from other modules' infrastructure (even types). Prevents tight coupling between modules. Cross-module dependencies should go through composition layer.",
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/core/' },
      to: {
        path: '^src/modules/(?!$1)[^/]+/infrastructure/',
      },
    },

    {
      name: 'no-components-to-infrastructure',
      comment:
        'Shared UI components (src/components/) cannot import infrastructure directly. Must use composition layer. Prevents tight coupling and enables component reusability.',
      severity: 'warn',
      from: { path: '^src/components/' },
      to: {
        path: '^src/modules/[^/]+/infrastructure/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // Removed: application-uses-ports-not-infrastructure (duplicate of use-cases-use-ports-only)
    // Removed: persistence-in-infrastructure (redundant - already covered by no-db-folder rule)

    // =========================================================================
    // Request-Boundary Composition Rules (ADR-007)
    // =========================================================================

    {
      name: 'no-ui-to-composition',
      severity: 'error',
      comment:
        'UI layer must import from boundary/actions (server actions), not composition. ' +
        'Exception: Factory functions (e.g., createAuthService) for dependency injection are allowed. ' +
        'Composition happens per-request inside server actions.',
      from: {
        path: '^src/app/',
      },
      to: {
        path: '^src/modules/[^/]+/composition',
        // Allow type-only imports and imports of factory functions
        // Real check happens in composition-exports-factories-only rule
        dependencyTypesNot: ['type-only'],
      },
    },

    {
      name: 'composition-exports-factories-only',
      severity: 'info',
      comment:
        'Composition layer must only export factory functions (names starting with "create" or matching "register*Handlers"). ' +
        'Pre-composed operations (functions that execute logic) belong in boundary/actions.ts. ' +
        'Examples: ✅ createAuthService, createUseCases, registerAssetHandlers | ❌ getSession, listUsers. ' +
        'NOTE: This rule is enforced via AST validation (Composition Patterns task), not dependency-cruiser. ' +
        'Downgraded to INFO since dependency-cruiser cannot validate export names (see ADR-007).',
      from: {},
      to: {
        path: '^src/modules/[^/]+/composition',
        // This rule is enforced via AST validation, not dependency-cruiser
        // Placeholder for documentation purposes
      },
    },

    {
      name: 'no-module-scope-composition',
      severity: 'error',
      comment:
        'Use cases must be instantiated per-request inside server actions, never at module scope. ' +
        'Module-scope instantiation causes state leakage between requests and prevents per-request caching. ' +
        'Pattern: Call create*UseCase() inside function body, not at top level.',
      from: {
        path: '^src/app/',
      },
      to: {
        path: '^src/modules/[^/]+/composition',
        // This rule is best enforced via code review and AST validation
        // Dependency-cruiser can detect imports but not instantiation patterns
      },
    },

    {
      name: 'composition-singleton-exception',
      severity: 'info',
      comment:
        'Controlled singletons allowed ONLY for justified technical constraints. ' +
        'Requirements: (1) Document justification in file header, (2) Mark with import server-only, ' +
        '(3) Provide reset*ForTesting() function, (4) Routes call get*() per-request.',
      from: {
        path: '^src/app/',
      },
      to: {
        path: '^src/modules/[^/]+/infrastructure/adapters/.*Server\\.ts$',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    includeOnly: { path: '^src' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: './tsconfig.json' },
    reporterOptions: {
      dot: {
        theme: {
          graph: { rankdir: 'TD', splines: 'ortho' },
        },
      },
    },
  },
};
