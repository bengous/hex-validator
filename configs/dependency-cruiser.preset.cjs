/**
 * hex-validator dependency-cruiser preset
 *
 * Enforces the dependency direction of the strict Next hexagonal layout.
 *
 * Module layers (src/modules/<name>/), inner to outer:
 *
 *   core           pure domain. Imports nothing from any other layer, not even
 *                  types. Cross-module: may import other modules' core/domain only.
 *   application    use cases + ports. Imports core. Never infrastructure,
 *                  composition, boundary, or ui.
 *   infrastructure secondary adapters. Imports core and application/ports only
 *                  (dependency inversion: implements ports, never calls use cases).
 *   composition    DI wiring. Imports core, application, infrastructure.
 *                  Never boundary or ui.
 *   boundary       primary adapters (server actions). Imports composition,
 *                  application, core. Never infrastructure directly, never ui.
 *   ui             module components. Imports boundary and core/domain only.
 *
 * App shell (src/app/, src/components/): imports module boundary and ui.
 * Domain types are allowed as type-only imports.
 *
 * Cross-module contract: application/ports/ and core/domain/ are the only
 * importable surfaces of another module (core is stricter: core/domain only).
 *
 * Folder-placement and code-pattern checks (forbidden folders, factory naming,
 * 'use server' placement, Result usage) are owned by the AST and structure
 * plugins, not by this file. See docs/RULES.md.
 *
 * ⚠️  Backreference syntax: dependency-cruiser uses $1, $2 (NOT \1, \2).
 * `from` captures the module name; `$1` in `to` scopes the rule to the same
 * module. Using \1 makes rules silently match nothing.
 */

const TEST_FILES = ['(^|/)__tests__/', '\\.(test|spec)\\.(ts|tsx)$'];

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // === Hygiene ===
    {
      name: 'no-circular',
      comment: 'No circular dependencies allowed.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-test',
      comment: 'Production code cannot import test files.',
      severity: 'error',
      from: { pathNot: TEST_FILES },
      to: { path: TEST_FILES },
    },
    {
      name: 'mocks-live-in-infrastructure-mocks',
      comment:
        'Mock implementations (Mock*.ts or *.mock.ts) must live in infrastructure/mocks/.',
      severity: 'error',
      from: {
        path: '(Mock[A-Z].*|.*\\.mock)\\.ts$',
        pathNot: '^src/modules/[^/]+/infrastructure/mocks/',
      },
      to: {},
    },

    // === Same-module layer direction (inner layers never import outward) ===
    {
      name: 'core-must-be-pure',
      comment:
        'core/ is pure domain logic. It cannot import application, infrastructure, ' +
        'composition, boundary, or ui within its module — type-only imports included.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/core/' },
      to: {
        path: '^src/modules/$1/(application|infrastructure|composition|boundary|ui)/',
        // No type-only exemption: even type imports violate core purity.
      },
    },
    {
      name: 'application-layer-boundaries',
      comment:
        'application/ (use cases, ports) imports core only. It cannot import ' +
        'infrastructure, composition, boundary, or ui. Test files are exempt so unit ' +
        'and contract tests can use infrastructure/mocks and adapters.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/application/',
        pathNot: TEST_FILES,
      },
      to: {
        path: '^src/modules/$1/(infrastructure|composition|boundary|ui)/',
      },
    },
    {
      name: 'infrastructure-layer-boundaries',
      comment:
        'infrastructure/ implements ports: it imports core and application/ports only. ' +
        'It cannot import use cases, composition, boundary, or ui (dependency inversion).',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/infrastructure/',
        pathNot: TEST_FILES,
      },
      to: {
        path: [
          '^src/modules/$1/(composition|boundary|ui)/',
          '^src/modules/$1/application/(?!ports/)',
        ],
      },
    },
    {
      name: 'composition-layer-boundaries',
      comment:
        'composition/ wires dependencies: it imports core, application, and ' +
        'infrastructure. It cannot import boundary or ui (would invert the direction).',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/composition/' },
      to: { path: '^src/modules/$1/(boundary|ui)/' },
    },
    {
      name: 'boundary-layer-boundaries',
      comment:
        'boundary/ (primary adapters: server actions) reaches implementations through ' +
        'composition factories. It cannot import infrastructure directly, nor ui.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/boundary/',
        pathNot: TEST_FILES,
      },
      to: { path: '^src/modules/$1/(infrastructure|ui)/' },
    },
    {
      name: 'ui-layer-boundaries',
      comment:
        'Module ui/ talks to its module through boundary/ and may use core/domain ' +
        'types. It cannot import application, infrastructure, composition, or core ' +
        'internals outside core/domain.',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/ui/' },
      to: {
        path: [
          '^src/modules/$1/(application|infrastructure|composition)/',
          '^src/modules/$1/core/(?!domain/)',
        ],
      },
    },

    // === App shell (Next.js routes and shared components) ===
    {
      name: 'app-shell-layer-boundaries',
      comment:
        'src/app/ and src/components/ talk to modules through boundary/ (server ' +
        'actions) and ui/. They cannot import application, infrastructure, or ' +
        'composition. Integration tests are exempt.',
      severity: 'error',
      from: {
        path: '^src/(app|components)/',
        pathNot: TEST_FILES,
      },
      to: {
        path: '^src/modules/[^/]+/(application|infrastructure|composition)/',
      },
    },
    {
      name: 'app-shell-domain-types-only',
      comment:
        'src/app/ and src/components/ may use domain shapes as type-only imports. ' +
        'Runtime imports of core code from the app shell bypass the boundary layer.',
      severity: 'error',
      from: {
        path: '^src/(app|components)/',
        pathNot: TEST_FILES,
      },
      to: {
        path: '^src/modules/[^/]+/core/',
        dependencyTypesNot: ['type-only'],
      },
    },
    {
      name: 'no-client-components-to-composition',
      comment:
        'Client components (*-client.tsx) cannot import composition. Pass server ' +
        'actions down as props instead (Next.js server/client boundary).',
      severity: 'error',
      from: { path: '-client\\.tsx$' },
      to: {
        path: '^src/modules/[^/]+/composition/',
        dependencyTypesNot: ['type-only'],
      },
    },

    // === Cross-module contract ===
    {
      name: 'no-cross-module-internals',
      comment:
        "Modules interact through another module's application/ports/ (interfaces) " +
        "and core/domain/ (types) only. Everything else is internal. Core files are " +
        'governed by the stricter core-cross-module-domain-only rule.',
      severity: 'error',
      from: {
        path: '^src/modules/([^/]+)/(?!core/)',
        pathNot: TEST_FILES,
      },
      to: {
        path: '^src/modules/(?!$1)[^/]+/',
        pathNot: [
          '^src/modules/[^/]+/application/ports/',
          '^src/modules/[^/]+/core/domain/',
        ],
      },
    },
    {
      name: 'core-cross-module-domain-only',
      comment:
        "core/ may import other modules' core/domain/ types only — not their ports, " +
        'use cases, or any other layer (keeps domains decoupled from contracts).',
      severity: 'error',
      from: { path: '^src/modules/([^/]+)/core/' },
      to: {
        path: '^src/modules/(?!$1)[^/]+/',
        pathNot: ['^src/modules/[^/]+/core/domain/'],
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
