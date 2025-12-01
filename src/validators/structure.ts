import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

/**
 * Validate that all modules follow ADR-002 Canonical Module Structure
 *
 * This catches Agent 1 violations (missing mandatory folders)
 *
 * Issue: #210 - Hexagonal Architecture Migration
 */

const REQUIRED_FOLDERS = [
  'core/domain',
  'application/ports',
  'application/use-cases',
  'infrastructure/adapters',
  'infrastructure/persistence',
  'infrastructure/mocks',
  'composition',
] as const;

const OPTIONAL_FOLDERS = ['core/errors', 'application/policies', 'ui'] as const;

type ValidationResult = {
  errors: string[];
  warnings: string[];
  modulesChecked: number;
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

export async function validateStructure(cwd = process.cwd()): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const workspaceRoot = resolveWorkspaceRoot(cwd);
  const moduleDirs = fg.sync('src/modules/*', {
    cwd: workspaceRoot,
    absolute: true,
    onlyDirectories: true,
  });

  if (moduleDirs.length === 0) {
    errors.push('No modules found in src/modules/');
    return { errors, warnings, modulesChecked: 0 };
  }

  for (const moduleDir of moduleDirs) {
    const moduleName = path.basename(moduleDir);

    // Skip if not a directory
    if (!fs.statSync(moduleDir).isDirectory()) {
      continue;
    }

    // Check required folders
    for (const folder of REQUIRED_FOLDERS) {
      const folderPath = path.join(moduleDir, folder);
      if (!fs.existsSync(folderPath)) {
        errors.push(`[ERROR] Module "${moduleName}" missing mandatory folder: ${folder} (ADR-002)`);
      }
    }

    // Check optional folders (warnings only)
    for (const folder of OPTIONAL_FOLDERS) {
      const folderPath = path.join(moduleDir, folder);
      if (!fs.existsSync(folderPath)) {
        warnings.push(`[WARN] Module "${moduleName}" missing optional folder: ${folder}`);
      }
    }
  }

  return {
    errors,
    warnings,
    modulesChecked: moduleDirs.length,
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  validateStructure().then(({ errors, warnings }) => {
    if (errors.length > 0) {
      for (const error of errors) {
        console.error(error);
      }
    }

    if (warnings.length > 0) {
      for (const warning of warnings) {
        console.log(warning);
      }
    }

    if (errors.length === 0) {
      process.exit(0);
    }
    process.exit(1);
  });
}
