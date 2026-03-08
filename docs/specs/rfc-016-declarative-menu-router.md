# RFC-016: Declarative Menu Router Architecture

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC formalizes the **file-system based declarative menu discovery** pattern for the TUI router. The core principle is **folder = node**: each directory in `router/main/` represents a menu item, and nested directories represent submenus.

---

## 2. Motivation

The previous approach stored screens in `utils/legacy-screens/`, mixing backend logic with routing concerns. This violated RFC-011's separation of concerns and made the menu tree structure implicit rather than explicit.

**Problems with legacy approach**:
- Menu structure not discoverable from file system
- Screens scattered across multiple directories
- No single source of truth for menu hierarchy
- Difficult to add/remove menu items

**Solution**: Move all menu screens to `router/main/` where the directory structure *is* the menu structure.

---

## 3. Design Principles

1. **Folder = Node**: Each directory with a `menu.ts` becomes a menu node
2. **Auto-Discovery**: The engine recursively discovers all `menu.ts` files
3. **Declarative First**: Menu metadata (label, icon, visibility) defined in `menu.ts`
4. **Render Separation**: The `index.ts` handles rendering, `menu.ts` handles metadata

---

## 4. Directory Structure

```
modules/core/router/
├── menu.ts              # ROOT node
├── welcome/
│   └── index.ts         # Welcome screen renderer
├── auth/
│   └── index.ts         # Auth screen renderer
├── main/
│   ├── menu.ts          # Main dashboard submenu
│   ├── index.ts         # Main screen renderer
│   ├── launcher/
│   │   ├── menu.ts      # Launcher submenu node
│   │   ├── index.ts     # Launcher renderer
│   │   ├── create-project/
│   │   │   ├── menu.ts
│   │   │   └── index.ts
│   │   └── open-project/
│   │       ├── menu.ts
│   │       └── index.ts
│   ├── settings/
│   │   ├── menu.ts
│   │   └── index.ts
│   └── project/
│       ├── menu.ts
│       └── index.ts
├── loading/
│   └── index.ts
├── idle/
│   └── index.ts
├── debug/
│   └── index.ts
├── restart/
│   └── index.ts
└── exit/
    └── index.ts
```

---

## 5. menu.ts Schema

Each `menu.ts` exports a `MenuSchema` object:

```ts
import type { MenuSchema } from '@opengem/schemas/menu-schema';

export const menu: MenuSchema = {
    id: 'unique-id',           // Required: unique identifier
    label: '🏠 Label',         // Required: display text
    type: 'submenu' | 'action',// Required: node type
    order?: 10,                // Optional: sort order

    // Visibility rules
    visible?: true | false | VisibilityOptions | ((ctx) => boolean),

    // For submenus - child discovery mode
    children?: 'auto' | string[] | ChildNode[]
};

export const apiVersion = 1;
```

### Children Modes

| Mode | Behavior |
|------|----------|
| `'auto'` | Discover all subdirectories with `menu.ts` |
| `['child1', 'child2']` | Explicit list of subdirectory names |
| `[{ type: 'separator' }, ...]` | Inline children with separators |

---

## 6. Discovery Algorithm

The `engine/loader.ts` performs:

1. Load `menu.ts` from root directory
2. If `type === 'submenu'`:
   - If `children === 'auto'`: scan subdirectories for `menu.ts`
   - If `children` is array: load specified paths
3. Recursively load each child
4. Build tree with `filePath` and `childrenNodes` metadata

**Hot Reload**: When a `menu.ts` changes, only that subtree is reloaded.

---

## 7. Visibility Engine

The `engine/visibility.ts` filters the tree based on context:

```ts
interface MenuContext {
    cwd: string;
    project?: { type: string; root: string };
    debug: boolean;
    capabilities?: string[];
}
```

Example visibility rules:
```ts
// Show only when no project is active
visible: (ctx) => !ctx.project

// Show only for TypeScript projects
visible: { projectTypes: ['typescript'] }

// Show only in debug mode
visible: { debug: true }
```

---

## 8. Migration Path

1. Create `router/menu.ts` (ROOT node)
2. Create `router/main/menu.ts` (dashboard submenu)
3. Move `utils/legacy-screens/*` to `router/main/*`
4. Delete `utils/legacy-screens/`
5. Verify TUI loads correct node count

---

## 9. Guarantees

| Guarantee | Mechanism |
|-----------|-----------|
| Discoverable structure | Directory = menu |
| Single source of truth | All menus in `router/` |
| Version compatibility | `apiVersion` field |
| Hot reload support | Path-based subtree reload |
| Plugin extensibility | Plugins add to `~/.opengem/plugins/*/router/` |

---

**End RFC-016**
