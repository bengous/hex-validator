import fs from 'node:fs';
import path from 'node:path';
import fg from 'fast-glob';

/**
 * Validate that every port has a mock implementation
 *
 * Mocks enable isolated testing without infrastructure dependencies
 * (databases, file systems, external APIs).
 *
 * This catches Agent 6 gaps (missing mocks)
 *
 * Issue: #210 - Hexagonal Architecture Migration
 */

type ValidationResult = {
  missing: Array<{ port: string; expectedMock: string }>;
  total: number;
  covered: number;
};

export async function validateMocks(): Promise<ValidationResult> {
  const ports = fg.sync('src/modules/*/application/ports/I*.ts', {
    ignore: ['**/*.test.ts', '**/__tests__/**'],
    cwd: process.cwd(),
    absolute: true,
  });

  const missing: Array<{ port: string; expectedMock: string }> = [];

  for (const portFile of ports) {
    const portName = path.basename(portFile, '.ts');
    const mockName = portName.substring(1); // Remove 'I' prefix: IFoo → Foo

    // Extract module name from path
    const pathParts = portFile.split(path.sep);
    const moduleIndex = pathParts.indexOf('modules') + 1;
    const moduleName = pathParts[moduleIndex];

    if (!moduleName) {
      continue; // Skip if module name not found in path
    }

    const mockFile = path.join(
      process.cwd(),
      'src',
      'modules',
      moduleName,
      'infrastructure',
      'mocks',
      `Mock${mockName}.ts`
    );

    if (!fs.existsSync(mockFile)) {
      missing.push({
        port: path.relative(process.cwd(), portFile),
        expectedMock: path.relative(process.cwd(), mockFile),
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
  validateMocks().then(({ missing }) => {
    if (missing.length > 0) {
      for (const { port, expectedMock } of missing) {
        console.error(`Missing mock for ${port}. Expected: ${expectedMock}`);
      }
      process.exit(1);
    }
    process.exit(0);
  });
}
