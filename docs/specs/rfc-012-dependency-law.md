# RFC-012: Dependency Law

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC defines the **Dependency Law**, a non-negotiable set of architectural invariants that govern how modules, layers, and components interact within the platform. These rules ensure long-term stability, testability, and deterministic behavior.

---

## 2. Platform-Level Flow

```
platform (kernel, schemas, base-utils)
        ↓
modules/core
        ↓
modules/<plugin>
```

---

## 3. Module-Internal Flow

```
router (TUI screens)
   ↓
components (pure UI)
   ↓
backend (logic, state, side effects)
```

---

## 4. Absolute Rules

* Dependencies flow **downward only**
* Control flows upward **only via data or events**
* `components/` NEVER import `backend/`
* `cli/` NEVER imports `components/` or `router/`
* `router/` is the ONLY layer allowed to touch both UI and backend
* `skills/` may import `backend/` but never UI or router

If these rules hold, the system remains stable indefinitely.
