import path from 'node:path';
import { compositionPatternsPlugin } from '@validator/plugins/rules/composition-patterns';
import type { PluginContext } from '@validator/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExistsSyncFn, mockReadFileSyncFn, mockFgSync } = vi.hoisted(() => ({
  mockExistsSyncFn: vi.fn<(candidate: string) => boolean>(),
  mockReadFileSyncFn: vi.fn<(file: string, encoding: string) => string>(),
  mockFgSync: vi.fn<(patterns: string[], options: unknown) => string[]>(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSyncFn,
    readFileSync: mockReadFileSyncFn,
  },
  existsSync: mockExistsSyncFn,
  readFileSync: mockReadFileSyncFn,
  readdirSync: vi.fn(),
}));

vi.mock('fast-glob', () => ({
  default: { sync: mockFgSync },
}));

// Mock ts-morph Project
vi.mock('ts-morph', () => ({
  Project: class MockProject {
    getSourceFiles() {
      return [];
    }
  },
  SyntaxKind: {
    NewExpression: 213,
  },
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

describe('compositionPatternsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFgSync.mockReset();
    mockExistsSyncFn.mockReset();
    mockReadFileSyncFn.mockReset();
  });

  function setupFile(relPath: string, content: string) {
    const root = '/project';
    const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
    const absPath = path.join(root, relPath);

    // Pattern-aware mock: only return file if it matches the glob pattern
    mockFgSync.mockImplementation((patterns: string[]) => {
      const isCompositionPattern = patterns.some((p) => p.includes('/composition/'));
      const isInfrastructurePattern = patterns.some((p) => p.includes('/infrastructure/'));
      const isBarrelPattern = patterns.some((p) => p.includes('**/index.ts'));

      if (isCompositionPattern && relPath.includes('/composition/')) {
        return [relPath];
      }
      if (isInfrastructurePattern && relPath.includes('/infrastructure/')) {
        return [relPath];
      }
      if (isBarrelPattern && relPath.endsWith('/index.ts') && relPath.includes('/modules/')) {
        return [relPath];
      }
      return [];
    });

    mockExistsSyncFn.mockImplementation((candidate: string) => {
      if (candidate === workspaceFile) {
        return true;
      }
      if (candidate === absPath) {
        return true;
      }
      return false;
    });
    mockReadFileSyncFn.mockImplementation((file: string) => {
      if (file === absPath) {
        return content;
      }
      throw new Error(`Unexpected read: ${file}`);
    });
  }

  describe('Rule: Factory Naming', () => {
    it('detects non-create factory function names', async () => {
      const content = `import 'server-only';
export function buildUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/factory-naming');
      expect(result.messages?.[0]?.suggestion).toContain('createBuildUserService');
    });

    it('accepts create-prefixed factory functions', async () => {
      const content = `import 'server-only';
export function createUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('accepts async factory functions with create prefix', async () => {
      const content = `import 'server-only';
export async function createUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('only checks composition/factories.ts and composition/index.ts', async () => {
      const content = `import 'server-only';
export function getUserData() {
  return {};
}`;

      setupFile('src/modules/auth/composition/helpers.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Rule: Server-Only Placement', () => {
    it('detects missing server-only import in composition files', async () => {
      const content = `export function createUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/server-only-required');
    });

    it('detects missing server-only import in infrastructure adapters', async () => {
      const content = `export class DrizzleUserRepository {
  constructor() {}
}`;

      mockFgSync.mockReturnValue(['src/modules/auth/infrastructure/adapters/DrizzleUserRepo.ts']);
      const root = '/project';
      const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
      const absPath = path.join(
        root,
        'src/modules/auth/infrastructure/adapters/DrizzleUserRepo.ts'
      );

      mockExistsSyncFn.mockImplementation((candidate: string) => {
        if (candidate === workspaceFile) {
          return true;
        }
        if (candidate === absPath) {
          return true;
        }
        return false;
      });
      mockReadFileSyncFn.mockImplementation((file: string) => {
        if (file === absPath) {
          return content;
        }
        throw new Error(`Unexpected read: ${file}`);
      });

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/server-only-required');
    });

    it('accepts server-only as first import', async () => {
      const content = `import 'server-only';
export function createUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('detects server-only not as first import', async () => {
      const content = `import { UserService } from './domain/UserService';
import 'server-only';
export function createUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/server-only-placement');
    });

    it('allows comments before server-only', async () => {
      const content = `// This is a factory file
// Creates services
import 'server-only';
export function createUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('forbids barrel files (ADR-008: no barrels allowed)', async () => {
      const content = `export { createUserService } from './factories';`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('skips test files', async () => {
      const content = 'export function mockFactory() {}';

      setupFile('src/modules/auth/composition/__tests__/factories.test.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Rule: Server Actions Directive (R1)', () => {
    it('accepts Server Actions with only "use server" (no server-only)', async () => {
      const content = `'use server';
import { db } from '@/db';

export async function createUser(data: FormData) {
  return await db.insert(users).values({ name: data.get('name') });
}`;

      setupFile('src/modules/auth/infrastructure/adapters/actions.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('detects Server Actions with both "use server" and server-only (mixing violation)', async () => {
      const content = `'use server';
import 'server-only';
import { db } from '@/db';

export async function createUser(data: FormData) {
  return await db.insert(users).values({ name: data.get('name') });
}`;

      setupFile('src/modules/auth/infrastructure/adapters/actions.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThanOrEqual(1);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/server-actions');
    });

    it('detects "use server" not as first statement', async () => {
      const content = `import { db } from '@/db';
'use server';

export async function createUser(data: FormData) {
  return await db.insert(users).values({ name: data.get('name') });
}`;

      setupFile('src/modules/auth/infrastructure/adapters/actions.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      // R1 owns all 'use server' diagnostics, so only R1 error (no R2 duplication)
      expect(result.messages?.length).toBe(1);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/server-actions');
    });

    it('allows comments before "use server"', async () => {
      const content = `// Server Actions for user management
// Created: 2024-01-01
'use server';
import { db } from '@/db';

export async function createUser(data: FormData) {
  return await db.insert(users).values({ name: data.get('name') });
}`;

      setupFile('src/modules/auth/infrastructure/adapters/actions.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('accepts double quotes for "use server"', async () => {
      const content = `"use server";
import { db } from '@/db';

export async function createUser(data: FormData) {
  return await db.insert(users).values({ name: data.get('name') });
}`;

      setupFile('src/modules/auth/infrastructure/adapters/actions.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Rule: Pure Server Modules (R2)', () => {
    it('detects pure server modules missing server-only', async () => {
      const content = `import { db } from '@/db';

export class DrizzleUserRepository {
  async findById(id: string) {
    return await db.query.users.findFirst({ where: eq(users.id, id) });
  }
}`;

      setupFile('src/modules/auth/infrastructure/persistence/DrizzleUserRepository.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/server-only-required');
      expect(result.messages?.[0]?.suggestion).toContain('Add "import \'server-only\';"');
    });

    it('accepts file with "use server" as Server Action (not pure server)', async () => {
      const content = `'use server';

export class DrizzleUserRepository {
  async findById(id: string) {
    return await db.query.users.findFirst({ where: eq(users.id, id) });
  }
}`;

      setupFile('src/modules/auth/infrastructure/persistence/DrizzleUserRepository.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      // When 'use server' is first, file is a Server Action (even if unusual for a Repository)
      // This is valid per Next.js - the directive determines the file type
      // If user wants pure server, they should remove 'use server' and add 'server-only'
      expect(result.status).toBe('pass');
    });

    it('accepts pure server module with server-only as first import', async () => {
      const content = `import 'server-only';
import { db } from '@/db';

export class DrizzleUserRepository {
  async findById(id: string) {
    return await db.query.users.findFirst({ where: eq(users.id, id) });
  }
}`;

      setupFile('src/modules/auth/infrastructure/persistence/DrizzleUserRepository.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('forbids barrel files even with server-only (ADR-008)', async () => {
      const content = `import 'server-only';
export { createUserService } from './factories';
export { createAuthService } from './factories';`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });
  });

  describe('Rule: Edge Cases', () => {
    it('handles CRLF line endings', async () => {
      const content = `import 'server-only';\r\nimport { db } from '@/db';\r\n\r\nexport function createService() {\r\n  return {};\r\n}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('handles block comments before directives', async () => {
      const content = `/**
 * User management Server Actions
 * @module auth/actions
 */
'use server';
import { db } from '@/db';

export async function createUser() {}`;

      setupFile('src/modules/auth/infrastructure/adapters/actions.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('handles files with no imports (empty or types-only)', async () => {
      const content = '// Empty composition file';

      setupFile('src/modules/auth/composition/types.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('detects missing semicolon in "use server"', async () => {
      const content = `'use server'
import { db } from '@/db';

export async function createUser() {}`;

      setupFile('src/modules/auth/infrastructure/adapters/actions.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      // Should still be recognized as 'use server' (semicolon optional in JS/TS)
      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Scope filtering', () => {
    it('skips when no relevant files', async () => {
      mockFgSync.mockReturnValue([]);
      mockExistsSyncFn.mockImplementation((candidate: string) => {
        return candidate.includes('pnpm-workspace.yaml');
      });

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('skipped');
    });

    it('respects scope=staged', async () => {
      const ctx = createContext({
        scope: 'staged',
        stagedFiles: ['src/modules/auth/composition/factories.ts'],
      });
      const root = '/project';
      const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
      const absPath = path.join(root, 'src/modules/auth/composition/factories.ts');

      mockFgSync.mockReturnValue([]);
      mockExistsSyncFn.mockImplementation((candidate: string) => {
        if (candidate === workspaceFile) {
          return true;
        }
        if (candidate === absPath) {
          return true;
        }
        return false;
      });
      mockReadFileSyncFn.mockReturnValue('export function buildService() {}');

      const result = await compositionPatternsPlugin.run(ctx);

      expect(result.status).toBe('fail');
      // Should detect both factory-naming and missing-server-only
      expect(result.messages?.length).toBeGreaterThanOrEqual(1);
      const hasFactoryNaming = result.messages?.some(
        (m) => m.code === 'composition/factory-naming'
      );
      expect(hasFactoryNaming).toBe(true);
    });
  });

  describe('Rule: Barrel Policy', () => {
    it('forbids all barrels including client-safe (ADR-008)', async () => {
      const content = `/** @client-safe-barrel */
export type UserRole = 'admin' | 'user';
export const MAX_UPLOAD_SIZE = 1024 * 1024;`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('forbids all barrels regardless of annotations (ADR-008)', async () => {
      const content = `/** @client-safe-barrel */
import 'server-only';
export type UserRole = 'admin' | 'user';`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('forbids barrel files (ADR-008)', async () => {
      const content = `/** @client-safe-barrel */
export { DrizzleUserRepo } from '../infrastructure/persistence/DrizzleUserRepo';
export type UserRole = 'admin' | 'user';`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('forbids barrel files (ADR-008)', async () => {
      const content = `/** @client-safe-barrel */
export { createUserService } from './composition/factories';
export type UserRole = 'admin' | 'user';`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('forbids barrel files in infrastructure/mocks (ADR-008)', async () => {
      const content = `/** @client-safe-barrel */
export { MockAssetRepository } from './MockAssetRepository';
export type UserRole = 'admin' | 'user';`;

      setupFile('src/modules/asset/infrastructure/mocks/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('forbids all barrel files (ADR-008)', async () => {
      const content = `export { createUserService } from './factories';
export { createAuthService } from './factories';`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.level).toBe('error');
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('forbids barrel files even with server-only (ADR-008)', async () => {
      const content = `import 'server-only';
export { createUserService } from './factories';
export { createAuthService } from './factories';`;

      setupFile('src/modules/auth/composition/index.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThan(0);
      expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
    });

    it('only checks index.ts files', async () => {
      const content = `export { createUserService } from './factories';`;

      setupFile('src/modules/auth/composition/helpers.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      // This should fail for missing server-only, but not with barrel-policy code
      expect(result.status).toBe('fail');
      const hasBarrelPolicy =
        result.messages?.some((m) => m.code === 'composition/barrel-policy') ?? false;
      const hasServerOnlyRequired =
        result.messages?.some((m) => m.code === 'composition/server-only-required') ?? false;
      expect(hasBarrelPolicy).toBe(false);
      expect(hasServerOnlyRequired).toBe(true);
    });

    describe('ADR-008: Forbid ALL Barrels', () => {
      it('forbids barrel in core/domain layer', async () => {
        const content = `export { User } from './User';
export { Role } from './Role';`;

        setupFile('src/modules/auth/core/domain/index.ts', content);

        const result = await compositionPatternsPlugin.run(createContext());

        expect(result.status).toBe('fail');
        expect(result.messages?.length).toBeGreaterThan(0);
        expect(result.messages?.[0]?.level).toBe('error');
        expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
      });

      it('forbids barrel in ui layer', async () => {
        const content = `export { LoginForm } from './LoginForm';
export { SignupForm } from './SignupForm';`;

        setupFile('src/modules/auth/ui/index.ts', content);

        const result = await compositionPatternsPlugin.run(createContext());

        expect(result.status).toBe('fail');
        expect(result.messages?.length).toBeGreaterThan(0);
        expect(result.messages?.[0]?.level).toBe('error');
        expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
      });

      it('forbids barrel in application/ports layer', async () => {
        const content = `export type { IUserRepository } from './IUserRepository';
export type { IAuthService } from './IAuthService';`;

        setupFile('src/modules/auth/application/ports/index.ts', content);

        const result = await compositionPatternsPlugin.run(createContext());

        expect(result.status).toBe('fail');
        expect(result.messages?.length).toBeGreaterThan(0);
        expect(result.messages?.[0]?.level).toBe('error');
        expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
      });

      it('forbids even module-root core/index.ts barrels (ADR-008)', async () => {
        const content = `import 'server-only';
export { adaptItemsForGrid } from './helpers';
export type { ItemGridMedia } from './types';`;

        setupFile('src/modules/orders/core/index.ts', content);

        const result = await compositionPatternsPlugin.run(createContext());

        expect(result.status).toBe('fail');
        expect(result.messages?.length).toBeGreaterThan(0);
        expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
      });

      it('forbids composition barrels (ADR-008)', async () => {
        const content = `export { createUserService } from './factories';`;

        setupFile('src/modules/auth/composition/index.ts', content);

        const result = await compositionPatternsPlugin.run(createContext());

        expect(result.status).toBe('fail');
        expect(result.messages?.length).toBeGreaterThan(0);
        expect(result.messages?.[0]?.level).toBe('error');
        expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
      });

      it('forbids composition barrels even with server-only (ADR-008)', async () => {
        const content = `import 'server-only';
export { createUserService } from './factories';`;

        setupFile('src/modules/auth/composition/index.ts', content);

        const result = await compositionPatternsPlugin.run(createContext());

        expect(result.status).toBe('fail');
        expect(result.messages?.length).toBeGreaterThan(0);
        expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
      });

      it('forbids composition barrels even with client-safe annotation (ADR-008)', async () => {
        const content = `/** @client-safe-barrel */
export type { UserService } from './factories';`;

        setupFile('src/modules/auth/composition/index.ts', content);

        const result = await compositionPatternsPlugin.run(createContext());

        expect(result.status).toBe('fail');
        expect(result.messages?.length).toBeGreaterThan(0);
        expect(result.messages?.[0]?.code).toBe('composition/no-barrels');
      });
    });
  });

  describe('Multiple violations', () => {
    it('reports both factory naming and server-only violations', async () => {
      const content = `export function buildUserService() {
  return new UserService();
}`;

      setupFile('src/modules/auth/composition/factories.ts', content);

      const result = await compositionPatternsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.length).toBeGreaterThanOrEqual(2);
      const hasFactoryNaming = result.messages?.some(
        (m) => m.code === 'composition/factory-naming'
      );
      const hasServerOnlyRequired = result.messages?.some(
        (m) => m.code === 'composition/server-only-required'
      );
      expect(hasFactoryNaming).toBe(true);
      expect(hasServerOnlyRequired).toBe(true);
    });
  });
});
