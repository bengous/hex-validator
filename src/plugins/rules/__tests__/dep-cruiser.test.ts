import { depCruiserPlugin } from '@validator/plugins/rules/dep-cruiser';
import { setupToolDetectionMocks } from '@validator/test-utils/mock-tool-detection';
import type { PluginContext } from '@validator/types';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

/**
 * Testing Pattern for Tool-Dependent Plugins
 *
 * This test file demonstrates the standard pattern for testing plugins that use
 * external tools (via getCachedToolInfo). The pattern consists of:
 *
 * 1. **Tool Detection Mocking** (via setupToolDetectionMocks):
 *    - Separates tool detection from plugin business logic
 *    - Tool detection itself is tested in tool-detection.test.ts
 *    - Plugin tests focus on: config parsing, scope handling, message formatting
 *
 * 2. **External Dependencies** (spawn, fs):
 *    - Mock using vi.hoisted() to ensure variables are available during hoisting
 *    - vi.hoisted() creates variables that can be used in vi.mock() factories
 *
 * 3. **Test Structure**:
 *    - Module-level mocks (hoisted to top)
 *    - describe() blocks for logical grouping
 *    - beforeEach() for common setup (tool available, fs configured)
 *    - Individual tests mock the command output (mockSpawnFn.mockReturnValue)
 *
 * For new plugin tests, follow this pattern for consistency and maintainability.
 */

// Create mock functions that can be used in vi.mock factories
// IMPORTANT: Use vi.hoisted() so these are available when vi.mock() is hoisted
const { mockSpawnFn, mockExistsSyncFn } = vi.hoisted(() => ({
  mockSpawnFn: vi.fn(),
  mockExistsSyncFn: vi.fn(),
}));

// Mock tool detection at module level
vi.mock('@validator/core/tool-detection', () => ({
  getCachedToolInfo: vi.fn(),
  detectTool: vi.fn(),
  detectPnpmTool: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: mockSpawnFn,
}));

vi.mock('node:fs', () => ({
  default: {
    existsSync: mockExistsSyncFn,
  },
  existsSync: mockExistsSyncFn,
}));

function createTestContext(overrides: Partial<PluginContext> = {}): PluginContext {
  return {
    cwd: '/test/project',
    ci: false,
    scope: 'full',
    changedFiles: [],
    stagedFiles: [],
    env: process.env,
    config: { stages: [] },
    ...overrides,
  };
}

function createChildProcessMock(
  options: { stdoutData?: string; stderrData?: string; exitCode?: number | null } = {}
) {
  const {
    stdoutData = JSON.stringify({ summary: { violations: [] } }),
    stderrData,
    exitCode = 0,
  } = options;
  return {
    stdout: {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data' && typeof stdoutData === 'string') {
          callback(Buffer.from(stdoutData));
        }
      }),
    },
    stderr: {
      on: vi.fn((event: string, callback: (data: Buffer) => void) => {
        if (event === 'data' && typeof stderrData === 'string') {
          callback(Buffer.from(stderrData));
        }
      }),
    },
    on: vi.fn((event: string, callback: (code: number | null) => void) => {
      if (event === 'close') {
        callback(typeof exitCode === 'undefined' ? 0 : exitCode);
      }
    }),
  };
}

describe('depCruiserPlugin', () => {
  const toolMocks = setupToolDetectionMocks();

  beforeEach(async () => {
    vi.clearAllMocks();

    // Default: tool is available (tests can override)
    await toolMocks.mockToolAvailable('16.0.0');
  });

  describe('tool availability', () => {
    it('should skip when depcruise tool not available', async () => {
      await toolMocks.mockToolUnavailable();

      const ctx = createTestContext();
      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('skipped');
      expect(result.stdout).toContain('dependency-cruiser not found');
      expect(result.stdout).toContain('pnpm add -D dependency-cruiser');
    });
  });

  describe('configuration detection', () => {
    it('should skip when config file not found', async () => {
      mockExistsSyncFn.mockReturnValue(false);

      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('skipped');
      expect(result.messages?.[0]?.message).toContain('dependency-cruiser.config.cjs not found');
    });

    it('should find config file in parent directories', async () => {
      // Project root detection finds /test, then config search finds it there too
      mockExistsSyncFn.mockImplementation((p: string) => {
        const pathStr = String(p);
        // Project root detection: pnpm-workspace.yaml at /test
        if (pathStr.includes('pnpm-workspace.yaml')) {
          return pathStr === '/test/pnpm-workspace.yaml';
        }
        // Config file: not at /test/project, but found at /test
        if (pathStr.includes('dependency-cruiser.config.cjs')) {
          return pathStr === '/test/dependency-cruiser.config.cjs';
        }
        return false;
      });

      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      mockSpawnFn.mockReturnValue(createChildProcessMock());

      const ctx = createTestContext({
        changedFiles: ['src/file.ts'],
      });

      await depCruiserPlugin.run(ctx);

      expect(mockSpawnFn).toHaveBeenCalledWith(
        'pnpm',
        expect.arrayContaining([
          'exec',
          'dependency-cruiser',
          '--config',
          '/test/dependency-cruiser.config.cjs',
        ]),
        expect.any(Object)
      );
    });
  });

  describe('scope handling', () => {
    beforeEach(async () => {
      // Mock fs to find config file
      mockExistsSyncFn.mockReturnValue(true);
      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      // Mock spawn for dep-cruiser command
      const childProcess = await import('node:child_process');
      (childProcess.spawn as Mock) = mockSpawnFn;
    });

    it('should skip when scope is staged and no src/ files changed', async () => {
      const ctx = createTestContext({
        scope: 'staged',
        changedFiles: ['README.md', 'package.json'],
      });

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('skipped');
    });

    it('should run when scope is full', async () => {
      mockSpawnFn.mockReturnValue(createChildProcessMock());

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('pass');
      expect(mockSpawnFn).toHaveBeenCalled();
    });

    it('should run when staged scope includes src/ files', async () => {
      mockSpawnFn.mockReturnValue(createChildProcessMock());

      const ctx = createTestContext({
        scope: 'staged',
        changedFiles: ['src/module.ts', 'README.md'],
      });

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('pass');
      expect(mockSpawnFn).toHaveBeenCalled();
    });
  });

  describe('violation parsing', () => {
    beforeEach(async () => {
      // Mock fs to find config file
      mockExistsSyncFn.mockReturnValue(true);
      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      // Mock spawn for dep-cruiser command
      const childProcess = await import('node:child_process');
      (childProcess.spawn as Mock) = mockSpawnFn;
    });

    it('should parse violations and create error messages', async () => {
      const violationsOutput = JSON.stringify({
        summary: {
          violations: [
            {
              from: 'src/app/page.tsx',
              to: 'src/modules/auth/server/session.ts',
              rule: {
                severity: 'error',
                name: 'no-deep-module-imports',
              },
            },
          ],
        },
      });

      mockSpawnFn.mockReturnValue(
        createChildProcessMock({ stdoutData: violationsOutput, exitCode: 1 })
      );

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toMatchObject({
        level: 'error',
      });
      expect(result.messages?.[0]?.message).toContain('no-deep-module-imports [1 | 1]');
      expect(result.messages?.[0]?.message).toContain('Fix:');
      expect(result.messages?.[0]?.message).toContain('List:');
      expect(result.messages?.[0]?.message).toContain('src/app/page.tsx [1]');
      const artifact = result.artifacts?.dependencyCruiser as {
        summary: { totalViolations: number; fileCount: number };
        groups: Array<{ fileViolations: Map<string, number> }>;
      };
      expect(artifact.summary.totalViolations).toBe(1);
      expect(artifact.summary.fileCount).toBe(1);
      expect(artifact.groups[0]?.fileViolations.has('src/app/page.tsx')).toBe(true);
      expect(artifact.groups[0]?.fileViolations.get('src/app/page.tsx')).toBe(1);
    });

    it('should handle warnings with warn severity', async () => {
      const violationsOutput = JSON.stringify({
        summary: {
          violations: [
            {
              from: 'src/components/MyComponent.tsx',
              to: 'src/modules/auth/ui/hooks/useAuth.ts',
              rule: {
                severity: 'warn',
                name: 'no-deep-module-imports',
              },
            },
          ],
        },
      });

      mockSpawnFn.mockReturnValue(
        createChildProcessMock({ stdoutData: violationsOutput, exitCode: 0 })
      );

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('pass');
      expect(result.messages).toHaveLength(1);
      expect(result.messages?.[0]).toMatchObject({
        level: 'warn',
      });
      expect(result.messages?.[0]?.message).toContain('no-deep-module-imports [1 | 1]');
      expect(result.messages?.[0]?.message).toContain('src/components/MyComponent.tsx [1]');
    });

    it('should handle multiple violations', async () => {
      const violationsOutput = JSON.stringify({
        summary: {
          violations: [
            {
              from: 'src/app/page1.tsx',
              to: 'src/modules/auth/server/session.ts',
              rule: {
                severity: 'error',
                name: 'no-deep-module-imports',
              },
            },
            {
              from: 'src/app/page2.tsx',
              to: 'src/modules/orders/db/schema.ts',
              rule: {
                severity: 'warn',
                name: 'no-deep-module-imports',
              },
            },
            {
              from: 'src/modules/auth/server/index.ts',
              to: 'src/modules/auth/server/session.ts',
              rule: {
                severity: 'error',
                name: 'no-circular',
              },
            },
          ],
        },
      });

      mockSpawnFn.mockReturnValue(
        createChildProcessMock({ stdoutData: violationsOutput, exitCode: 1 })
      );

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('fail');
      expect(result.messages).toHaveLength(2);
      expect(result.messages?.filter((m) => m.level === 'error')).toHaveLength(2);
      expect(
        result.messages?.some((m) => m.level === 'error' && m.message.includes('[2 | 2]'))
      ).toBe(true);
      expect(result.messages?.filter((m) => m.level === 'warn')).toHaveLength(0);
      expect(result.messages?.filter((m) => m.level === 'info')).toHaveLength(0);
    });
  });

  describe('preset fallback', () => {
    beforeEach(async () => {
      // Mock spawn for dep-cruiser command
      const childProcess = await import('node:child_process');
      (childProcess.spawn as Mock) = mockSpawnFn;
    });

    it('should use preset when project config not found', async () => {
      // Mock: project config not found, but preset exists
      // Implementation checks for project root first (pnpm-workspace.yaml, then package.json)
      // Then searches for config file upwards
      mockExistsSyncFn.mockImplementation((p: string) => {
        const pathStr = String(p);
        // Project root detection: pnpm-workspace.yaml at /test/project
        if (pathStr.includes('pnpm-workspace.yaml')) {
          return pathStr === '/test/project/pnpm-workspace.yaml';
        }
        // Config file search: not found at project level, but preset exists
        if (pathStr.includes('dependency-cruiser.config.cjs')) {
          return false;
        }
        // Preset path exists
        if (pathStr.includes('dependency-cruiser.preset.cjs')) {
          return true;
        }
        return false;
      });

      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      mockSpawnFn.mockReturnValue(createChildProcessMock());

      const ctx = createTestContext({
        changedFiles: ['src/file.ts'],
      });

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('pass');
      expect(mockSpawnFn).toHaveBeenCalled();
      const spawnArgs = mockSpawnFn.mock.calls[0]?.[1] as string[];
      const spawnOptions = mockSpawnFn.mock.calls[0]?.[2] as { cwd: string };

      // Assert cwd equals ctx.cwd when using preset
      expect(spawnOptions.cwd).toBe('/test/project');

      // Assert analyzed path is ctx.cwd/src
      const lastArg = spawnArgs[spawnArgs.length - 1];
      expect(lastArg).toBe('/test/project/src');

      expect(spawnArgs).toContain('--config');
      const configIndex = spawnArgs.indexOf('--config');
      const configPath = spawnArgs[configIndex + 1];
      expect(configPath).toContain('dependency-cruiser.preset.cjs');
      const presetInfoMessage = result.messages?.find((m) =>
        m.message.includes('Using hex-validator preset')
      );
      expect(presetInfoMessage).toBeDefined();
    });

    it('should prefer project config over preset', async () => {
      // Mock: project config found immediately
      mockExistsSyncFn.mockReturnValue(true);

      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      mockSpawnFn.mockReturnValue(createChildProcessMock());

      const ctx = createTestContext({
        changedFiles: ['src/file.ts'],
      });

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('pass');
      expect(mockSpawnFn).toHaveBeenCalled();
      const spawnArgs = mockSpawnFn.mock.calls[0]?.[1] as string[];
      expect(spawnArgs).toContain('--config');
      const configIndex = spawnArgs.indexOf('--config');
      const configPath = spawnArgs[configIndex + 1];
      expect(configPath).toContain('/test/project/dependency-cruiser.config.cjs');
      const presetMessage = result.messages?.find((m) =>
        m.message.includes('Using hex-validator preset')
      );
      expect(presetMessage).toBeUndefined();
    });

    it('should skip when neither project config nor preset exists', async () => {
      // Mock: no configs found anywhere
      mockExistsSyncFn.mockReturnValue(false);

      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('skipped');
      expect(result.messages?.[0]?.message).toContain('dependency-cruiser.config.cjs not found');
    });

    it('should indicate preset usage in output', async () => {
      // Mock: preset found
      mockExistsSyncFn.mockImplementation((p: string) => {
        const pathStr = String(p);
        // Project root detection: pnpm-workspace.yaml at /test/project
        if (pathStr.includes('pnpm-workspace.yaml')) {
          return pathStr === '/test/project/pnpm-workspace.yaml';
        }
        // Config file search: not found
        if (pathStr.includes('dependency-cruiser.config.cjs')) {
          return false;
        }
        // Preset exists
        if (pathStr.includes('dependency-cruiser.preset.cjs')) {
          return true;
        }
        return false;
      });

      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      mockSpawnFn.mockReturnValue(createChildProcessMock());

      const ctx = createTestContext({
        changedFiles: ['src/file.ts'],
      });

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('pass');

      // Assert cwd and analyzed path when using preset
      const spawnOptions = mockSpawnFn.mock.calls[0]?.[2] as { cwd: string };
      const spawnArgs = mockSpawnFn.mock.calls[0]?.[1] as string[];

      expect(spawnOptions.cwd).toBe('/test/project');
      const lastArg = spawnArgs[spawnArgs.length - 1];
      expect(lastArg).toBe('/test/project/src');

      expect(
        result.messages?.some((m) =>
          m.message.includes('Using hex-validator preset (no project config found)')
        )
      ).toBe(true);
    });
  });

  describe('preset module import', () => {
    it('should be importable via createRequire and have expected structure', async () => {
      const { createRequire } = await import('node:module');
      const { fileURLToPath } = await import('node:url');
      const { dirname, resolve } = await import('node:path');

      const require = createRequire(import.meta.url);
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);

      // Import the preset directly using relative path
      const presetPath = resolve(__dirname, '../../../../configs/dependency-cruiser.preset.cjs');
      const preset = require(presetPath);

      // Assert it has the expected structure
      expect(preset).toBeDefined();
      expect(preset).toHaveProperty('forbidden');
      expect(preset).toHaveProperty('options');

      // Assert forbidden is an array with rules
      expect(Array.isArray(preset.forbidden)).toBe(true);
      expect(preset.forbidden.length).toBeGreaterThan(0);

      // Assert options is an object
      expect(typeof preset.options).toBe('object');
      expect(preset.options).not.toBeNull();
    });

    it('should be importable via configs/index exports', async () => {
      // Import real fs (not mocked) using dynamic import with a unique variable name
      const fsReal = await import('node:fs/promises');
      const { createRequire } = await import('node:module');
      const { fileURLToPath } = await import('node:url');
      const path = await import('node:path');

      const require = createRequire(import.meta.url);
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // Test file is at: packages/hex-validator/src/plugins/rules/__tests__/dep-cruiser.test.ts
      // Configs is at: packages/hex-validator/configs/index.ts
      // Go up 4 levels: __tests__ -> rules -> plugins -> src -> package root
      const packageRoot = path.resolve(__dirname, '../../../..');
      const configsIndexPath = path.join(packageRoot, 'configs', 'index.ts');

      // Use real fs to check file existence
      let fileExists = false;
      try {
        await fsReal.access(configsIndexPath);
        fileExists = true;
      } catch {
        // File doesn't exist
      }
      expect(fileExists).toBe(true);

      // Read the file content to verify exports are defined
      const configsContent = await fsReal.readFile(configsIndexPath, 'utf-8');
      expect(configsContent).toContain('export const dependencyCruiserPresetPath');
      expect(configsContent).toContain('export const dependencyCruiserPreset');

      // Verify the preset path export resolves correctly
      expect(configsContent).toContain('dependency-cruiser.preset.cjs');

      // Test the actual preset can be loaded via require
      const presetPath = path.join(packageRoot, 'configs', 'dependency-cruiser.preset.cjs');
      const preset = require(presetPath);

      expect(preset).toBeDefined();
      expect(preset).toHaveProperty('forbidden');
      expect(preset).toHaveProperty('options');
    });
  });

  describe('error handling', () => {
    beforeEach(async () => {
      // Mock fs to find config file
      mockExistsSyncFn.mockReturnValue(true);
      const fs = await import('node:fs');
      (fs.existsSync as Mock) = mockExistsSyncFn;

      // Mock spawn for dep-cruiser command
      const childProcess = await import('node:child_process');
      (childProcess.spawn as Mock) = mockSpawnFn;
    });

    it('should handle invalid JSON output gracefully', async () => {
      mockSpawnFn.mockReturnValue(
        createChildProcessMock({
          stdoutData: 'invalid json {',
          stderrData: 'Some error occurred',
          exitCode: 1,
        })
      );

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('fail');
      expect(result.messages?.some((m) => m.code === 'dependency-cruiser-parse-error')).toBe(true);
      expect(result.messages?.some((m) => m.message.includes('First lines'))).toBe(true);
      expect(result.stderr).toContain('Some error occurred');
    });

    it('should handle process spawn failures', async () => {
      mockSpawnFn.mockReturnValue(
        createChildProcessMock({
          stdoutData: JSON.stringify({ summary: { violations: [] } }),
          exitCode: null,
        })
      );

      const ctx = createTestContext();

      const result = await depCruiserPlugin.run(ctx);

      expect(result.status).toBe('fail');
    });
  });
});
