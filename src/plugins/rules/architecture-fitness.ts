import fs from 'node:fs';
import path from 'node:path';
import type { Message, Plugin, PluginContext, PluginResult } from '@validator/types';
import fg from 'fast-glob';

const FORBIDDEN_TOP_LEVEL = [
  {
    folder: 'server',
    code: 'arch/forbidden-folder-server',
    messageSuffix: 'Use infrastructure/adapters/NextJsActions.ts instead.',
  },
  {
    folder: 'types',
    code: 'arch/forbidden-folder-types',
    messageSuffix: 'Colocate types inside core/domain or application.',
  },
  {
    folder: 'db',
    code: 'arch/forbidden-folder-db',
    messageSuffix: 'Move persistence code under infrastructure/persistence/.',
  },
] as const;

const FORBIDDEN_NESTED = [
  {
    segments: ['core', 'use-cases'] as const,
    code: 'arch/forbidden-folder-core-use-cases',
    messageSuffix: 'Application use cases live in application/use-cases/.',
  },
  {
    segments: ['core', 'adapters'] as const,
    code: 'arch/forbidden-folder-core-adapters',
    messageSuffix: 'Adapters belong to infrastructure/adapters/.',
  },
  {
    segments: ['core', 'rules'] as const,
    code: 'arch/forbidden-folder-core-rules',
    messageSuffix: 'Policies belong in application/policies/.',
  },
] as const;

// Modules that must follow full hexagonal structure (core/application/infrastructure/composition)
// Override this in your validator.config.ts if needed
const CANONICAL_MODULES = new Set(['users', 'orders', 'products']);

type Finding = {
  file: string;
  line?: number;
  level: Message['level'];
  code: string;
  message: string;
  suggestion?: string;
};

function findUpwards(start: string, filename: string): string | null {
  let current = start;
  while (true) {
    const candidate = path.join(current, filename);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function resolveWorkspaceRoot(cwd: string): string {
  const workspace = findUpwards(cwd, 'pnpm-workspace.yaml');
  if (workspace) {
    return path.dirname(workspace);
  }
  const rootPackage = findUpwards(cwd, 'package.json');
  if (rootPackage) {
    return path.dirname(rootPackage);
  }
  return cwd;
}

function getModules(root: string): string[] {
  const modulesDir = path.join(root, 'src', 'modules');
  if (!fs.existsSync(modulesDir)) {
    return [];
  }
  const entries = fs.readdirSync(modulesDir, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

function getTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fg.sync(['**/*.ts', '**/*.tsx'], {
    cwd: dir,
    dot: false,
    ignore: [
      '**/node_modules/**',
      '**/.next/**',
      '**/__tests__/**',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
  });
}

function push(findings: Finding[], data: Finding) {
  findings.push(data);
}

function checkForbiddenFolders(root: string, moduleName: string, findings: Finding[]) {
  const moduleDir = path.join(root, 'src', 'modules', moduleName);

  if (!fs.existsSync(moduleDir)) {
    return;
  }

  for (const entry of FORBIDDEN_TOP_LEVEL) {
    const absolutePath = path.join(moduleDir, entry.folder);
    if (fs.existsSync(absolutePath)) {
      const relPath = ['src', 'modules', moduleName, entry.folder].join('/');
      push(findings, {
        level: 'error',
        file: relPath,
        code: entry.code,
        message: `Module ${moduleName} must not contain ${entry.folder}/ (ADR-002 canonical structure).`,
        suggestion: entry.messageSuffix,
      });
    }
  }

  for (const entry of FORBIDDEN_NESTED) {
    const absolutePath = path.join(moduleDir, ...entry.segments);
    if (fs.existsSync(absolutePath)) {
      const display = entry.segments.join('/');
      const relPath = ['src', 'modules', moduleName, ...entry.segments].join('/');
      push(findings, {
        level: 'error',
        file: relPath,
        code: entry.code,
        message: `Module ${moduleName} must not contain ${display}/ (ADR-002 canonical structure).`,
        suggestion: entry.messageSuffix,
      });
    }
  }
}

/**
 * Check 1: Required folders exist for canonical modules
 */
function checkRequiredFolders(root: string, moduleName: string, findings: Finding[]) {
  const moduleDir = path.join(root, 'src', 'modules', moduleName);
  const requiredFolders = [
    { name: 'core', code: 'arch/missing-core-folder' },
    { name: 'application', code: 'arch/missing-application-folder' },
    { name: 'infrastructure', code: 'arch/missing-infrastructure-folder' },
    { name: 'composition', code: 'arch/missing-composition-folder' },
  ];

  for (const folder of requiredFolders) {
    const folderPath = path.join(moduleDir, folder.name);
    if (!fs.existsSync(folderPath)) {
      push(findings, {
        level: 'error',
        file: `src/modules/${moduleName}`,
        code: folder.code,
        message: `Module ${moduleName} is missing required folder: ${folder.name}/`,
        suggestion: 'Canonical modules must follow hexagonal structure per ADR-002',
      });
    }
  }
}

/**
 * Check 2: Composition exports check
 * REMOVED: composition/index.ts files are no longer allowed (user requirement: zero barrels)
 */
// function checkCompositionExports(root: string, moduleName: string, findings: Finding[]) {
//   const compositionIndex = path.join(root, 'src', 'modules', moduleName, 'composition', 'index.ts');
//
//   if (!fs.existsSync(compositionIndex)) {
//     return; // File shouldn't exist anymore
//   }
//
//   const content = fs.readFileSync(compositionIndex, 'utf8');
//   const relPath = `src/modules/${moduleName}/composition/index.ts`;
//
//   // Check: composition should NOT export Adapter classes
//   if (/export.*Adapter/.test(content)) {
//     push(findings, {
//       level: 'error',
//       file: relPath,
//       code: 'arch/composition-exports-adapter',
//       message: 'composition/index.ts must not export Adapter classes (ADR-001)',
//       suggestion: 'Export only factory functions like createUseCases(), createServices()',
//     });
//   }
//
//   // Check: composition should NOT export Repository classes
//   if (/export.*Repository/.test(content)) {
//     push(findings, {
//       level: 'error',
//       file: relPath,
//       code: 'arch/composition-exports-repository',
//       message: 'composition/index.ts must not export Repository classes (ADR-001)',
//       suggestion: 'Export only factory functions like createUseCases(), createServices()',
//     });
//   }
//
//   // Check: composition MUST export factory functions (names starting with create)
//   if (!/export[\s\S]*create/i.test(content)) {
//     push(findings, {
//       level: 'error',
//       file: relPath,
//       code: 'arch/composition-missing-factories',
//       message: 'composition/index.ts should export factory functions (names starting with create)',
//       suggestion: 'Export only factory functions like createUseCases(), createServices()',
//     });
//   }
// }

/**
 * Check 3: Adapter compliance - adapters should import ports and implement interfaces
 */
function checkAdapterCompliance(root: string, moduleName: string, findings: Finding[]) {
  const adaptersDir = path.join(root, 'src', 'modules', moduleName, 'infrastructure', 'adapters');

  if (!fs.existsSync(adaptersDir)) {
    return;
  }

  const adapterFiles = getTsFiles(adaptersDir);

  // Files to skip (utility adapters, not port implementations)
  const skipFiles = [
    'index.ts',
    'actions.ts',
    'queries.ts',
    'helpers.ts',
    'setup.ts',
  ];

  for (const file of adapterFiles) {
    const fileName = path.basename(file);
    const relPath = `src/modules/${moduleName}/infrastructure/adapters/${file}`;
    const lowerFile = file.toLowerCase();

    // Skip utility adapters (barrel exports, server actions, framework utilities)
    if (skipFiles.includes(fileName)) {
      continue;
    }

    // Skip utility adapters by pattern (case-insensitive includes check)
    // These utility adapters don't implement ports - they're infrastructure helpers
    const isUtilityAdapter =
      lowerFile.includes('validator') ||
      lowerFile.includes('helper') ||
      lowerFile.includes('storage') ||
      lowerFile.includes('processor') ||
      lowerFile.includes('serving') ||
      lowerFile.endsWith('.cli.ts');

    if (isUtilityAdapter) {
      continue;
    }

    const absPath = path.join(adaptersDir, file);
    const content = fs.readFileSync(absPath, 'utf8');

    // Check 1: Adapter should import from application/ports or core/ports
    if (!/from\s+['"].*\/(?:application|core)\/ports/.test(content)) {
      push(findings, {
        level: 'error',
        file: relPath,
        code: 'arch/adapter-missing-port-import',
        message: `Adapter ${fileName} should import port interfaces from application/ports or core/ports`,
        suggestion:
          'Adapters must implement port interfaces per dependency inversion principle (ADR-001)',
      });
    }

    // Check 2: Adapter should implement an interface
    if (!/implements\s+\w+/.test(content)) {
      push(findings, {
        level: 'error',
        file: relPath,
        code: 'arch/adapter-missing-implements',
        message: `Adapter ${fileName} should implement a port interface`,
        suggestion:
          'Adapters must implement port interfaces per dependency inversion principle (ADR-001)',
      });
    }
  }
}

/**
 * Check 4: Composition index exists
 * REMOVED: User explicitly required "Remove all barrels (including boundary) - Consistency over convenience"
 * composition/index.ts files are barrel re-exports and are no longer allowed.
 */
// function checkCompositionIndexExists(root: string, moduleName: string, findings: Finding[]) {
//   const compositionDir = path.join(root, 'src', 'modules', moduleName, 'composition');
//
//   // Early return if composition/ directory doesn't exist
//   // This is already caught by checkRequiredFolders - don't report duplicate finding
//   if (!fs.existsSync(compositionDir)) {
//     return;
//   }
//
//   const compositionIndex = path.join(compositionDir, 'index.ts');
//
//   if (!fs.existsSync(compositionIndex)) {
//     push(findings, {
//       level: 'error',
//       file: `src/modules/${moduleName}/composition`,
//       code: 'arch/missing-composition-index',
//       message: `Module ${moduleName} must have composition/index.ts as public API`,
//       suggestion: 'Create composition/index.ts to export factory functions',
//     });
//   }
// }

/**
 * Main plugin
 */
export const architectureFitnessPlugin: Plugin = {
  name: 'Architecture Fitness (Hexagonal)',

  async run(ctx: PluginContext): Promise<PluginResult> {
    const root = resolveWorkspaceRoot(ctx.cwd);
    const modulesDir = path.join(root, 'src', 'modules');

    if (!fs.existsSync(modulesDir)) {
      return { name: this.name, status: 'skipped' };
    }

    const findings: Finding[] = [];
    const modules = getModules(root);

    let modulesToCheck = modules;

    if (ctx.scope !== 'full') {
      const files = ctx.scope === 'staged' ? ctx.stagedFiles : ctx.changedFiles;
      const touchedModules = new Set<string>();

      for (const file of files) {
        const match = /^src\/modules\/([^/]+)/.exec(file);
        const moduleName = match?.[1];
        if (moduleName) {
          touchedModules.add(moduleName);
        }
      }

      if (touchedModules.size === 0) {
        return { name: this.name, status: 'skipped' };
      }

      modulesToCheck = modules.filter((moduleName) => touchedModules.has(moduleName));

      if (modulesToCheck.length === 0) {
        return { name: this.name, status: 'skipped' };
      }
    }

    for (const moduleName of modulesToCheck) {
      checkForbiddenFolders(root, moduleName, findings);
    }

    const canonicalModulesToCheck = modulesToCheck.filter((moduleName) =>
      CANONICAL_MODULES.has(moduleName)
    );

    for (const moduleName of canonicalModulesToCheck) {
      checkRequiredFolders(root, moduleName, findings);
      // checkCompositionIndexExists(root, moduleName, findings); // REMOVED: No barrels allowed
      // checkCompositionExports(root, moduleName, findings); // REMOVED: No barrels allowed
      checkAdapterCompliance(root, moduleName, findings);
    }

    const hasErrors = findings.some((f) => f.level === 'error');
    const hasWarnings = findings.some((f) => f.level === 'warn');

    return {
      name: this.name,
      status: hasErrors ? 'fail' : hasWarnings ? 'warn' : 'pass',
      messages: findings,
    };
  },
};
