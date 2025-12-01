import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ValidatorConfig } from '@validator/types';
import ts from 'typescript';

function ensureCacheDir(cwd: string) {
  const dir = path.join(cwd, '.cache', 'hex-validator');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function importFile(modulePath: string): Promise<unknown> {
  const url = pathToFileURL(modulePath).href;
  return import(url);
}

export async function loadUserConfig(cwd: string): Promise<ValidatorConfig | null> {
  const candidates = ['validator.config.mjs', 'validator.config.js', 'validator.config.ts'];
  const validateConfig = (config: unknown): config is ValidatorConfig => {
    if (!config || typeof config !== 'object') {
      return false;
    }
    const c = config as Record<string, unknown>;
    if (!Array.isArray(c.stages)) {
      return false;
    }
    for (const s of c.stages as unknown[]) {
      if (!s || typeof s !== 'object') {
        return false;
      }
      const st = s as Record<string, unknown>;
      if (typeof st.name !== 'string') {
        return false;
      }
      if (!Array.isArray(st.tasks)) {
        return false;
      }
      for (const t of st.tasks as unknown[]) {
        if (!t || typeof t !== 'object') {
          return false;
        }
        const tt = t as Record<string, unknown>;
        if (!tt.plugin || typeof (tt.plugin as Record<string, unknown>).name !== 'string') {
          return false;
        }
        const run = (tt.plugin as Record<string, unknown>).run;
        if (typeof run !== 'function') {
          return false;
        }
      }
    }
    return true;
  };
  for (const f of candidates) {
    const abs = path.join(cwd, f);
    if (!fs.existsSync(abs)) {
      continue;
    }
    if (f.endsWith('.ts')) {
      try {
        // Try direct import first (works if tsx is active)
        const mod = await importFile(abs);
        const anyMod = mod as { default?: unknown } | unknown;
        const resolved = (anyMod as { default?: unknown })?.default ?? anyMod;
        if (validateConfig(resolved)) {
          return resolved as ValidatorConfig;
        }
      } catch (_e) {
        // Fallback to manual transpile
      }
      const code = fs.readFileSync(abs, 'utf8');
      const out = ts.transpileModule(code, {
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          target: ts.ScriptTarget.ES2022,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          esModuleInterop: true,
        },
        fileName: abs,
      });
      const dir = ensureCacheDir(cwd);
      const outPath = path.join(dir, 'validator.config.mjs');
      fs.writeFileSync(outPath, out.outputText, 'utf8');
      const mod = await importFile(outPath);
      const anyMod = mod as { default?: unknown } | unknown;
      const resolved = (anyMod as { default?: unknown })?.default ?? anyMod;
      if (!validateConfig(resolved)) {
        throw new Error('Invalid validator.config.ts shape');
      }
      return resolved as ValidatorConfig;
    }
    const mod = await importFile(abs);
    const anyMod = mod as { default?: unknown } | unknown;
    const resolved = (anyMod as { default?: unknown })?.default ?? anyMod;
    if (!validateConfig(resolved)) {
      throw new Error('Invalid validator.config.* shape');
    }
    return resolved as ValidatorConfig;
  }
  return null;
}
