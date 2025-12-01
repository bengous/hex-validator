import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

describe('Validator E2E', () => {
  const repoRoot = path.join(__dirname, '..');
  const fixtureRelative = 'src/test-fixtures/valid-hexagonal-project';
  const cliPath = path.join(__dirname, 'cli/cli.ts');
  const tsconfigPath = path.join(repoRoot, 'tsconfig.e2e.json');

  it('should validate a hexagonal architecture project', async () => {
    // The validator may exit with code 1 due to warnings/errors, but should still produce output
    let stdout = '';
    let exitedWithError = false;

    try {
      const result = await execAsync(
        `pnpm tsx --tsconfig ${tsconfigPath} ${cliPath} full --scope=full --e2e=off --cwd=${fixtureRelative} --report=summary`,
        {
          cwd: repoRoot,
          env: { ...process.env, CI: 'true' },
        }
      );
      stdout = result.stdout;
    } catch (error: unknown) {
      exitedWithError = true;
      stdout = (error as { stdout?: string }).stdout ?? '';
    }

    // Validator should produce structured output
    expect(stdout).toContain('Validation Pipeline Results');
    expect(stdout).toContain('Tasks:');

    // Should find and validate the users module
    expect(stdout).toContain('users');

    // Structure validation should pass (mandatory folders present)
    expect(stdout).toContain('All 1 modules include mandatory folders');
  }, 30000);

  it('should output valid JSON when requested', async () => {
    let stdout = '';

    try {
      const result = await execAsync(
        `pnpm tsx --tsconfig ${tsconfigPath} ${cliPath} full --scope=full --e2e=off --cwd=${fixtureRelative} --report=json`,
        {
          cwd: repoRoot,
          env: { ...process.env, CI: 'true' },
        }
      );
      stdout = result.stdout;
    } catch (error: unknown) {
      stdout = (error as { stdout?: string }).stdout ?? '';
    }

    // JSON output should be parseable (may span multiple lines)
    const parsed = JSON.parse(stdout.trim());
    expect(parsed).toBeDefined();
    expect(parsed.results).toBeDefined();
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBeGreaterThan(0);
  }, 30000);
});
