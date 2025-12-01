# Validator Plugins

Documentation for custom validation rules in the hex-validator package.

## Server Directives Plugin

**Location:** `src/plugins/rules/server-directives.ts`

Enforces correct `'use server'` and `import 'server-only'` patterns in Next.js Server Actions and RSC architecture.

### Rules

#### 1. `server/redundant-use-server` (ERROR)
Detects redundant function-level `'use server'` when file has file-level directive.

**Why:** File-level directive already covers all exports per Next.js documentation.

**Example violation:**
```typescript
'use server';  // File-level

export async function upload() {
  'use server';  // ❌ ERROR: Redundant!
}
```

**Fix:** Remove function-level directives.

#### 2. `server/missing-use-server` (ERROR)
Ensures `actions.ts` files have file-level `'use server'` directive.

**Why:** Server Actions must be marked for Client Component imports.

**Allows:** Comments/whitespace before directive.

#### 3. `server/missing-server-only` (ERROR)
Ensures `queries.ts` and `services.ts` have `import 'server-only'`.

**Why:** Prevents accidental client-side imports of server utilities.

#### 4. `server/wrong-directive-type` (ERROR)
Detects incorrect `'use server'` in queries/services files.

**Why:** These are utilities (not Server Actions), should use `import 'server-only'`.

**Fix:** Replace `'use server'` with `import 'server-only'`.

### Implementation Details

- **Approach:** Regex-based pattern matching (~5ms for entire codebase)
- **Files scanned:** `src/modules/**/server/*.ts`
- **Scope support:** full, staged, changed

**Pattern matching:**
- File-level: `/^'use server';/m` (allows preceding comments)
- Function-level: `/^\s+'use server';/gm` (indented = error)
- Import: `/^import\s+['"]server-only['"];?/m`

### References

- [Next.js: use server](https://nextjs.org/docs/app/api-reference/directives/use-server)
- [React: use server](https://react.dev/reference/rsc/use-server)
- [GitHub Discussion](https://github.com/vercel/next.js/discussions/50976)

## Other Plugins

See `src/plugins/` for additional validation rules:
- `rsc-boundaries.ts` - RSC client/server boundary checks
- `ast-audit.ts` - Domain architecture AST analysis
- `dep-cruiser.ts` - Dependency graph validation
- `domain-types.ts` - Type purity enforcement
- `drizzle-patterns.ts` - Database schema patterns
- `module-structure.ts` - Module folder structure