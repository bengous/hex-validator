import { spawn } from 'node:child_process';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';
import { detectPnpmTool, detectTool, getCachedToolInfo } from '../tool-detection';

vi.mock('node:child_process');

describe('tool-detection', () => {
  let mockSpawn: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSpawn = vi.mocked(spawn);
  });

  describe('detectTool', () => {
    it('should detect available tool and parse version', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('biome 2.2.4\n'));
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('biome', ['--version'], '/test/cwd');

      expect(result).toEqual({
        available: true,
        version: '2.2.4',
        path: 'biome',
      });

      expect(mockSpawn).toHaveBeenCalledWith('biome --version', {
        cwd: '/test/cwd',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        timeout: 5000,
      });
    });

    it('should handle tool not found (non-zero exit code)', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(127); // Command not found
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('nonexistent-tool');

      expect(result).toEqual({
        available: false,
      });
    });

    it('should handle spawn error', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (error?: Error) => void) => {
          if (event === 'error') {
            callback(new Error('ENOENT'));
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('bad-tool');

      expect(result).toEqual({
        available: false,
      });
    });

    it('should parse version from various formats', async () => {
      const testCases = [
        { output: 'v1.2.3', expected: '1.2.3' },
        { output: 'tool version 4.5.6', expected: '4.5.6' },
        { output: '7.8.9-beta', expected: '7.8.9' },
        { output: 'no version here', expected: undefined },
      ];

      for (const { output, expected } of testCases) {
        const mockProcess = {
          stdout: {
            on: vi.fn((event: string, callback: (data: Buffer) => void) => {
              if (event === 'data') {
                callback(Buffer.from(output));
              }
            }),
          },
          on: vi.fn((event: string, callback: (code: number) => void) => {
            if (event === 'close') {
              callback(0);
            }
          }),
        };

        mockSpawn.mockReturnValue(mockProcess as never);

        const result = await detectTool('tool');

        if (expected) {
          expect(result.version).toBe(expected);
        } else {
          expect(result.version).toBeUndefined();
        }
      }
    });

    it('should use default --version args', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      await detectTool('tool');

      expect(mockSpawn).toHaveBeenCalledWith(
        'tool --version',
        expect.objectContaining({
          cwd: expect.any(String),
        })
      );
    });
  });

  describe('detectPnpmTool', () => {
    it('should prefix command with pnpm exec', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      await detectPnpmTool('biome', '/test/cwd');

      expect(mockSpawn).toHaveBeenCalledWith(
        'pnpm exec biome --version',
        expect.objectContaining({
          cwd: '/test/cwd',
        })
      );
    });

    it('should return unavailable when pnpm exec fails', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(1);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectPnpmTool('nonexistent');

      expect(result).toEqual({
        available: false,
      });
    });
  });

  describe('getCachedToolInfo', () => {
    it('should cache results for same tool+cwd combination', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('1.0.0'));
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      // First call
      const result1 = await getCachedToolInfo('biome', '/test/cwd');
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await getCachedToolInfo('biome', '/test/cwd');
      expect(mockSpawn).toHaveBeenCalledTimes(1); // Still 1, not 2

      expect(result1).toEqual(result2);
    });

    it('should use different cache keys for different cwds', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      await getCachedToolInfo('biome', '/test/cwd1');
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      await getCachedToolInfo('biome', '/test/cwd2');
      expect(mockSpawn).toHaveBeenCalledTimes(2); // Different cwd = new call
    });

    it('should use different cache keys for different tools', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const callsBefore = mockSpawn.mock.calls.length;

      await getCachedToolInfo('unique-tool-1', '/test/unique-cwd');
      expect(mockSpawn).toHaveBeenCalledTimes(callsBefore + 1);

      await getCachedToolInfo('unique-tool-2', '/test/unique-cwd');
      expect(mockSpawn).toHaveBeenCalledTimes(callsBefore + 2); // Different tool = new call
    });

    it('should use process.cwd() as default', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      await getCachedToolInfo('tool');

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cwd: process.cwd(),
        })
      );
    });
  });

  describe('edge cases', () => {
    it('should handle empty stdout', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from(''));
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('tool');

      expect(result).toEqual({
        available: true,
        path: 'tool',
      });
      expect(result.version).toBeUndefined();
    });

    it('should handle multiple data chunks', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('version '));
              callback(Buffer.from('1.2.3\n'));
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('tool');

      expect(result.version).toBe('1.2.3');
    });

    it('should handle null exit code', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        on: vi.fn((event: string, callback: (code: number | null) => void) => {
          if (event === 'close') {
            callback(null); // Can happen on spawn failure
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('tool');

      expect(result.available).toBe(false);
    });
  });

  describe('stderr handling', () => {
    it('should parse version from stderr when stdout is empty', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('Version 1.2.3\n'));
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('gitleaks', ['version']);

      expect(result).toEqual({
        available: true,
        version: '1.2.3',
        path: 'gitleaks',
      });
    });

    it('should prioritize stdout over stderr when both have data', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('biome 2.2.4\n'));
            }
          }),
        },
        stderr: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('Warning: some diagnostic\n'));
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('biome', ['--version']);

      expect(result).toEqual({
        available: true,
        version: '2.2.4',
        path: 'biome',
      });
    });

    it('should handle mixed output with version in stderr', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('Running tool...\n'));
            }
          }),
        },
        stderr: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(Buffer.from('playwright 1.42.1\n'));
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('playwright', ['--version']);

      expect(result.available).toBe(true);
      expect(result.version).toBe('1.42.1');
    });

    it('should extract version from verbose stderr output', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn((event: string, callback: (data: Buffer) => void) => {
            if (event === 'data') {
              callback(
                Buffer.from(`
Tool initialized
Loading config...
Version: 3.1.4
Ready to execute
`)
              );
            }
          }),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('complex-tool', ['--version']);

      expect(result.version).toBe('3.1.4');
      expect(result.available).toBe(true);
    });

    it('should handle empty stdout and stderr gracefully', async () => {
      const mockProcess = {
        stdout: {
          on: vi.fn(),
        },
        stderr: {
          on: vi.fn(),
        },
        on: vi.fn((event: string, callback: (code: number) => void) => {
          if (event === 'close') {
            callback(0);
          }
        }),
      };

      mockSpawn.mockReturnValue(mockProcess as never);

      const result = await detectTool('silent-tool', ['--version']);

      expect(result).toEqual({
        available: true,
        path: 'silent-tool',
      });
      expect(result.version).toBeUndefined();
    });
  });
});
