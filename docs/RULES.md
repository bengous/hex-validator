# Rules Reference

The source of truth for public diagnostic metadata is `src/rules/registry.ts`.
`pnpm check:docs-rules` verifies this file against the registry.

The strict Next hexagonal preset is assembled from public layer rulesets:

- `core`
- `application`
- `infrastructure`
- `composition`
- `boundary`
- `ui`
- `testing`

## Diagnostic Registry

| Code | Severity | Layer | Stability | Fixable | Meaning |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ai/emoji-in-code` | error | ui | experimental | yes | Source files should not contain emoji characters. |
| `ai/mock-in-core` | error | core | experimental | yes | Core code must not contain mock implementations. |
| `ai/mock-placement` | warn | testing | experimental | yes | Mock files should live under infrastructure/mocks. |
| `ai/proactive-readme` | warn | composition | experimental | yes | Module README files are treated as proactive documentation drift. |
| `arch/adapter-missing-implements` | error | infrastructure | stable | yes | Adapters should implement a port interface. |
| `arch/adapter-missing-port-import` | error | infrastructure | stable | yes | Adapters should import port interfaces from application/ports or core/ports. |
| `arch/forbidden-folder-core-adapters` | error | core | stable | yes | Adapters must not live under core/adapters. |
| `arch/forbidden-folder-core-rules` | error | core | stable | yes | Application policies must not live under core/rules. |
| `arch/forbidden-folder-core-use-cases` | error | core | stable | yes | Use cases must not live under core/use-cases. |
| `arch/forbidden-folder-db` | error | infrastructure | stable | yes | Module db folders should be replaced by infrastructure/persistence. |
| `arch/forbidden-folder-server` | error | boundary | stable | yes | Module server folders should be replaced by boundary or infrastructure adapters. |
| `arch/forbidden-folder-types` | error | core | stable | yes | Top-level module types folders should be colocated with their owning layer. |
| `arch/missing-application-folder` | error | application | stable | yes | A module is missing application/. |
| `arch/missing-composition-folder` | error | composition | stable | yes | A module is missing composition/. |
| `arch/missing-core-folder` | error | core | stable | yes | A module is missing core/. |
| `arch/missing-infrastructure-folder` | error | infrastructure | stable | yes | A module is missing infrastructure/. |
| `architecture/no-cross-module-infrastructure` | error | infrastructure | stable | yes | Infrastructure code must not import another module infrastructure layer. |
| `ast/core-imports-forbidden` | error | core | experimental | yes | Core code must not import forbidden runtime dependencies. |
| `ast/core-side-effect` | error | core | experimental | yes | Core code must not perform runtime side effects. |
| `ast/manual-literal-union` | warn | core | experimental | yes | Manual literal unions should reuse canonical domain sets. |
| `ast/views-missing-schema-import` | warn | infrastructure | experimental | yes | View schemas should import their backing persistence schema. |
| `composition/cli-entrypoint-forbidden` | error | composition | stable | yes | Runtime code must not import .cli entrypoints. |
| `composition/direct-instantiation` | error | composition | stable | yes | App routes should use composition factories instead of directly instantiating adapters. |
| `composition/factory-naming` | error | composition | stable | yes | Composition factory functions should use accepted factory naming. |
| `composition/missing-cli-counterpart` | error | infrastructure | stable | yes | Persistence combined.ts files need a combined.cli.ts counterpart. |
| `composition/no-barrels` | error | composition | stable | yes | Hexagonal module index barrels are forbidden. |
| `composition/server-actions` | error | boundary | stable | yes | Server Action files must use a use server directive as the first statement. |
| `composition/server-only-placement` | error | composition | stable | yes | server-only must be the first import in pure server modules. |
| `composition/server-only-required` | error | composition | stable | yes | Pure server modules must import server-only before other imports. |
| `contracts/missing` | warn | testing | stable | yes | Application ports should have contract tests. |
| `contracts/summary` | info | testing | stable | no | Contract test coverage summary. |
| `dependency-cruiser-output-snippet` | info | composition | stable | no | Snippet emitted when dependency-cruiser output cannot be parsed. |
| `dependency-cruiser-parse-error` | error | composition | stable | no | dependency-cruiser output must be parseable as JSON. |
| `domain/optional-undefined` | error | core | experimental | yes | Optional domain members should not redundantly union with undefined. |
| `domain/return-undefined` | warn | core | experimental | yes | Domain code should avoid returning bare undefined. |
| `domain/undefined-union` | error | core | experimental | yes | Exported domain types should avoid undefined unions. |
| `domain/view-input-cast` | error | core | experimental | yes | Domain views should avoid _input casts. |
| `domain/z-unknown` | warn | core | experimental | yes | Domain view schemas should prefer explicit shapes over z.unknown(). |
| `drizzle/direct-db-return` | warn | infrastructure | experimental | yes | Database query results should be parsed through views before returning. |
| `drizzle/legacy-adapter` | error | infrastructure | experimental | yes | Legacy server db adapter imports should be replaced by module-owned helpers. |
| `drizzle/manual-z-object` | warn | infrastructure | experimental | yes | Drizzle server actions should reuse generated schemas over manual z.object calls. |
| `drizzle/missing-view-parse` | warn | infrastructure | experimental | yes | Query results should be parsed through a view schema. |
| `drizzle/raw-return` | warn | infrastructure | experimental | yes | Server actions should not return unparsed success payloads. |
| `drizzle/unvalidated-insert` | warn | infrastructure | experimental | yes | Insert values should be validated before persistence. |
| `entity/create-returns-result` | error | core | experimental | yes | Entity factory create methods should return Result. |
| `entity/mutation-returns-result` | error | core | experimental | yes | Entity mutation methods should return Result. |
| `entity/private-constructor` | error | core | experimental | yes | Entities should use private constructors with factories. |
| `mocks/missing` | warn | testing | stable | yes | Application ports should have mock implementations. |
| `mocks/summary` | info | testing | stable | no | Mock coverage summary. |
| `result/adapter-missing-try-catch` | warn | infrastructure | experimental | yes | Adapters should wrap external calls and map failures to Result. |
| `result/no-direct-error-access` | error | application | experimental | yes | Result error access should be guarded by an error branch. |
| `result/no-error-access` | error | application | experimental | yes | Result error access should be narrowed before use. |
| `result/no-throw-in-domain` | error | core | experimental | yes | Core and application layers should return Result instead of throwing. |
| `result/no-value-access` | error | application | experimental | yes | Result value access should be narrowed before use. |
| `result/unsafe-value-access` | warn | application | experimental | yes | Regex fallback detected value access without a nearby Result guard. |
| `rsc/forbidden-import` | error | ui | experimental | yes | Client files must not import server-only modules. |
| `server/action-directive-out-of-place` | error | boundary | experimental | yes | use server directives must be placed correctly. |
| `server/cache-tags-in-server` | warn | boundary | experimental | yes | Cache tags should not be declared in server action modules. |
| `server/module-level-use-server` | error | boundary | experimental | yes | Module-level use server directives are restricted to server action files. |
| `structure/summary` | info | composition | stable | no | Canonical module structure summary. |
| `structure/missing` | error | composition | stable | yes | A module is missing mandatory canonical folders. |
| `structure/optional-missing` | warn | composition | stable | yes | A module is missing optional canonical folders. |
| `tool/missing-gitleaks` | warn | tool | stable | yes | The gitleaks binary is not available. |
| `tool/missing-package-script` | error | tool | stable | yes | A plugin expected a package.json script that does not exist. |
| `validator/required-plugin-skipped` | error | tool | stable | yes | Strict preset plugins marked as required cannot be skipped. |

## Policy

- `hex-validate fast/full/ci` are read-only.
- Required plugins in the strict preset fail if skipped.
- Optional plugins may skip only with an explicit status and message.
- JSON output is the stable agent-facing interface and evolves additively.
