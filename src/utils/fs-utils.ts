import { existsSync, lstatSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * Find a file by walking up parent directories
 */
export function findUpwards(start: string, filename: string): string | null {
  let current = start;
  while (true) {
    const candidate = path.join(current, filename);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

/**
 * Resolve the workspace root based on pnpm-workspace.yaml or package.json
 */
export function resolveWorkspaceRoot(cwd: string): string {
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

/**
 * Resolve a list of paths (files or directories) to a flat list of files
 */
export async function resolvePathsToFiles(paths: string[], cwd: string): Promise<string[]> {
  const files: string[] = [];
  const visited = new Set<string>();

  function walkDir(dir: string) {
    if (visited.has(dir)) {
      return;
    }
    visited.add(dir);

    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walkDir(fullPath);
        } else if (entry.isFile()) {
          const relativePath = path.relative(cwd, fullPath);
          files.push(relativePath);
        }
      }
    } catch (_err) {}
  }

  for (const p of paths) {
    const fullPath = path.isAbsolute(p) ? p : path.join(cwd, p);

    if (!existsSync(fullPath)) {
      process.stderr.write(`Warning: Path does not exist: ${p}\n`);
      continue;
    }

    const stat = lstatSync(fullPath);
    if (stat.isDirectory()) {
      walkDir(fullPath);
    } else if (stat.isFile()) {
      const relativePath = path.relative(cwd, fullPath);
      files.push(relativePath);
    }
  }

  return [...new Set(files)];
}
