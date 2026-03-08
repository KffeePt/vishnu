# RFC-013: OpenGem Custom Linter Laws

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---


**Status**: Draft
**Created**: 2026-02-05

## Summary

This RFC defines the strict architectural constraints enforced by the OpenGem Custom Linter. These laws ensure codebase consistency, maintainability, and strict decoupling between layers.

## 1. Platform-Level Flow (Dependency Law)

The architecture follows a strict downstream dependency flow. Higher layers can depend on lower layers, but not vice-versa (with specific exceptions).

**Flow:**
`platform` (kernel, schemas, base-utils) → `modules/core` → `modules/<plugin>`

### Rules:
1.  **Platform Isolation**: `codeman/platform` cannot import from `codeman/modules`.
2.  **Core Primacy**: `modules/core` cannot import from other sibling modules (e.g., `modules/tools`, `modules/shiva`). use `dev-dojo` dynamic imports for loose coupling if needed.
3.  **Plugin Dependency**: Plugins (any module other than `core`) can import from `platform` and `modules/core`, but **cannot** import from other plugins directly (unless shared via `core` contracts).

## 2. Module-Internal Flow (Nesting Law)

Within any module (e.g., `codeman/modules/tools`, or `~/.opengem/plugins/my-plugin`), strict layering is enforced.

**Flow:**
`router` (TUI screens) → `components` (pure frontend UI) → `utils` (backend logic, state, services)

### Rules:
1.  **Router Layer**:
    - Can import from `components` and `utils`.
    - Contains TUI entry points.
2.  **Components Layer**:
    - Can import from `utils`.
    - **CANNOT** import from `router` (circular dependency).
    - Should be pure UI logic where possible.
3.  **Utils Layer**:
    - **CANNOT** import from `router` or `components`.
    - Contains pure business logic, state management, and services.
4.  **Exception**:
    - `router/menu` and any `[plugin_name]/skills/execute`, `[plugin_name]/utils/internal`,
      `[plugin_name]/utils/external` (or `menu.ts`) is allowed flexibility to define data structures
      that might reference actions (utils) or UI config (components) and the those `[plugin_name]/
      utils` folders are allowed flexibility to define folder structures only the frontend and router
      still import from utils.

## 3. Folder Naming Convention (New)

Strict naming for `utils/` subdirectores is enforced to clarify intent:

- **`utils/internal`**: (Formerly `actions`) Contains user intents, command logic, and internal capabilities.
- **`utils/external`**: (Formerly `services`) Contains external service integrations, database clients, and cloud provider adapters.

## 4. Plugin Compliance

All external plugins located in `~/.opengem/plugins` must adhere to the **Module-Internal Flow**.
- The linter will scan these directories and flag violations.
- Non-compliance may prevent the plugin from loading in future versions.

## 5. Implementation

The linter will be located in `linter/` and exposed via the Tools CLI.
It acts as the single source of truth for architectural validity.
