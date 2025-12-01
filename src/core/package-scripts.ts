import fs from 'node:fs';
import path from 'node:path';
import type { Message, PluginResult } from '@validator/types';

type PackageJson = {
  scripts?: Record<string, unknown>;
};

export function hasPackageScript(cwd: string, scriptName: string): boolean {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return false;
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson;
  return typeof pkg.scripts?.[scriptName] === 'string';
}

export function missingScriptResult(pluginName: string, scriptName: string): PluginResult {
  const messages: Message[] = [
    {
      level: 'error',
      code: 'tool/missing-package-script',
      message: `Required package script "${scriptName}" is missing.`,
      suggestion: `Add "${scriptName}" to package.json scripts or remove this plugin from the validator config.`,
    },
  ];

  return {
    name: pluginName,
    status: 'fail',
    messages,
    artifacts: {
      scriptName,
    },
  };
}
