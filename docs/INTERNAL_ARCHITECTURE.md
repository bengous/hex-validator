# Internal Architecture

`hex-validator` is organized around product responsibilities, not around the architecture it
validates.

## Main Areas

- `src/cli`: command parsing, config loading, init scaffolding.
- `src/core`: orchestration, git state, caching, tool detection, pnpm runner, reporters.
- `src/plugins`: concrete validators and external tool integrations.
- `src/rulesets`: public layer rulesets and strict preset assembly.
- `src/rules`: public diagnostic registry.
- `src/validators`: standalone validators exported through `hex-validator/validators/*`.
- `examples/next-hexagonal`: product proof for the strict Next hexagonal preset.

## Boundaries

- Public API is exported from `hex-validator`, `hex-validator/configs`, and
  `hex-validator/validators/*`.
- Internal engine paths are private.
- Plugins must respect the provided `cwd`.
- CLI validation commands are read-only.

## Validation Strategy

- `pnpm check` validates package quality.
- `pnpm validate:example` dogfoods the strict preset on the example app.
- `pnpm test:pack` tests the built tarball from a temporary consumer project.
