import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

/**
 * Validate that every port has a contract test
 *
 * Contract tests ensure production and mock implementations follow LSP
 * (Liskov Substitution Principle) by testing both against the same interface.
 *
 * This catches Agent 7 gaps (missing contract tests)
 *
 * Issue: #210 - Hexagonal Architecture Migration
 */

type ValidationResult = {
  missing: Array<{ port: string; expectedTest: string }>;
  total: number;
  covered: number;
};

export async function validateContractTests(): Promise<ValidationResult> {
  const ports = fg.sync('src/modules/*/application/ports/I*.ts', {
    ignore: ['**/*.test.ts', '**/__tests__/**'],
    cwd: process.cwd(),
    absolute: true,
  });

  const missing: Array<{ port: string; expectedTest: string }> = [];

  for (const portFile of ports) {
    const portName = path.basename(portFile, '.ts');
    const testDir = path.join(path.dirname(portFile), '__tests__');
    const testFile = path.join(testDir, `${portName}.contract.test.ts`);

    if (!fs.existsSync(testFile)) {
      missing.push({
        port: path.relative(process.cwd(), portFile),
        expectedTest: path.relative(process.cwd(), testFile),
      });
    }
  }

  return {
    missing,
    total: ports.length,
    covered: ports.length - missing.length,
  };
}

// CLI execution
if (import.meta.url === `file://${process.argv[1]}`) {
  validateContractTests().then(({ missing }) => {
    if (missing.length > 0) {
      for (const { port, expectedTest } of missing) {
        console.error(`Missing contract test for ${port}. Expected: ${expectedTest}`);
      }
      process.exit(1);
    }
    process.exit(0);
  });
}
