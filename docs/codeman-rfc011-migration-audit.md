# Codeman RFC-011 Migration Audit

This repository is in a phased RFC-011 migration.

## Current source-of-truth shape

- `modules/codeman` now owns the RFC-shaped public surfaces:
  - `index.ts`
  - `backend/*`
  - `router/*`
  - `cli/router/*`
  - `schemas/index.ts`
  - `components/*`
- Top-level entrypoints launch through `modules/codeman`.
- Shared low-level runtime ownership has started moving into packages:
  - `packages/platform` now owns `io`, `state`, `registry`, and menu runtime types.
  - `packages/runtime` now owns the schema-menu factory and interactive engine.
- `modules/codeman/components/*` and `modules/codeman/schemas/*` now contain the active Codeman component and schema implementations.

## Intentional legacy shims

These legacy areas still contain live implementation or compatibility bridges and are intentionally wrapped by module surfaces:

- `codeman/interactive-cli.ts`
- `codeman/config/menu-map.ts`
- `codeman/core/auth*.ts`
- `codeman/core/firebase-manager.ts`
- `codeman/core/process-manager.ts`
- `codeman/core/restart.ts`
- `codeman/core/users-manager.ts`
- `codeman/managers/*`
- `codeman/menus/*`
- `codeman/utils/*`
- `codeman/adapters/*`

These legacy files are now shims and no longer own the implementation:

- `codeman/core/io.ts`
- `codeman/core/state.ts`
- `codeman/core/types.ts`
- `codeman/core/registry.ts`
- `codeman/core/schema-factory.ts`
- `codeman/core/engine.ts`
- `codeman/components/*`
- `codeman/schemas/*`

## Cross-module migration status

- `modules/tools` now imports Codeman services through `modules/codeman/backend/*`.
- `modules/katana` remains out of scope for this migration wave.

## Deletion gates

A legacy Codeman slice is only safe to delete when all of the following are true:

1. No non-shim runtime import points to that legacy slice.
2. The corresponding module-backed surface exists in `modules/codeman`.
3. Parity checks pass for the affected flow.

## Planned deletion slices

- CLI slice: legacy CLI parsing and flag dispatch
- Router slice: legacy menu graph and screen registration
- Auth/session slice: auth, token, session, project-open flows
- Deploy/build slice: release, deploy prep, build/test orchestration
- Utility/adapter slice: process, IO, config, network, filesystem helpers
