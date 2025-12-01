import fs from 'node:fs';
import path from 'node:path';

type InitOptions = {
  cwd: string;
  preset?: 'nextjs' | 'library' | 'monorepo';
  force?: boolean;
};

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
  ensure('validate:fix', 'npx hex-validate fast --scope=staged --e2e=off --report=summary');
  ensure('validate', 'npx hex-validate full --scope=full --e2e=auto --report=summary');
  ensure('validate:ci', 'npx hex-validate ci --scope=full --e2e=auto --report=summary');
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
  lines.push('- Run pnpm validate:fix to test the pipeline');
  process.stdout.write(`${lines.join('\n')}\n`);
}
