import path from 'node:path';
import { architectureFitnessPlugin } from '@validator/plugins/rules/architecture-fitness';
import type { PluginContext } from '@validator/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExistsSyncFn, mockReadFileSyncFn, mockReaddirSyncFn, mockFgSync } = vi.hoisted(() => ({
  mockExistsSyncFn: vi.fn<(path: string) => boolean>(),
  mockReadFileSyncFn: vi.fn<(path: string, encoding: string) => string>(),
  mockReaddirSyncFn: vi.fn<(path: string, options?: unknown) => unknown[]>(),
  mockFgSync: vi.fn<(patterns: string[], options: unknown) => string[]>(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSyncFn,
    readFileSync: mockReadFileSyncFn,
    readdirSync: mockReaddirSyncFn,
  },
  existsSync: mockExistsSyncFn,
  readFileSync: mockReadFileSyncFn,
  readdirSync: mockReaddirSyncFn,
}));

vi.mock('fast-glob', () => ({
  default: { sync: mockFgSync },
}));

function createContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    cwd: '/project',
    ci: false,
    scope: 'full',
    changedFiles: [],
    stagedFiles: [],
    env: process.env,
    config: { stages: [] },
    ...overrides,
  };
}

describe('architectureFitnessPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Required Folders Check', () => {
    it('should pass when all required folders exist', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure', 'adapters')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('should fail when core/ is missing', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return false; // Missing!
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure', 'adapters')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]?.code).toBe('arch/missing-core-folder');
      expect(result.messages?.[0]?.message).toContain('Module users');
    });

    it('should fail when composition/ is missing', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return false; // Missing!
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return false;
        }
        if (p === path.join(usersDir, 'infrastructure', 'adapters')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockFgSync.mockReturnValue([]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('arch/missing-composition-folder');
      expect(result.messages?.[0]?.message).toContain('Module users');
    });

    it('should skip non-canonical modules', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        return false;
      });

      // Non-canonical module
      mockReaddirSyncFn.mockReturnValue([{ name: 'legacy-module', isDirectory: () => true }]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Composition Exports Check', () => {
    it('should pass when composition/index.ts exports only factories', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const compositionIndex = path.join(usersDir, 'composition', 'index.ts');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === compositionIndex) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure', 'adapters')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Adapter Compliance Check', () => {
    it('should pass when adapter imports port and implements interface', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const adaptersDir = path.join(usersDir, 'infrastructure', 'adapters');
      const adapterFile = path.join(adaptersDir, 'DrizzleAssetAdapter.ts');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === adaptersDir) {
          return true;
        }
        if (p === adapterFile) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockImplementation((filePath: string) => {
        if (filePath.includes('composition/index.ts')) {
          return "export { createUseCases } from './factories';";
        }
        if (filePath === adapterFile) {
          return `
import type { IAssetRepository } from '@/modules/users/application/ports/IAssetRepository';

export class DrizzleAssetAdapter implements IAssetRepository {
	// implementation
}
					`;
        }
        return '';
      });
      mockFgSync.mockReturnValue(['DrizzleAssetAdapter.ts']);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('should fail when adapter missing port import', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const adaptersDir = path.join(usersDir, 'infrastructure', 'adapters');
      const adapterFile = path.join(adaptersDir, 'DrizzleAssetAdapter.ts');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === adaptersDir) {
          return true;
        }
        if (p === adapterFile) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockImplementation((filePath: string) => {
        if (filePath.includes('composition/index.ts')) {
          return "export { createUseCases } from './factories';";
        }
        if (filePath === adapterFile) {
          return `
export class DrizzleAssetAdapter implements IAssetRepository {
	// implementation
}
					`;
        }
        return '';
      });
      mockFgSync.mockReturnValue(['DrizzleAssetAdapter.ts']);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('arch/adapter-missing-port-import');
    });

    it('should fail when adapter missing implements clause', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const adaptersDir = path.join(usersDir, 'infrastructure', 'adapters');
      const adapterFile = path.join(adaptersDir, 'DrizzleAssetAdapter.ts');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === adaptersDir) {
          return true;
        }
        if (p === adapterFile) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockImplementation((filePath: string) => {
        if (filePath.includes('composition/index.ts')) {
          return "export { createUseCases } from './factories';";
        }
        if (filePath === adapterFile) {
          return `
import type { IAssetRepository } from '@/modules/users/application/ports/IAssetRepository';

export class DrizzleAssetAdapter {
	// implementation
}
					`;
        }
        return '';
      });
      mockFgSync.mockReturnValue(['DrizzleAssetAdapter.ts']);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('arch/adapter-missing-implements');
    });

    it('should skip utility adapters (actions.ts, queries.ts, helpers.ts)', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const adaptersDir = path.join(usersDir, 'infrastructure', 'adapters');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === adaptersDir) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue(['actions.ts', 'queries.ts', 'helpers.ts']);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('should skip index.ts barrel files', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const adaptersDir = path.join(usersDir, 'infrastructure', 'adapters');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === adaptersDir) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue(['index.ts']);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Composition Index Exists Check', () => {
    it('should pass when composition/index.ts exists', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const compositionIndex = path.join(usersDir, 'composition', 'index.ts');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === compositionIndex) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure', 'adapters')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Forbidden folder checks', () => {
    it('should flag top-level forbidden folders', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === path.join(usersDir, 'server')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.messages?.[0]?.code).toBe('arch/forbidden-folder-server');
      expect(result.messages?.[0]?.message).toContain('Module users');
      expect(result.messages?.[0]?.message).toContain('server/');
    });

    it('should flag nested forbidden folders', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === path.join(usersDir, 'core', 'use-cases')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const result = await architectureFitnessPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('arch/forbidden-folder-core-use-cases');
      expect(result.messages?.[0]?.message).toContain('Module users');
      expect(result.messages?.[0]?.message).toContain('core/use-cases/');
    });

    it('should scope forbidden folder detection to touched modules when staged', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');
      const authDir = path.join(modulesDir, 'auth');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === authDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === path.join(usersDir, 'server')) {
          return true;
        }
        if (p === path.join(authDir, 'server')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([
        { name: 'users', isDirectory: () => true },
        { name: 'auth', isDirectory: () => true },
      ]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const ctx = createContext({
        scope: 'staged',
        stagedFiles: ['src/modules/users/core/domain/Asset.ts'],
      });

      const result = await architectureFitnessPlugin.run(ctx);

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('arch/forbidden-folder-server');
      expect(result.messages?.[0]?.message).toContain('Module users');
      expect(result.messages?.[0]?.message).toContain('server/');
      expect(result.messages?.[0]?.message).not.toContain('Module auth');
    });
  });

  describe('Scope Filtering', () => {
    it('should skip when no module files changed (scope: changed)', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        return false;
      });

      const ctx = createContext({
        scope: 'changed',
        changedFiles: ['src/components/Button.tsx', 'README.md'],
      });

      const result = await architectureFitnessPlugin.run(ctx);

      expect(result.status).toBe('skipped');
    });

    it('should run when module files changed', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure', 'adapters')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const ctx = createContext({
        scope: 'changed',
        changedFiles: ['src/modules/users/core/domain/Asset.ts'],
      });

      const result = await architectureFitnessPlugin.run(ctx);

      expect(result.status).toBe('pass');
    });

    it('should always run on full scope', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const usersDir = path.join(modulesDir, 'users');

      mockExistsSyncFn.mockImplementation((p: string) => {
        if (p.includes('pnpm-workspace.yaml')) {
          return true;
        }
        if (p === modulesDir) {
          return true;
        }
        if (p === usersDir) {
          return true;
        }
        if (p === path.join(usersDir, 'core')) {
          return true;
        }
        if (p === path.join(usersDir, 'application')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition')) {
          return true;
        }
        if (p === path.join(usersDir, 'composition', 'index.ts')) {
          return true;
        }
        if (p === path.join(usersDir, 'infrastructure', 'adapters')) {
          return true;
        }
        return false;
      });

      mockReaddirSyncFn.mockReturnValue([{ name: 'users', isDirectory: () => true }]);
      mockReadFileSyncFn.mockReturnValue("export { createUseCases } from './factories';");
      mockFgSync.mockReturnValue([]);

      const ctx = createContext({
        scope: 'full',
      });

      const result = await architectureFitnessPlugin.run(ctx);

      expect(result.status).toBe('pass');
    });
  });
});
