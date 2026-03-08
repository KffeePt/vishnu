# RFC-018: Platform API Bridge

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---


**Status**: Draft
**Created**: 2026-02-05
**Context**: Architecture Refactor
**See Also**: [RFC-015: Framework Specification](./rfc-015-framework-specification.md)

## Abstract
This RFC establishes `@opengem/platform/api` (located in `codeman/platform/api`) as the definitive bridge between the "Platform" (Plugin Development Kit) and the "Runtime" (Execution Environment). It enforces a strict separation where developers interact **only** with the Platform API, which in turn acts as a facade for the underlying Runtime services (`IO`, `State`, `Render`, `Registry`).

## Motivation
Currently, modules and plugins often import directly from `@opengem/runtime/*` or deep relative paths. This creates tight coupling and makes it difficult to:
1.  **Isolate Execution**: If we move the runtime to a worker thread or separate process, direct imports break.
2.  **Mock/Test**: Hard dependencies on the concrete Runtime make unit testing plugins difficult.
3.  **Stability**: Runtime internal APIs change, but the Platform API should be stable.

## Architecture

```mermaid
graph TD
    UserPlugin[User Plugin / Module] --> |Imports| PlatformAPI[@opengem/platform/api]

    subgraph "Platform API Facade"
        PlatformAPI --> |Delegates| IO_API[IO API]
        PlatformAPI --> |Delegates| State_API[State API]
        PlatformAPI --> |Delegates| Render_API[Render API]
        PlatformAPI --> |Delegates| Registry_API[Registry API]
    end

    subgraph "Runtime (Kernel)"
        IO_API -.-> |IPC / Direct| RuntimeIO[Runtime IO]
        State_API -.-> |IPC / Direct| RuntimeState[Runtime State]
        Render_API -.-> |IPC / Direct| RuntimeRender[Runtime Render]
        Registry_API -.-> |IPC / Direct| RuntimeRegistry[Runtime Registry]
    end
```

## Implementation Details

### 1. `codeman/platform/api/index.ts`
The main entry point exporting strict namespaces:

```typescript
export * as io from './io';
export * as state from './state';
export * as render from './render';
export * as registry from './registry';
```

### 2. Facade Pattern
Each API module checks the execution context (e.g., `Thread`, `Process`, `Local`) and routes the call to the appropriate Runtime service.

**Example: `codeman/platform/api/io.ts`**
```typescript
import { io as runtimeIO } from '@opengem/runtime/io';

export const io = {
    // Stable Public API
    confirm: async (msg: string) => runtimeIO.confirm(msg),
    select: async (msg: string, opts: any[]) => runtimeIO.select(msg, opts),
    // ...
};
```

## Migration Strategy
1.  Create `codeman/platform/api` structure.
2.  Point `@opengem/platform/api` alias to `codeman/platform/api/index.ts`.
3.  Update the Linter (RFC-013) to **ban** imports from `@opengem/runtime/*` in Plugins/Modules, requiring `@opengem/platform/api` instead.

## Future Proofing
This abstraction allows us to replace the underlying Runtime with a version that communicates over `stdout/stdin` (for subprocesses), WebSockets (for remote kernels), or Worker messaging without changing a single line of Plugin code.
