# RFC-006: Tiered Reload Architecture

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2026-02-11
**Version:** 2.0.0
**Supersedes:** RFC-006 (v1)

---

## 1. Problem Statement

The previous hot reload system treated all file changes identically — every detected change triggered the same generic `reload` event, causing the active List component to re-resolve and the router to re-loop. There was no distinction between:

- A menu label change (trivial, UI-only)
- A module schema change (moderate, requires module re-import)
- A runtime core change (critical, requires full process restart)

Additionally:
- Module-level `.env` files were not monitored
- Root `.env` changes were not detected
- Backend logic changes should trigger heavier reloads than UI changes
- There was no lifecycle hook system for modules to participate in teardown/reinit

This RFC defines a **tiered reload model** that isolates risk and cost by classifying changes into layers with increasing blast radius.

---

## 2. Goals

1. Define four reload tiers with ordered escalation
2. Classify file changes by module layer → reload tier
3. Preserve state across lower-tier reloads
4. Support module-level `.env` and root `.env` hot reload
5. Provide lifecycle hooks (`onInit`, `onReload`, `onUnload`) for modules
6. Expose a `reload(tier)` API and CLI command
7. Maintain backward compatibility with existing restart flow

---

## 3. Non-Goals

1. GUI/Flutter hot reload (handled by Flutter's own mechanism)
2. Cross-process reload (multi-agent orchestration)
3. Distributed reload across network nodes (Deferred to Gateway RFC)
4. Production hot-patching (this is a development tool)

---

## 4. Tier Model

### Tier 0 — UI Reload

**Trigger:** Changes to `components/`, `router/`, menu definitions, `.css`, layout files.

**Reloads:**
- Menu definitions (re-imported with cache bust)
- Component render functions
- Router navigation bindings
- Layout and styling

**Preserves:**
- Runtime state (`GlobalState`)
- Module backend state
- Active connections
- Process

**Mechanism:** `registry.emitReload('*')` → List re-resolves → router re-loops with fresh `import(?t=...)`.

---

### Tier 1 — Module Reload

**Trigger:** Changes to `backend/domain/`, `schemas/`, module-level `.env`, `backend/infra/` (adapters).

**Reloads:**
- Everything in Tier 0
- Module backend domain logic
- Module schemas
- Module infrastructure adapters
- Module environment variables

**Preserves:**
- Core runtime loop
- Platform services
- Other modules (non-dependent)
- Process

**Mechanism:** Module lifecycle: `onUnload()` → invalidate → re-import → `onInit()`. Dependent modules cascade-reload via dependency graph.

---

### Tier 2 — Runtime Reload

**Trigger:** Changes to `packages/runtime/`, `packages/platform/`, root `.env`, `schemas/` (global tier-1).

**Reloads:**
- Everything in Tier 0 and Tier 1
- Execution engine
- State handlers (soft reset)
- Router bindings

**Preserves:**
- Process
- Logs
- File watchers

**Mechanism:** Soft teardown: `io.reset()` + clear screen + re-navigate from welcome. Process stays alive.

---

### Tier 3 — Full Restart

**Trigger:** Changes to `packages/platform/src/io/`, process-level config, or manual `restart` command.

**Reloads:**
- Everything — full process exit and re-exec

**Mechanism:** `process.exit()` and re-exec via external supervisor, or `state.shouldRestart` + loop continuation.

---

## 5. File → Tier Classification

| Path Pattern | Tier | Rationale |
|---|---|---|
| `modules/*/components/**` | 0 | Pure UI rendering |
| `modules/*/router/**` | 0 | Navigation orchestration |
| `modules/*/router/menu-definitions.*` | 0 | Menu structure |
| `modules/*/backend/domain/**` | 1 | Business logic |
| `modules/*/backend/infra/**` | 1 | Adapters, persistence |
| `modules/*/schemas/**` | 1 | Module-local types |
| `modules/*/skills/**` | 1 | Agent entry points |
| `modules/*/.env` | 1 | Module environment |
| `modules/*/cli/**` | 1 | CLI entry points |
| `schemas/**` (global) | 2 | Global type definitions |
| `packages/runtime/**` | 2 | Core runtime |
| `packages/platform/**` (non-io) | 2 | Platform services |
| `.env` (root) | 2 | Global environment |
| `packages/platform/src/io/**` | 3 | stdin/stdout lifecycle |
| `tsconfig.*` | 3 | Build config |
| `package.json` | 3 | Dependencies |

---

## 6. Architecture Changes

### 6.1 ReloadTier Enum

```typescript
// schemas/engine-schema.ts (addition)
export enum ReloadTier {
    UI = 0,       // Tier 0 — menus, components, router
    MODULE = 1,   // Tier 1 — backend, schemas, skills, .env
    RUNTIME = 2,  // Tier 2 — platform, runtime core, root .env
    FULL = 3,     // Tier 3 — full process restart
}
```

### 6.2 Reload Manager

```
packages/runtime/src/reload/
  reload-manager.ts    — Orchestrates tiered reload
  tier-classifier.ts   — Maps file paths to ReloadTier
  types.ts             — ReloadTier enum, lifecycle interfaces
```

**ReloadManager API:**

```typescript
class ReloadManager extends EventEmitter {
    reload(tier: ReloadTier): Promise<void>;
    classifyChange(filePath: string): ReloadTier;
    registerModule(id: string, hooks: ModuleLifecycleHooks): void;
    unregisterModule(id: string): void;
}
```

### 6.3 Module Lifecycle Hooks

```typescript
interface ModuleLifecycleHooks {
    onInit?(): Promise<void>;
    onReload?(tier: ReloadTier): Promise<void>;
    onUnload?(): Promise<void>;
}
```

Modules register hooks at startup. When a Tier 1+ reload is triggered, `onUnload()` is called in reverse-dependency order, then `onInit()` in forward-dependency order.

### 6.4 Coordinator Integration

The existing `HotReloadCoordinator` changes:

1. `requiresFullRestart()` → replaced by `tierClassifier.classify(path)`
2. Events become tier-aware: `emit('reload', { tier, module, ... })`
3. `.env` file patterns added to watcher include list

### 6.5 .env File Monitoring

**Watcher changes:**
- Include pattern: `**/.env` added to default include list
- Root `.env` monitored separately via dedicated watcher instance or added to coordinator scope
- Module `.env` classified as Tier 1
- Root `.env` classified as Tier 2

**Runtime integration:**
- On `.env` change detection, `dotenv.config({ override: true })` is called to refresh `process.env`
- Module-level `.env` is loaded via a module-scoped env loader

---

## 7. Runtime Flow

### Tier 0 Flow (UI Reload)

```
FileChange detected
  → tierClassifier.classify() → Tier 0
  → registry.emitReload('*')
  → List resolves with '__HOT_RELOAD__'
  → Router re-loops with fresh import(?t=...)
  → No state mutation
```

### Tier 1 Flow (Module Reload)

```
FileChange detected
  → tierClassifier.classify() → Tier 1
  → reloadManager.reload(MODULE)
    → Identify affected module from path
    → Call module.onUnload()
    → Invalidate module cache (Bun/ESM cache bust)
    → Re-import module
    → Call module.onInit()
    → registry.emitReload('*')
  → Active UI refreshes
```

### Tier 2 Flow (Runtime Reload)

```
FileChange / root .env change detected
  → tierClassifier.classify() → Tier 2
  → reloadManager.reload(RUNTIME)
    → All modules: onUnload() in reverse order
    → io.reset() (soft — keep stdin attached)
    → Reload dotenv
    → Re-import runtime modules
    → All modules: onInit() in forward order
    → Navigate to welcome screen
```

### Tier 3 Flow (Full Restart)

```
FileChange / manual restart
  → tierClassifier.classify() → Tier 3
  → state.shouldRestart = true
  → emitReload('*') to force List resolution
  → CLI loop: io.reset() → clear → restart splash → re-navigate
```

---

## 8. Failure Modes

| Failure | Risk | Mitigation |
|---|---|---|
| Module `onUnload()` throws | Medium | Catch, log, continue teardown. Mark module as dirty |
| Dynamic import fails after change | High | Catch, emit error overlay, keep previous module version cached |
| `.env` parse error | Low | Log warning, keep previous env values |
| Circular dependency detected | Medium | Escalate to Tier 3 (full restart) |
| Reload during active task | High | Queue reload until `state.isBusy === false` |
| Partial state corruption | Medium | Tier 2+ resets GlobalState to defaults where safe |

---

## 9. Safety Guarantees

1. **State preservation:** Tiers 0-1 never mutate `GlobalState` fields
2. **Ordered teardown:** `onUnload()` always called before module invalidation
3. **Fail-closed:** If classification is ambiguous, escalate to next tier
4. **Busy guard:** No reload while `state.isBusy === true` — queued until idle
5. **Audit trail:** Every reload event logged to `logs/reload/` with tier, timestamp, affected files
6. **No silent data loss:** `.env` reload does not clear existing variables, only overrides changed ones

---

## 10. Migration Strategy

### Phase 1 (Initial Implementation)
- Add `ReloadTier` enum to `engine-schema.ts`
- Implement `tier-classifier.ts` (path → tier mapping)
- Modify `coordinator.ts` to use tier classification instead of `requiresFullRestart()`
- Add `.env` patterns to watcher include list
- Wire coordinator tier events → CLI handler
- Fix existing bugs (double-restart, ANSI wrapping, flicker)

### Phase 2 (Follow-up)
- Implement `ReloadManager` with full lifecycle hooks
- Add `ModuleLifecycleHooks` interface and module registration
- CLI command: `opengem reload --tier ui|module|runtime`
- Selective reload triggers based on dependency graph diff
