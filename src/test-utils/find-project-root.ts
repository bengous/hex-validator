import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Find the project root using multiple strategies:
 * 1. Git root (most reliable for git repos)
 * 2. Walk up looking for package.json with workspaces
 * 3. Walk up looking for packages/ directory (monorepo marker)
 */
export function findProjectRoot(startDir: string = __dirname): string {
  try {
    const gitRoot = execSync('git rev-parse --show-toplevel', {
      encoding: 'utf-8',
      cwd: startDir,
      stdio: ['pipe', 'pipe', 'ignore'], // suppress stderr
    }).trim();
    if (gitRoot && fs.existsSync(gitRoot)) {
      return gitRoot;
    }
  } catch {}

  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        if (pkg.workspaces) {
          return currentDir;
        }
      } catch {}
    }

    const packagesDir = path.join(currentDir, 'packages');
    if (fs.existsSync(packagesDir) && fs.statSync(packagesDir).isDirectory()) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error(
    'Could not find project root. Tried: git root, package.json with workspaces, packages/ directory.'
  );
}

let cachedRoot: string | undefined;

export function getProjectRoot(): string {
  if (!cachedRoot) {
    cachedRoot = findProjectRoot();
  }
  return cachedRoot;
}
