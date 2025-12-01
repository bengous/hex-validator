import path from 'node:path';
import { aiGuardrailsPlugin } from '@validator/plugins/rules/ai-guardrails';
import type { PluginContext } from '@validator/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExistsSyncFn, mockReadFileSyncFn, mockReaddirSyncFn, mockFgSync } = vi.hoisted(() => ({
  mockExistsSyncFn: vi.fn<(candidate: string) => boolean>(),
  mockReadFileSyncFn: vi.fn<(file: string, encoding: string) => string>(),
  mockReaddirSyncFn: vi.fn<(dir: string, options: unknown) => unknown[]>(),
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

describe('aiGuardrailsPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFgSync.mockReset();
    mockExistsSyncFn.mockReset();
    mockReadFileSyncFn.mockReset();
    mockReaddirSyncFn.mockReset();
  });

  function setupFile(relPath: string, content: string) {
    const root = '/project';
    const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
    const absPath = path.join(root, relPath);

    mockFgSync.mockReturnValue([relPath]);
    mockExistsSyncFn.mockImplementation((candidate: string) => {
      if (candidate === workspaceFile) {
        return true;
      }
      if (candidate === absPath) {
        return true;
      }
      // For module README check
      if (candidate === path.join(root, 'src', 'modules')) {
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
    mockReaddirSyncFn.mockReturnValue([]);
  }

  describe('Rule 23: Emoji Detection', () => {
    it('detects emoji in source code', async () => {
      setupFile('src/components/Button.tsx', 'export const Button = () => <div>🚀 Click</div>;');

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toMatchObject({
        level: 'error',
        code: 'ai/emoji-in-code',
        message: expect.stringContaining('Emoji detected'),
      });
    });

    it('passes when no emojis present', async () => {
      setupFile('src/components/Button.tsx', 'export const Button = () => <div>Click</div>;');

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('detects various emoji types', async () => {
      setupFile('src/utils/helper.ts', 'const msg = "Hello ✨ World";');

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.[0]?.code).toBe('ai/emoji-in-code');
    });
  });

  describe('Rule 24: Mock Placement', () => {
    it('detects mock file in core layer', async () => {
      setupFile('src/modules/auth/core/MockAuthService.ts', 'export class MockAuthService {}');

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toMatchObject({
        level: 'error',
        code: 'ai/mock-in-core',
        message: expect.stringContaining('Mock files must not exist in core/'),
      });
    });

    it('detects mock file outside infrastructure/mocks/', async () => {
      setupFile('src/modules/auth/application/MockAuthRepo.ts', 'export class MockAuthRepo {}');

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toMatchObject({
        level: 'error',
        code: 'ai/mock-placement',
        message: expect.stringContaining('Mock files must be placed in infrastructure/mocks/'),
      });
    });

    it('accepts mock file in infrastructure/mocks/', async () => {
      setupFile(
        'src/modules/auth/infrastructure/mocks/MockAuthService.ts',
        'export class MockAuthService {}'
      );

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });

    it('detects .mock.ts files in wrong location', async () => {
      setupFile('src/modules/auth/core/auth.mock.ts', 'export const mockAuth = {};');

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('fail');
      expect(result.messages?.[0]?.code).toBe('ai/mock-in-core');
    });

    it('ignores non-mock files', async () => {
      setupFile('src/modules/auth/core/AuthService.ts', 'export class AuthService {}');

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('pass');
      expect(result.messages?.length ?? 0).toBe(0);
    });
  });

  describe('Rule 25: Proactive README Detection', () => {
    it('detects module README.md', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const authDir = path.join(modulesDir, 'auth');
      const readmePath = path.join(authDir, 'README.md');
      const workspaceFile = path.join(root, 'pnpm-workspace.yaml');

      mockFgSync.mockReturnValue(['src/modules/auth/core/AuthService.ts']);
      mockExistsSyncFn.mockImplementation((candidate: string) => {
        if (candidate === workspaceFile) {
          return true;
        }
        if (candidate === modulesDir) {
          return true;
        }
        if (candidate === readmePath) {
          return true;
        }
        if (candidate === path.join(root, 'src/modules/auth/core/AuthService.ts')) {
          return true;
        }
        return false;
      });
      mockReadFileSyncFn.mockReturnValue('export class AuthService {}');
      mockReaddirSyncFn.mockImplementation((dir: string) => {
        if (dir === modulesDir) {
          return [{ name: 'auth', isDirectory: () => true }];
        }
        return [];
      });

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('warn');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toMatchObject({
        level: 'warn',
        code: 'ai/proactive-readme',
        file: 'src/modules/auth/README.md',
        message: expect.stringContaining('Module README.md detected'),
      });
    });

    it('passes when no module READMEs exist', async () => {
      const root = '/project';
      const modulesDir = path.join(root, 'src', 'modules');
      const workspaceFile = path.join(root, 'pnpm-workspace.yaml');

      mockFgSync.mockReturnValue(['src/modules/auth/core/AuthService.ts']);
      mockExistsSyncFn.mockImplementation((candidate: string) => {
        if (candidate === workspaceFile) {
          return true;
        }
        if (candidate === modulesDir) {
          return true;
        }
        if (candidate === path.join(root, 'src/modules/auth/core/AuthService.ts')) {
          return true;
        }
        return false;
      });
      mockReadFileSyncFn.mockReturnValue('export class AuthService {}');
      mockReaddirSyncFn.mockImplementation((dir: string) => {
        if (dir === modulesDir) {
          return [{ name: 'auth', isDirectory: () => true }];
        }
        return [];
      });

      const result = await aiGuardrailsPlugin.run(createContext());

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

      const result = await aiGuardrailsPlugin.run(createContext());

      expect(result.status).toBe('skipped');
    });

    it('respects scope=staged', async () => {
      const ctx = createContext({ scope: 'staged', stagedFiles: ['src/components/Button.tsx'] });
      const root = '/project';
      const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
      const absPath = path.join(root, 'src/components/Button.tsx');

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
      mockReadFileSyncFn.mockReturnValue('export const Button = () => <div>🚀</div>;');
      mockReaddirSyncFn.mockReturnValue([]);

      const result = await aiGuardrailsPlugin.run(ctx);

      expect(result.status).toBe('fail');
      expect(result.messages?.[0]?.code).toBe('ai/emoji-in-code');
    });
  });
});
