import type { ToolInfo } from '@validator/core/tool-detection';
import { vi } from 'vitest';

/**
 * Test utility for mocking tool detection in plugin tests.
 *
 * Usage:
 * ```typescript
 * import { setupToolDetectionMocks } from '@validator/test-utils/mock-tool-detection';
 *
 * // At module level (hoisted)
 * vi.mock('@validator/core/tool-detection', () => ({
 *   getCachedToolInfo: vi.fn(),
 *   detectTool: vi.fn(),
 *   detectPnpmTool: vi.fn(),
 * }));
 *
 * const toolMocks = setupToolDetectionMocks();
 *
 * beforeEach(() => {
 *   toolMocks.mockToolAvailable(); // Default: tool is available
 * });
 *
 * it('should skip when tool unavailable', () => {
 *   toolMocks.mockToolUnavailable();
 *   // ... test logic
 * });
 * ```
 *
 * This keeps plugin tests focused on plugin logic while tool-detection.test.ts
 * tests the actual detection behavior.
 */
export function setupToolDetectionMocks() {
  return {
    /**
     * Mock a tool as available with optional version
     */
    mockToolAvailable: async (version = '1.0.0') => {
      const result: ToolInfo = {
        available: true,
        version,
        path: 'mock-path',
      };

      const mod = await import('@validator/core/tool-detection');
      vi.mocked(mod.getCachedToolInfo).mockResolvedValue(result);
      vi.mocked(mod.detectTool).mockResolvedValue(result);
      vi.mocked(mod.detectPnpmTool).mockResolvedValue(result);
    },

    /**
     * Mock a tool as unavailable
     */
    mockToolUnavailable: async () => {
      const result: ToolInfo = {
        available: false,
      };

      const mod = await import('@validator/core/tool-detection');
      vi.mocked(mod.getCachedToolInfo).mockResolvedValue(result);
      vi.mocked(mod.detectTool).mockResolvedValue(result);
      vi.mocked(mod.detectPnpmTool).mockResolvedValue(result);
    },

    /**
     * Access the underlying mocks for custom behavior
     */
    async getMocks() {
      const mod = await import('@validator/core/tool-detection');
      return {
        getCachedToolInfo: vi.mocked(mod.getCachedToolInfo),
        detectTool: vi.mocked(mod.detectTool),
        detectPnpmTool: vi.mocked(mod.detectPnpmTool),
      };
    },
  };
}
