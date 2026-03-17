# Vishnu → OpenGem Plugin Architecture Migration (Non-Destructive)

## Summary
Add OpenGem-style SDK types and plugin validation, introduce slot/module registries and a plugin loader, then layer new `modules/` wrappers (tools/codeman/katana) on top of the existing Vishnu menus. Wire plugin boot before `Engine.start()`, and inject DevDojo plugin contributions via the slot registry. Update workspace config and add a minimal `vishnu.manifest.json`.

## Key Changes
1. SDK types + validation
- Add SDK types copied from OpenGem:
  - `packages/sdk/src/types/menu.ts` (from OpenGem `packages/sdk/src/types/menu.ts`)
  - `packages/sdk/src/types/action.ts` (from OpenGem `packages/sdk/src/types/action.ts`)
  - `packages/sdk/src/types/plugin.ts` (from OpenGem `packages/sdk/src/types/plugin.ts`, add `maintenance` to `DevDojoContributionSchema`, and add `validatePluginManifest` helper from `schemas/plugin.schema.ts`)
- Add `packages/sdk/src/index.ts` exporting the types.
- Add `packages/sdk/package.json` with `zod` dependency.

2. Platform registries
- Create slot registry from OpenGem with one Vishnu extension:
  - `packages/platform/src/engine/slot-registry.ts` (copy OpenGem, add slot `devdojo.maintenance` and matching `SLOTS` entry).
- Create engine schema locally to satisfy module registry types:
  - `packages/platform/src/engine/engine-schema.ts` (copy from OpenGem `schemas/engine-schema.ts`).
- Copy module registry and retarget imports:
  - `packages/platform/src/engine/module-registry.ts` (copy OpenGem, swap `@opengem/schemas/engine-schema` to local `engine-schema.ts`).
- Add `packages/platform/src/index.ts` to export the new engine pieces.
- Add `packages/platform/package.json`.

3. Runtime plugin loader
- Add `packages/runtime/src/engine/plugin-loader.ts` copied from OpenGem with these edits:
  - Default `extensionsDir` to `path.join(process.cwd(), 'modules')`.
  - Import `validatePluginManifest` + `PluginManifest` from the new SDK types.
  - Import `slotRegistry` from `packages/platform`.
  - Register slot contributions for both `contributes.menus` and `contributes.devdojo` (map `category` to `devdojo.${category}` including `maintenance`).
  - Keep OpenGem’s error handling and debug logging.
- Add `packages/runtime/src/index.ts` (minimal exports) and `packages/runtime/package.json`.

4. Modules and plugin manifests
- Create `modules/` and add:
  - `modules/tools/plugin.json` (per RFC, with `contributes.devdojo`, `screens`, `actions`).
  - `modules/codeman/plugin.json` (no `main` to avoid importing `interactive-cli.ts`).
  - `modules/katana/plugin.json` (no `main`; contributions point to existing `katana` menu + `createKatanaScript` handler).
- Implement tools module routes as MenuNodes registered directly:
  - `modules/tools/index.ts` exports `registerRoutes()` and calls `registry.register(...)` for `tools` root and `tools:*` menus, plus `registry.registerScript(...)` for tool actions.
  - Menu definitions can live in `modules/tools/router/**` and be wrapped with `createSchemaMenu(...)` when registering.
  - Action handlers in `modules/tools/cli/router/**` bridge to existing scripts via `registry.getScript('maintRunTests')`, etc.

5. Boot and DevDojo integration
- Update `codeman/interactive-cli.ts`:
  - Add `bootPlugins()` after existing menu/script registration and before `engine.start(startNode)`.
  - Use `PluginLoader` with `extensionsDir` rooted to the Vishnu repo, not `process.cwd()`.
  - Use `pathToFileURL` when importing plugin main on Windows, then call `registerRoutes()` if present.
  - Keep try/catch so failures are non-fatal.
- Update `codeman/menus/definitions/dev-dojo-menu.ts`:
  - Append slot registry contributions at the end (before the final back separator), mapping to `navigate` or `script` actions.

6. Repo wiring
- Add `vishnu.manifest.json` as a minimal stub (id/name/version).
- Update `package.json` to add `workspaces: ["packages/*"]`.
- Update `tsconfig.json` include to cover `packages/**/*.ts` and `modules/**/*.ts`.

## Test Plan
1. `npx tsx -e "import('./packages/sdk/src/index.ts')"` from repo root to validate SDK load.
2. `npm run lint` to ensure TypeScript passes with new paths included.
3. `npm run codeman` and confirm DevDojo shows plugin sections (scripts/tools/maintenance).
4. `vishnu tools` to verify direct launch into the tools root menu.

## Assumptions
- Use `tools` as the root menu id so `vishnu tools` works without extra CLI mapping.
- `modules/codeman` and `modules/katana` do not specify a `main` entry to avoid importing `interactive-cli.ts`; they only contribute to DevDojo via `plugin.json`.
- Emoji labels are acceptable in new plugin manifests to match existing menu style.
- Relative imports between new packages are acceptable even before a full workspace install; workspace wiring is for future package resolution.
