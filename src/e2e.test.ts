import { exec } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';

const execAsync = promisify(exec);

describe('Validator E2E', () => {
  const repoRoot = path.join(__dirname, '..');
  const fixtureRelative = 'examples/next-hexagonal';
  const invalidFixtureRelative = 'test-fixtures/invalid-hexagonal-project';
  const cliPath = path.join(repoRoot, 'dist/cli/cli.js');

  beforeAll(async () => {
    await execAsync('pnpm run build', { cwd: repoRoot });
  }, 30000);

  it('should validate a hexagonal architecture project', async () => {
    // The validator may exit with code 1 due to warnings/errors, but should still produce output
    let stdout = '';

    try {
      const result = await execAsync(
        `node ${cliPath} full --scope=full --e2e=off --cwd=${fixtureRelative} --report=summary`,
        {
          cwd: repoRoot,
          env: { ...process.env, CI: 'true' },
        }
      );
      stdout = result.stdout;
    } catch (error: unknown) {
      stdout = (error as { stdout?: string }).stdout ?? '';
    }

    // Validator should produce structured output
    expect(stdout).toContain('Validation Pipeline Results');
    expect(stdout).toContain('Tasks:');

    expect(stdout).toContain('Failed:   0');
    expect(stdout).not.toContain('Required plugin "Architecture (dependency-cruiser)" was skipped');
  }, 30000);

  it('should output valid JSON when requested', async () => {
    let stdout = '';

    try {
      const result = await execAsync(
        `node ${cliPath} full --scope=full --e2e=off --cwd=${fixtureRelative} --report=json`,
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
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.ok).toBe(true);
    expect(parsed.summary).toBeDefined();
    expect(parsed.results).toBeDefined();
    expect(Array.isArray(parsed.results)).toBe(true);
    expect(parsed.results.length).toBeGreaterThan(0);
    expect(JSON.stringify(parsed)).not.toContain('validator/required-plugin-skipped');
  }, 30000);

  it('should report stable codes for invalid fixtures', async () => {
    let stdout = '';

    try {
      const result = await execAsync(
        `node ${cliPath} full --scope=full --e2e=off --cwd=${invalidFixtureRelative} --report=json`,
        {
          cwd: repoRoot,
          env: { ...process.env, CI: 'true' },
        }
      );
      stdout = result.stdout;
    } catch (error: unknown) {
      stdout = (error as { stdout?: string }).stdout ?? '';
    }

    const parsed = JSON.parse(stdout.trim());
    expect(parsed.ok).toBe(false);
    expect(JSON.stringify(parsed)).toContain('structure/missing');
  }, 30000);
});
