# Validator Maintenance Guide

This guide covers common maintenance tasks, troubleshooting, and critical implementation details for the `hex-validator` package.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Critical Implementation Details](#critical-implementation-details)
3. [Troubleshooting](#troubleshooting)
4. [Adding New Plugins](#adding-new-plugins)
5. [Modifying dependency-cruiser Rules](#modifying-dependency-cruiser-rules)

---

## Architecture Overview

The validator enforces architectural rules across the codebase through plugins:

```
hex-validator/
├── src/
│   ├── plugins/
│   │   └── rules/          # Rule implementations
│   ├── cli/                # CLI interface
│   └── core/               # Shared utilities
├── configs/
│   └── dependency-cruiser.preset.cjs  # Dependency rules
└── MAINTENANCE.md          # This file
```

**Key components:**
- **Plugins** - Individual rule checkers (TypeScript/ts-morph/regex-based)
- **dependency-cruiser** - Import graph analyzer for architectural boundaries
- **CLI** - Orchestrates plugin execution with scoping (full/staged/fast)

---

## Critical Implementation Details

### 1. Backreference Syntax in dependency-cruiser

**⚠️ CRITICAL:** dependency-cruiser uses `$1`, `$2`, `$3` for backreferences, **NOT** `\1`, `\2`, `\3`.

#### Why This Matters

Backreferences let you capture part of a path and reuse it, ensuring rules apply within the same module:

```javascript
{
  from: { path: '^src/modules/([^/]+)/infrastructure/' },  // Captures module name
  to:   { path: '^src/modules/$1/application/' }            // $1 = captured module
}
```

**Example:**
- File: `src/modules/auth/infrastructure/adapters/session.ts`
- Import: `../../application/policies/Permissions`
- `([^/]+)` captures `auth`
- `$1` in `to` path becomes `auth`
- Rule matches: `auth/infrastructure → auth/application` ✅

#### Common Mistake

```javascript
// ❌ WRONG - Will silently fail
to: { path: '^src/modules/\\1/application/' }  // \1 treated as literal text

// ✅ CORRECT
to: { path: '^src/modules/$1/application/' }   // $1 replaced with captured group
```

**Symptom of wrong syntax:**
- `pnpm validate` shows "Architecture (dependency-cruiser): OK"
- But violations exist in the codebase
- Manual `depcruise` command finds violations

#### Why Different Syntax?

- **JavaScript/Perl/Ruby:** Use `$1`, `$2`, `$3` in replacement strings
- **POSIX/GNU sed:** Use `\1`, `\2`, `\3` for backreferences
- Dependency-cruiser follows JavaScript conventions (it's a JS tool)

#### Multiple Capture Groups

You can capture multiple parts:

```javascript
{
  // $1 = module name, $2 = layer name
  from: { path: '^src/modules/([^/]+)/([^/]+)/' },
  to:   { path: '^src/modules/$1/$2/tests/' }
}
```

**Reference:**
- [dependency-cruiser rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- Search for "group matching" in the docs

---

### 2. Project Root Detection in dep-cruiser Plugin

The `dep-cruiser.ts` plugin must run from the **project root**, not the validator package directory.

**Why:** The validator is in a monorepo workspace, and we need to check the main project's `src/` directory, not the validator's.

**Implementation (dep-cruiser.ts:62-87):**

```typescript
// Find project root by looking for pnpm-workspace.yaml or package.json with workspaces
let projectRoot = ctx.cwd;
let current = ctx.cwd;
while (true) {
  // Check for pnpm-workspace.yaml (pnpm workspaces)
  if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml'))) {
    projectRoot = current;
    break;
  }
  // Check for package.json with workspaces field (npm/yarn workspaces)
  const pkgPath = path.join(current, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      if (pkg.workspaces) {
        projectRoot = current;
        break;
      }
    } catch {
      // ignore
    }
  }
  const parent = path.dirname(current);
  if (parent === current) break;
  current = parent;
}
```

**Key points:**
- Searches upward from `ctx.cwd` for workspace markers
- Uses `projectRoot` for both config path and target `src/` directory
- Falls back to `ctx.cwd` if no workspace found (non-monorepo setup)

**Bug if missing:** Plugin would check `hex-validator/src/` (which has no violations) instead of `src/` at project root.

---

### 3. Violation Parsing in dep-cruiser Plugin

dependency-cruiser JSON output has a **nested structure** for violations:

```json
{
  "summary": {
    "violations": [
      {
        "from": "src/modules/auth/infrastructure/adapters/session.ts",
        "to": "src/modules/auth/application/policies/Permissions.ts",
        "rule": {
          "severity": "error",    // ← nested here
          "name": "infrastructure-depends-on-ports-only"  // ← nested here
        }
      }
    ]
  }
}
```

**Correct parsing (dep-cruiser.ts:149-152):**

```typescript
const ruleObj = isObj(raw.rule) ? raw.rule : {};
const severity = typeof ruleObj.severity === 'string' ? ruleObj.severity : undefined;
const ruleName = typeof ruleObj.name === 'string' ? ruleObj.name : undefined;
```

**Bug if wrong:**
```typescript
// ❌ WRONG - Always undefined
const severity = typeof raw.severity === 'string' ? raw.severity : undefined;

// ✅ CORRECT - Extracts from nested object
const severity = typeof ruleObj.severity === 'string' ? ruleObj.severity : undefined;
```

**Symptom of bug:**
- All violations treated as warnings
- `failed` flag never set to `true`
- Plugin reports "OK" despite errors

---

## Troubleshooting

### Issue: dependency-cruiser Reports "OK" But Violations Exist

**Symptoms:**
- `pnpm validate` shows "Architecture (dependency-cruiser): OK"
- Manual `depcruise` finds violations
- Known architectural violations not caught

**Root Causes & Fixes:**

#### 1. Wrong Backreference Syntax

**Check:** Open `configs/dependency-cruiser.preset.cjs` and search for `\\1`

```bash
grep '\\\\1' hex-validator/configs/dependency-cruiser.preset.cjs
```

If found, replace with `$1`:

```bash
sed -i 's/\\\\1/$1/g' hex-validator/configs/dependency-cruiser.preset.cjs
```

**Test:**
```bash
pnpm exec dependency-cruiser --config hex-validator/configs/dependency-cruiser.preset.cjs src
```

#### 2. Wrong Project Directory

**Check:** Add debug logging to `dep-cruiser.ts` around line 133:

```typescript
console.log('[DEBUG] Project root:', projectRoot);
console.log('[DEBUG] Checking directory:', path.join(projectRoot, 'src'));
```

Run `pnpm validate` and verify it's checking the correct `src/` directory.

**Expected:**
```
[DEBUG] Project root: /home/user/projects/my-project
[DEBUG] Checking directory: /home/user/projects/my-project/src
```

**Not:**
```
[DEBUG] Project root: /home/user/projects/my-project/packages/hex-validator
[DEBUG] Checking directory: /home/user/projects/my-project/hex-validator/src
```

#### 3. Wrong JSON Parsing

**Check:** Exit code and violations count:

```typescript
console.log('[DEBUG] Exit code:', res.code);
console.log('[DEBUG] Violations found:', vio.length);
console.log('[DEBUG] Failed flag:', failed);
```

**Expected behavior:**
- Violations exist → `failed = true`
- Exit code may be 0 (dependency-cruiser doesn't always exit 1)
- Violations parsed from `summary.violations`

#### 4. Config Not Found

**Check:** Config path resolution:

```typescript
console.log('[DEBUG] Config path:', configPath);
console.log('[DEBUG] Config exists:', fs.existsSync(configPath));
```

**Expected:**
- Finds project root `dependency-cruiser.config.cjs` first
- Falls back to validator preset if not found
- Never returns "skipped" status when violations exist

---

### Issue: New Rule Not Detecting Violations

**Checklist:**

1. **Verify rule syntax:**
   ```javascript
   {
     name: 'my-rule',
     severity: 'error',  // ← Must be 'error' or 'warn'
     from: { path: '...' },
     to: { path: '...' }
   }
   ```

2. **Test rule in isolation:**
   ```bash
   pnpm exec dependency-cruiser --config hex-validator/configs/dependency-cruiser.preset.cjs --output-type err src/path/to/test/file.ts
   ```

3. **Check backreferences:**
   - Using `$1`, not `\1`?
   - Capture group exists in `from` path?
   - Backreference index matches capture group?

4. **Check `dependencyTypesNot`:**
   ```javascript
   to: {
     path: '^src/modules/$1/infrastructure/',
     dependencyTypesNot: ['type-only']  // ← Allows type-only imports
   }
   ```
   Remove if you want to catch type imports too.

5. **Verify paths match actual files:**
   ```bash
   # Find files that should match
   find src -type f -regex 'src/modules/.*/infrastructure/.*\.ts'
   ```

---

## Adding New Plugins

### Plugin Structure

```typescript
// hex-validator/src/plugins/rules/my-plugin.ts
import type { Plugin, PluginContext, PluginResult } from '@validator/types';

export const myPlugin: Plugin = {
  name: 'My Plugin Name',
  async run(ctx: PluginContext): Promise<PluginResult> {
    // 1. Skip if not applicable
    if (ctx.scope !== 'full' && !ctx.changedFiles.some(f => f.startsWith('src/'))) {
      return { name: 'My Plugin Name', status: 'skipped' };
    }

    // 2. Run checks
    const messages: PluginResult['messages'] = [];
    let failed = false;

    // Your logic here...

    // 3. Return result
    return {
      name: 'My Plugin Name',
      status: failed ? 'fail' : 'pass',
      messages: messages.length > 0 ? messages : undefined,
    };
  },
};
```

### Integration Steps

1. **Create plugin file** in `src/plugins/rules/`
2. **Export from index:**
   ```typescript
   // src/plugins/index.ts
   export { myPlugin } from './rules/my-plugin';
   ```
3. **Add to config:**
   ```typescript
   // validator.config.ts (project root)
   import { myPlugin } from 'hex-validator';

   stages: [
     {
       name: 'Architecture Checks',
       tasks: [
         { plugin: myPlugin },
       ],
     },
   ]
   ```

### Plugin Best Practices

- **Use `shouldIgnore()`** helper for common exclusions
- **Implement scope checks** to skip unnecessary work
- **Return specific error messages** with file paths
- **Use type guards** for safe parsing
- **Add debug logging** that can be enabled via env var

---

## Modifying dependency-cruiser Rules

### Rule Template

```javascript
{
  name: 'rule-name',
  comment: 'Human-readable description of what this prevents and why',
  severity: 'error',  // or 'warn'
  from: {
    path: '^src/modules/([^/]+)/layer-name/',
    pathNot: '^src/modules/[^/]+/layer-name/__tests__/'  // Optional exclusions
  },
  to: {
    path: '^src/modules/$1/other-layer/',
    dependencyTypesNot: ['type-only']  // Allow type imports
  }
}
```

### Common Patterns

**Same-module restriction:**
```javascript
from: { path: '^src/modules/([^/]+)/infrastructure/' },
to:   { path: '^src/modules/$1/application/' }
// ✅ Matches: auth/infrastructure → auth/application
// ❌ Doesn't match: auth/infrastructure → orders/application
```

**Cross-module restriction:**
```javascript
from: { path: '^src/modules/([^/]+)/core/' },
to:   { path: '^src/modules/(?!$1)[^/]+/infrastructure/' }
// ✅ Matches: auth/core → orders/infrastructure
// ❌ Doesn't match: auth/core → auth/infrastructure
```

**Folder existence check:**
```javascript
{
  name: 'no-types-folder',
  severity: 'error',
  from: { path: '^src/modules/[^/]+/types/' },
  to: {}  // Matches if folder exists
}
```

### Testing Rules

1. **Create test violation:**
   ```typescript
   // Temporarily add violating import
   import { Something } from '../forbidden/path';
   ```

2. **Run dependency-cruiser:**
   ```bash
   pnpm exec dependency-cruiser --config hex-validator/configs/dependency-cruiser.preset.cjs src
   ```

3. **Verify violation detected:**
   - Look for your rule name in output
   - Check severity is correct
   - Verify message is helpful

4. **Run full validation:**
   ```bash
   pnpm validate
   ```

---

## Quick Reference

### Run Commands

```bash
# Full validation
pnpm validate

# Staged files only (fast)
pnpm validator:staged

# Rebuild validator
pnpm validator:build

# Test specific plugin
pnpm exec tsx hex-validate full --scope=full

# Test dependency-cruiser directly
pnpm exec dependency-cruiser --config hex-validator/configs/dependency-cruiser.preset.cjs src

# Check specific file
pnpm exec dependency-cruiser --config hex-validator/configs/dependency-cruiser.preset.cjs src/modules/auth/infrastructure/adapters/session.ts
```

### File Locations

- **Plugin implementations:** `src/plugins/rules/`
- **dependency-cruiser config:** `configs/dependency-cruiser.preset.cjs`
- **Project config:** `validator.config.ts` (your project root)
- **Root config (extends preset):** `dependency-cruiser.config.cjs` (your project root)

### Related Documentation

- [dependency-cruiser docs](https://github.com/sverweij/dependency-cruiser/tree/main/doc)
- [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/)
- [Ports and Adapters Pattern](https://herbertograca.com/2017/09/14/ports-adapters-architecture/)

---

## Version History

- **2025-01-22:** Created maintenance guide
  - Documented backreference syntax bug (issue #217)
  - Added project root detection explanation
  - Added violation parsing details
  - Created troubleshooting section
