import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCommand } from '../src/core/tool-runner';

async function runStep(command: string, args: string[], cwd: string): Promise<string> {
  const result = await runCommand(command, args, cwd);
  if (result.code !== 0) {
    throw new Error(
      [
        `Command failed: ${command} ${args.join(' ')}`,
        `cwd: ${cwd}`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
  return result.stdout;
}

async function main() {
  const repoRoot = process.cwd();
  const packDir = mkdtempSync(path.join(os.tmpdir(), 'hex-validator-pack-'));
  const consumerDir = mkdtempSync(path.join(os.tmpdir(), 'hex-validator-consumer-'));
  const consumerStoreDir = path.join(consumerDir, '.pnpm-store');

  await runStep('pnpm', ['run', 'build'], repoRoot);
  const packOutput = await runStep('pnpm', ['pack', '--pack-destination', packDir], repoRoot);
  const tarballName = packOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.endsWith('.tgz'));

  if (!tarballName) {
    throw new Error(`Unable to find tarball name in pnpm pack output:\n${packOutput}`);
  }

  const tarballPath = path.isAbsolute(tarballName) ? tarballName : path.join(packDir, tarballName);
  const tarballList = await runStep('tar', ['-tf', tarballPath], repoRoot);
  const tarballEntries = tarballList.split(/\r?\n/);
  const hasEntry = (needle: string) => tarballEntries.some((entry) => entry.includes(needle));
  if (!hasEntry('package/templates/validator.config.ts')) {
    throw new Error('Packed tarball is missing templates/validator.config.ts');
  }
  if (
    hasEntry('package/dist/test-fixtures/') ||
    hasEntry('package/dist/test-utils/') ||
    hasEntry('package/configs/index.ts') ||
    hasEntry('package/configs/recommended.ts')
  ) {
    throw new Error('Packed tarball contains non-public test or top-level TS config files');
  }

  writeFileSync(
    path.join(consumerDir, 'package.json'),
    `${JSON.stringify(
      {
        name: 'hex-validator-pack-smoke',
        version: '0.0.0',
        private: true,
        type: 'module',
        packageManager: 'pnpm@10.22.0',
      },
      null,
      2
    )}\n`
  );

  await runStep('pnpm', ['--store-dir', consumerStoreDir, 'add', '-D', tarballPath], consumerDir);
  await runStep('pnpm', ['exec', 'hex-validate', '--version'], consumerDir);
  await runStep('pnpm', ['exec', 'hex-validate', 'init'], consumerDir);
  if (!existsSync(path.join(consumerDir, 'validator.config.ts'))) {
    throw new Error('hex-validate init did not create validator.config.ts');
  }
  if (!existsSync(path.join(consumerDir, 'lefthook.yml'))) {
    throw new Error('hex-validate init did not create lefthook.yml');
  }
  await runStep(
    'node',
    [
      '--input-type=module',
      '-e',
      [
        "const root = await import('hex-validator');",
        "const configs = await import('hex-validator/configs');",
        "const validators = await import('hex-validator/validators/structure');",
        "if (!root.defineConfig || !root.presets || !root.rulesets) throw new Error('root export missing');",
        "if (!configs.dependencyCruiserPresetPath) throw new Error('configs export missing');",
        "if (!validators.validateStructure) throw new Error('validator export missing');",
      ].join(' '),
    ],
    consumerDir
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
