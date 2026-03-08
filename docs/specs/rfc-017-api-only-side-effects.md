# RFC-017: API-Only Side Effects & Component Purity

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC establishes a strict frontend/backend contract where:
1. **Components are pure** — no side effects, no async IO, no imports from utils/runtime
2. **Routers are bridges** — the only place UI intent is translated to API calls
3. **APIs own effects** — all side effects must flow through declared `defineApi` handlers

---

## 2. Core Rules

### 2.1 Component Purity (Frontend)

**Applies to:** `modules/**/components/**`, `platform/components/**`

| MUST | MUST NOT |
|------|----------|
| Be pure TSX | Import `utils/` |
| Accept props | Import `platform/api` |
| Emit events/callbacks | Import `runtime/` |
| No side effects | Import Node builtins |
| No async IO | Mutate global state |

**Enforcement:** Linter rule `component-purity.ts`

### 2.2 Router as UI→API Bridge

**Applies to:** `modules/**/router/**`, `platform/navigation/**`

Routers MAY:
- Import components
- Import `@opengem/platform/api`
- Dispatch actions, handle async

Routers MUST NOT:
- Implement business logic (delegate to utils)
- Access fs/network directly

### 2.3 API-Only Side Effects (Backend)

**Side effects include:** filesystem, network, process exec, containers, IPC, persistent state

**Rule:** Any code touching reality MUST be reachable via a declared API.

```ts
// ✅ Correct: Side effect wrapped in API
defineApi({
  fs: {
    readFile: {
      capabilities: ['fs:read'],
      handler: async (ctx, { path }) => Bun.file(path).text()
    }
  }
});

// ❌ Wrong: Direct side effect in util
export function readConfig() {
  return fs.readFileSync(...); // Not API-wrapped!
}
```

---

## 3. defineApi Contract

```ts
import { defineApi } from '@opengem/platform/api';

export const myApi = defineApi({
  namespace: {
    actionName: {
      input: z.object({ path: z.string() }),
      output: z.string(),
      capabilities: ['fs:read'],
      handler: async (ctx, input) => {
        // Side effect allowed here
        return await Bun.file(input.path).text();
      }
    }
  }
});
```

The API layer provides:
- **Capability enforcement** — validates plugin.json declarations
- **Input/output validation** — via Zod schemas
- **Logging & auditing** — automatic call tracing
- **Future sandboxing** — isolation-ready design

---

## 4. Capability System

Plugins declare capabilities in `plugin.json`:

```json
{
  "name": "my-plugin",
  "capabilities": ["fs:read", "network", "container:spawn"]
}
```

Runtime validates:
- API calls match declared capabilities
- Undeclared usage is warned/blocked

---

## 5. Platform Components (shadcn-Style)

`platform/components/` provides a prepackaged library:

```ts
import { Box, Text, Spinner } from '@opengem/platform/components';
```

Users may:
- Import directly
- Copy into their module
- Extend or replace freely

All components follow purity rules.

---

## 6. Migration

1. Add linter rules for component purity
2. Add linter rules for API-only effects
3. Create `defineApi` utility
4. Migrate existing APIs incrementally
5. Update plugin.json templates with capability declarations

---

## 7. Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Pure components | Import restrictions |
| Controlled effects | defineApi + capabilities |
| Auditable | API logging |
| Testable | Mocked API handlers |
| Future-proof | IPC-ready facade |

---

**End RFC-017**
