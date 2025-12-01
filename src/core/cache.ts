import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'hex-validator.json');

export type CacheShape = {
  plugins: Record<string, Record<string, string>>; // pluginName -> file -> hash
};

export function loadCache(): CacheShape {
  try {
    const txt = fs.readFileSync(CACHE_FILE, 'utf8');
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

export function saveCache(cache: CacheShape) {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const tmp = `${CACHE_FILE}.tmp.${process.pid}.${Date.now()}`;
    const payload = JSON.stringify(cache);
    fs.writeFileSync(tmp, payload);
    try {
      fs.renameSync(tmp, CACHE_FILE);
    } catch {
      try {
        fs.copyFileSync(tmp, CACHE_FILE);
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
