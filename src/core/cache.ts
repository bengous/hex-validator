import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export type CacheShape = {
  plugins: Record<string, Record<string, string>>; // pluginName -> file -> hash
};

function cachePaths(cwd: string): { dir: string; file: string } {
  const dir = path.join(cwd, '.cache');
  return {
    dir,
    file: path.join(dir, 'hex-validator.json'),
  };
}

export function loadCache(cwd = process.cwd()): CacheShape {
  const { file } = cachePaths(cwd);
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return JSON.parse(txt) as CacheShape;
  } catch (_e) {
    try {
      process.stderr.write(
        '[validator-cache] Warning: failed to read cache; continuing with empty cache.\n'
      );
    } catch {}
    return { plugins: {} };
  }
}

export function saveCache(cache: CacheShape, cwd = process.cwd()) {
  const { dir, file } = cachePaths(cwd);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tmp = `${file}.tmp.${process.pid}.${Date.now()}`;
    const payload = JSON.stringify(cache);
    fs.writeFileSync(tmp, payload);
    try {
      fs.renameSync(tmp, file);
    } catch {
      try {
        fs.copyFileSync(tmp, file);
        fs.unlinkSync(tmp);
      } catch {}
    }
  } catch (_e) {
    try {
      process.stderr.write(
        '[validator-cache] Warning: failed to write cache; results will not be cached.\n'
      );
    } catch {}
  }
}

export function hashFile(p: string): string | null {
  try {
    const buf = fs.readFileSync(p);
    return crypto.createHash('sha1').update(buf).digest('hex');
  } catch {
    return null;
  }
}
