import path from 'node:path';
import { serverDirectivesPlugin } from '@validator/plugins/rules/server-directives';
import type { PluginContext } from '@validator/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockExistsSyncFn, mockReadFileSyncFn, mockFgSync } = vi.hoisted(() => ({
  mockExistsSyncFn: vi.fn<(candidate: string) => boolean>(),
  mockReadFileSyncFn: vi.fn<(file: string) => string>(),
  mockFgSync: vi.fn<(patterns: string[], options: unknown) => string[]>(),
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSyncFn,
    readFileSync: mockReadFileSyncFn,
  },
  existsSync: mockExistsSyncFn,
  readFileSync: mockReadFileSyncFn,
}));

vi.mock('fast-glob', () => ({
  default: { sync: mockFgSync },
}));

function createContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    cwd: '/project/apps/web',
    ci: false,
    scope: 'full',
    changedFiles: [],
    stagedFiles: [],
    env: process.env,
    config: { stages: [] },
    ...overrides,
  };
}

describe('serverDirectivesPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFgSync.mockReset();
    mockExistsSyncFn.mockReset();
    mockReadFileSyncFn.mockReset();
  });

  function setupFile(content: string) {
    const root = '/project';
    const workspaceFile = path.join(root, 'pnpm-workspace.yaml');
    const relPath = 'src/modules/example/server/actions.ts';
    const absPath = path.join(root, relPath);

    mockFgSync.mockReturnValue([relPath]);
    mockExistsSyncFn.mockImplementation((candidate: string) => {
      if (candidate === workspaceFile) {
        return true;
      }
      return candidate === absPath;
    });
    mockReadFileSyncFn.mockImplementation((file: string) => {
      if (file === absPath) {
        return content;
      }
      throw new Error(`Unexpected read: ${file}`);
    });
  }

  it('accepts double-quoted "use server" directives', async () => {
    setupFile('"use server";\nexport const action = () => {};\n');

    const result = await serverDirectivesPlugin.run(createContext());

    expect(result.status).toBe('pass');
    expect(result.messages?.length ?? 0).toBe(0);
  });

  it('accepts single-quoted "use server" directives', async () => {
    setupFile("'use server';\nexport const action = () => {};\n");

    const result = await serverDirectivesPlugin.run(createContext());

    expect(result.status).toBe('pass');
    expect(result.messages?.length ?? 0).toBe(0);
  });
});
