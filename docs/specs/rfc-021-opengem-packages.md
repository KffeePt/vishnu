# RFC-021: Packages Architecture and SDK Structure

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Summary

This RFC defines a **formal packages architecture** for OpenGem that separates:

1. **Runtime** (execution engine and core orchestration)
2. **Platform** (UI, navigation, IPC, rendering, environment abstractions)
3. **SDK** (developer-facing APIs for plugins, agents, skills, and tools)
4. **Applications and Tools** (end-user applications and tools)
5. **Plugins and Modules** (plugins and modules)

The objective is to:

* enforce dependency direction
* enable independent builds
* allow headless runtimes
* allow multiple frontends (TUI, GUI, Web)
* stabilize developer APIs via SDK

---

## 2. Motivation

Current structure shows strong modularization but:

Problems observed:

* runtime and platform concerns partially mixed
* internal APIs used directly by tools/plugins
* no stable SDK boundary
* difficult to extract headless runtime
* unclear dependency rules between modules

This RFC introduces:

* strict layering
* stable SDK surface
* clear package boundaries
* future workspace-friendly structure

---

## 3. Goals

The architecture must:

1. Allow runtime to run without UI
2. Allow multiple platforms to coexist
3. Provide a stable SDK
4. Enforce dependency direction
5. Enable plugin isolation
6. Support future remote runtimes

---

## 4. Non-Goals

This RFC does NOT define:

* plugin sandboxing implementation
* transport protocols
* build system choice (bun/npm/pnpm)

---

## 5. Layered Architecture

The system is divided into layers:

```
Applications / Tools
        ↓
SDK
        ↓
Runtime
        ↓
Platform (optional dependency for runtime adapters)
        ↓
Infrastructure / OS
```

Dependency rule:

A layer may only depend on layers below it.

---

## 6. Package Categories

### 6.1 Runtime Packages

Runtime is responsible for:

* agent loop
* orchestration
* execution engine
* module loading
* state containers
* capability resolution

Runtime must NOT depend on:

* UI components
* terminal rendering
* platform navigation
* Flutter or GUI systems

Runtime MAY depend on:

* platform adapters via interfaces only

---

### 6.2 Platform Packages

Platform provides:

* rendering
* navigation
* IPC
* input handling
* layout
* session handling

Platform must not depend on:

* tools
* plugins
* skills

Platform may depend on:

* runtime interfaces only

---

### 6.3 SDK Packages

SDK provides stable APIs for:

* creating skills
* creating plugins
* writing agents
* interacting with runtime

SDK wraps runtime internals and exposes:

* typed APIs
* safe helpers
* stable contracts

SDK must never expose:

* internal engine state
* registries directly
* private loaders

---

### 6.4 Applications

Examples:

* codeman
* shiva
* katana
* tools CLI

Applications orchestrate:

* SDK
* platform
* runtime

They should not access runtime internals directly.

---

### 6.5 Plugins and Modules

Plugins:

* depend on SDK only
* never depend on runtime internals
* never depend on platform internals

---

## 7. Proposed Folder Structure

Recommended high-level structure:

```
packages/
 ├── runtime/
 ├── platform/
 ├── sdk/
 ├── apps/
 ├── plugins/
 └── shared/
```

---

## 8. Runtime Package Structure

```
packages/runtime/
 ├── engine/
 ├── agents/
 ├── lifecycle/
 ├── registry/
 ├── state/
 ├── execution/
 ├── contracts/
 └── index.ts
```

### Responsibilities

Engine:

* coordinator
* loader
* watcher

Agents:

* base agent
* orchestrator

Registry:

* module registry
* slot registry

State:

* containers
* sessions

Contracts:

* types shared with SDK

---

## 9. Platform Package Structure

```
packages/platform/
 ├── api/
 ├── navigation/
 ├── rendering/
 ├── layout/
 ├── input/
 ├── session/
 ├── ipc/
 ├── components/
 └── index.ts
```

Platform provides adapters:

```
runtime ↔ platform adapter
```

This prevents runtime importing UI logic.

---

## 10. SDK Package Structure

The SDK is a stable public API.

```
packages/sdk/
 ├── agent/
 ├── skill/
 ├── plugin/
 ├── runtime-client/
 ├── navigation/
 ├── storage/
 ├── ui/
 ├── types/
 └── index.ts
```

---

## 11. SDK Responsibilities

SDK must provide:

### 11.1 Agent API

Example:

```
createAgent()
defineLifecycle()
registerCapability()
```

---

### 11.2 Skill API

Example:

```
defineSkill()
defineCapability()
defineExecutor()
```

---

### 11.3 Plugin API

Example:

```
definePlugin()
defineRoutes()
defineMenus()
```

---

### 11.4 Runtime Client

SDK exposes safe runtime access:

```
runtime.execute()
runtime.navigate()
runtime.getState()
```

No direct registry access allowed.

---

## 12. Shared Package

Shared contains:

```
packages/shared/
 ├── types/
 ├── logger/
 ├── errors/
 └── utils/
```

Rules:

* no runtime logic
* no platform logic

Only pure utilities.

---

## 13. Dependency Rules

Strict rules:

| Package  | Allowed Dependencies      |
| -------- | ------------------------- |
| shared   | none                      |
| runtime  | shared                    |
| platform | shared, runtime contracts |
| sdk      | runtime contracts, shared |
| apps     | sdk, platform             |
| plugins  | sdk                       |

Forbidden:

```
plugin → runtime/internal
platform → apps
runtime → UI components
```

---

## 14. Dependency Direction Diagram

```
apps
  ↓
sdk
  ↓
runtime
  ↓
shared
```

Platform sits beside runtime:

```
runtime ←→ platform (through adapters)
```

---

## 15. Naming Conventions

Packages must use prefixes:

```
@opengem/runtime
@opengem/platform
@opengem/sdk
@opengem/shared
@opengem/plugin-*
@opengem/app-*
```

---

## 16. Build Strategy

Each package:

* independent tsconfig
* independent build
* exports map
* strict public API

---

## 17. Runtime Isolation Strategy

Runtime must:

* run headless
* run in containers
* run without TUI

This enables:

* remote execution
* server mode
* automation mode

---

## 18. SDK Stability Rules

SDK APIs:

* must be versioned
* must not expose experimental runtime internals
* must provide migration paths

---

## 19. Migration Plan

Step 1:
Extract runtime from platform engine.

Step 2:
Create runtime contracts package.

Step 3:
Move developer APIs into sdk.

Step 4:
Refactor plugins to use sdk only.

Step 5:
Add linter rule:

```
no-import-runtime-in-plugins
```

---

## 20. Linter Rules

New rules required:

1. Layer violation rule
2. SDK boundary rule
3. Internal import ban

---

## 21. Example Final Layout

```
packages/
 ├── runtime/
 ├── platform/
 ├── sdk/
 ├── shared/
 ├── app-codeman/
 ├── app-shiva/
 ├── plugin-tools/
 └── plugin-katana/
```

---

## 22. Future Extensions

Planned:

* remote runtime
* cloud execution
* distributed agents
* WASM runtime mode

This architecture enables all of them.

---

## 23. Acceptance Criteria

RFC accepted when:

* runtime builds standalone
* sdk usable without platform
* plugins compile without runtime imports
* apps depend only on sdk + platform

---

## 24. Conclusion

This RFC establishes:

* clear runtime boundary
* stable SDK
* strict layering
* future scalability

It prepares OpenGem for:

* large plugin ecosystems
* remote runtimes
* multi-UI environments

