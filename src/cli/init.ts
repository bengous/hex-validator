import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type InitOptions = {
  cwd: string;
  preset?: 'nextjs';
  force?: boolean;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function copyIfMissing(
  src: string,
  dest: string,
  force = false
): { wrote: boolean; reason?: string } {
  if (fs.existsSync(dest) && !force) {
    return { wrote: false, reason: 'exists' };
  }
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
  return { wrote: true };
}

type Scripts = Record<string, string>;
type PackageJson = {
  scripts?: Scripts;
  [k: string]: unknown;
};

function patchPackageJson(cwd: string): { updated: boolean } {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { updated: false };
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as PackageJson;
  pkg.scripts = (pkg.scripts as Scripts) ?? {};
  let changed = false;
  const ensure = (k: string, v: string) => {
    const scripts = pkg.scripts as Scripts;
    if (!scripts[k]) {
      scripts[k] = v;
      changed = true;
    }
  };
  ensure('validate:staged', 'pnpm exec hex-validate fast --scope=staged --e2e=off --report=summary');
  ensure('validate', 'pnpm exec hex-validate full --scope=full --e2e=auto --report=summary');
  ensure('validate:ci', 'pnpm exec hex-validate ci --scope=full --e2e=auto --report=summary');
  if (changed) {
    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
  return { updated: changed };
}

export async function initProject(opts: InitOptions): Promise<void> {
  const { cwd, force } = opts;
  const templatesDir = path.join(__dirname, '..', '..', 'templates');
  const cfgSrc = path.join(templatesDir, 'validator.config.ts');
  const cfgDest = path.join(cwd, 'validator.config.ts');
  const cfgRes = copyIfMissing(cfgSrc, cfgDest, force);
  const hookSrc = path.join(templatesDir, 'lefthook.yml');
  const hookDest = path.join(cwd, 'lefthook.yml');
  const hookRes = copyIfMissing(hookSrc, hookDest, false);
  const pkgRes = patchPackageJson(cwd);
  const lines: string[] = [];
  lines.push('Initialized validator scaffolding:');
  lines.push(`- validator.config.ts: ${cfgRes.wrote ? 'created' : 'skipped (exists)'}`);
  lines.push(`- lefthook.yml: ${hookRes.wrote ? 'created' : 'skipped (exists)'}`);
  lines.push(`- package.json scripts: ${pkgRes.updated ? 'added' : 'kept'}`);
  lines.push('Next steps:');
  lines.push('- Ensure lefthook is installed and enabled (pnpm dlx lefthook install)');
  lines.push('- Run pnpm validate:staged to test the staged-file pipeline');
  process.stdout.write(`${lines.join('\n')}\n`);
}
