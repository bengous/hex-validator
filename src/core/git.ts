import { spawn } from 'node:child_process';

export function git(
  args: string[],
  opts: { cwd?: string } = {}
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, {
      stdio: ['ignore', 'pipe', 'inherit'],
      cwd: opts.cwd ?? process.cwd(),
    });
    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
    });
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout: out });
    });
  });
}

export async function getStagedFiles(cwd = process.cwd()): Promise<string[]> {
  const { code, stdout } = await git(
    ['diff', '--name-only', '--cached', '--diff-filter=ACMRTUXB'],
    { cwd }
  );
  if (code !== 0) {
    return [];
  }
  return stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getChangedFilesAgainstUpstream(cwd = process.cwd()): Promise<string[]> {
  const upstream = await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], {
    cwd,
  });
  if (upstream.code !== 0 || !upstream.stdout.trim()) {
    const diff = await git(['diff', '--name-only', 'HEAD~1'], { cwd });
    if (diff.code !== 0) {
      return [];
    }
    return diff.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  const mergeBase = await git(['merge-base', 'HEAD', '@{u}'], { cwd });
  const base = mergeBase.stdout.trim() || 'HEAD~1';
  const diff = await git(['diff', '--name-only', `${base}..HEAD`], { cwd });
  if (diff.code !== 0) {
    return [];
  }
  return diff.stdout
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}
