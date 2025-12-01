# Architectural Rules & Guardrails

**Purpose**: Single source of truth for non-negotiable architecture rules enforced by this validator.
**Enforcement**: `pnpm validate` (runs dependency-cruiser + custom AST checks).

---

## 1. Core Principles (Hexagonal + Effect)

The architecture follows a **Pragmatic Hexagonal** pattern enhanced with **Effect** for error handling and dependency injection.

### Layer Dependency Flow
Dependencies must ALWAYS flow **inward** (toward Core).

```
UI (React) → Boundary (Actions) → Composition (Layers) → Application → Core (Domain)
                                         ↓                    ↑
                                   Infrastructure (Adapters) ─┘
```

| Layer | Role | Allowed Imports (Inward Only) |
| :--- | :--- | :--- |
| **UI** | Presentation | `boundary/actions`, `boundary/types` |
| **Boundary** | Server Actions | `composition/layers`, `core/domain` (types/errors), `application/use-cases` (simple only) |
| **Composition** | DI Wiring | `infrastructure/layers`, `application/`, `core/` |
| **Application** | Orchestration | `core/`, `ports/` (Interfaces), `lib/result` |
| **Infrastructure**| Implementation | `application/ports`, `core/` |
| **Core** | Pure Domain | **NONE** (Pure TypeScript, `lib/result` only) |

---

## 2. Non-Negotiable Rules

### ✅ Result Monad Contract
**Every operation must return `Result<T, E>` (Legacy) or `Effect<T, E>` (Standard).**
- **NEVER throw** exceptions in domain/application layers.
- **Check results** using `Result.isOk()` / `Result.isErr()` (Legacy).
- **Propagate errors** explicitly.

### ✅ Core Layer Purity
**`core/` must be PURE.**
- **NO** framework imports (Next.js, React, Zod).
- **NO** Node.js APIs (fs, path, crypto).
- **NO** external libraries.
- **Exception**: `@/lib/core/Result` and internal domain modules.

### ✅ Application Layer Abstraction
**`application/` depends on Ports, NOT Infrastructure.**
- **Forbidden**: Importing `infrastructure/adapters/...`.
- **Required**: Import `application/ports/I...`.
- **Goal**: Business logic must be testable without a real database/API.

### ✅ Composition Layer (Effect Layers)
**Exports ONLY `Effect.Layer` definitions.**
- **File**: `composition/layers.ts`
- **Directive**: `import 'server-only'`
- **Usage**: Wires `infrastructure` implementations to `application` ports.
- **Forbidden**: Exporting functions or operations (use Boundary for that).

### ✅ Boundary Layer (Server Actions)
**Entry point for UI.**
- **Directive**: `'use server'`
- **Pattern**: Per-request composition using `Effect.provide`.
- **Forbidden**: Direct `infrastructure` imports (must use Composition or Use Cases).

---

## 3. Canonical Module Structure

Every module in `src/modules/<name>/` MUST follow this structure:

```
src/modules/<name>/
├── core/                 # Pure domain (Entities, Errors, Value Objects)
│   └── domain/
├── application/          # Business logic
│   ├── use-cases/        # Orchestration
│   ├── ports/            # Interfaces
│   └── policies/         # Rules
├── infrastructure/       # Implementations
│   ├── adapters/         # External services
│   └── persistence/      # Database (Drizzle)
├── composition/          # DI Wiring
│   └── layers.ts         # Effect Layers
├── boundary/             # Server Actions
│   ├── actions.ts
│   └── types.ts          # UI DTOs
└── ui/                   # React Components
```

**Forbidden Folders:** `server/`, `db/`, `types/` (at module root).

---

## 4. Enforced Patterns (Automated)

### A. Dependency Cruiser (Imports)
| Rule | Severity | Description |
| :--- | :--- | :--- |
| `no-circular` | ❌ ERROR | No circular dependencies. |
| `core-must-be-pure` | ❌ ERROR | Core cannot import app/infra/ui. |
| `no-cross-module-internals` | ❌ ERROR | Modules cannot import other modules' internals (use `external.ts` or public ports). |
| `ui-layer-boundaries` | ❌ ERROR | UI can only import from `boundary/`. |

### B. AST Checks (Code Structure)
| Plugin | Check |
| :--- | :--- |
| `rsc-boundaries` | Client components cannot import server code. |
| `drizzle-patterns` | Database writes must use validated data. |
| `server-directives` | `'use server'` / `'server-only'` placement validation. |
| `domain-types` | Value objects and entities must be pure. |

---

## 5. Testing Strategy

| Type | Location | Access Rules |
| :--- | :--- | :--- |
| **Unit** | `__tests__/*.test.ts` | Can import `infrastructure/mocks`. |
| **Contract** | `ports/__tests__/*.contract.test.ts` | Can import real Adapters (to verify against mocks). |
| **Integration** | `infrastructure/__tests__/*.integration.test.ts` | Can import full Infrastructure stack. |

---

## 6. Common Violations & Fixes

**Violation**: `core/domain/User.ts` imports `zod`.
**Fix**: Move validation logic to `application/` or use a pure custom validator.

**Violation**: `application/use-cases/CreateUser.ts` imports `DrizzleUserRepository`.
**Fix**: Import `IUserRepository` port. Inject implementation via Composition.

**Violation**: `ui/Profile.tsx` imports `core/domain/User`.
**Fix**: Import `UserDTO` from `boundary/types.ts`.

**Violation**: `boundary/actions.ts` creates a global service instance.
**Fix**: Create instance *inside* the action (per-request) or use `Effect.provide`.
