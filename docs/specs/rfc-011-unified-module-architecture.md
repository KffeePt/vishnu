# RFC-011: Core Router Architecture (Modules-Aligned)

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC formalizes the **Unified Module Architecture** for the platform, aligned **exactly** with the canonical `modules/` structure. It replaces all legacy `extensions/` assumptions and defines a single, mechanically enforceable contract for both `core` and all plugins.

The architecture enforces strict separation between **Frontend UI (components)**, **TUI Routing (router)**, **Headless CLI (cli)**, **Skills**, and **Backend Logic (backend)**, ensuring deterministic behavior, headless operability, and long-term architectural stability.

---

## 2. Motivation

Earlier iterations blurred boundaries between:

* UI rendering and application logic
* Router definitions and side effects
* Core primitives and feature behavior

This resulted in:

* Tight coupling
* Fragile hot reload paths
* Ambiguous ownership of state
* Inconsistent plugin layouts

RFC-011 resolves this by enforcing a **single module contract** with explicit, non-overlapping responsibilities mapped directly onto the canonical folder structure.

---

## 3. Design Goals

1. **One Canonical Structure** — `core` and plugins are structurally identical.
2. **Strict Separation of Concerns** — UI, routing, CLI, skills, and backend logic never overlap.
3. **Deterministic Routing** — All routes are statically defined and code-splittable.
4. **Headless First** — Every capability is accessible without a TUI.
5. **Long-Term Stability** — Architecture evolves by extension, not rewrites.

---

## 4. Dependency Law (Non‑Negotiable)

See [RFC-012: Dependency Law](./rfc-012-dependency-law.md).


## 5. Canonical Module Structure — Property Semantics & Resolution

Every module — including **`core`** — **MUST** conform to the canonical module structure defined in this specification.

The structure is **authoritative**, **uniform**, and **mechanically enforceable** across all modules and plugins.

All files and folders in the canonical structure are annotated with **structural properties**.
These properties govern **existence requirements** and **extensibility guarantees**, and they resolve through a strict, hierarchical inheritance model.

---

### 5.1 Structural Property System

Structural properties are evaluated along **two independent axes**.
Each axis contains **mutually exclusive** values.

**Type 1 — Presence Requirement**
- **(mandatory)**
- **(optional)**

**Type 2 — Extensibility**
- **(dynamic)**
- **(non-dynamic)**

These axes are **orthogonal**:
every file or folder is defined by **exactly one property from each axis**.

---

### 5.2 Structural Property Semantics

- **(mandatory)**
  The file or folder **MUST exist** for the module to be considered valid.

- **(optional)**
  The file or folder **MAY be omitted entirely**.

- **(dynamic)**
  The location is **user-extensible**.
  Its internal structure is **not fully lint-enforced**, except where explicitly specified.

- **(non-dynamic)**
  The location is **platform-controlled**.
  Its structure is **strictly lint-enforced**.

> **Dynamic does not imply optional.**
> **Optional does not imply unconstrained.**

---

### 5.3 Resolution Rules (Authoritative)

Structural properties resolve **top-down** through the directory hierarchy.

- Properties defined on a **parent** apply to all children by default
- A **child MAY override** inherited properties according to the rules below
- Files inside **dynamic folders** are **not implicitly optional**
- Requiredness inside a dynamic folder is defined by that folder’s **explicit contract**
- A **mandatory + dynamic** folder MUST exist, but its contents are user-defined
- An **optional + dynamic** folder MAY be omitted, but if present, its internal rules apply

---

### 5.4 Structural Property Resolution Table (Normative)

The following table defines the meaning and scope of each structural property.

| Axis   | Property        | Opposite    | Applies To      | Meaning                      | Enforcement        |
|--------|-----------------|-------------|-----------------|------------------------------|--------------------|
| Type 1 | **mandatory**   | optional    | files & folders | Required for module validity | Linter-enforced    |
| Type 1 | **optional**    | mandatory   | files & folders | May be omitted               | Linter-aware       |
| Type 2 | **dynamic**     | non-dynamic | files & folders | User-extensible location     | Partially enforced |
| Type 2 | **non-dynamic** | dynamic     | files & folders | Platform-defined structure   | Strictly enforced  |

---

### 5.5 Inheritance Rules Matrix (Normative)

#### Type 1 — Presence Inheritance Matrix

| Parent Property | Child Property | Resulting Property | Redundant? | Reason                            |
|-----------------|----------------|--------------------|------------|-----------------------------------|
| mandatory       | mandatory      | mandatory          | Yes        | Already required                  |
| mandatory       | optional       | optional           | No         | Child relaxes requirement         |
| optional        | mandatory      | mandatory          | No         | Child tightens requirement        |
| optional        | optional       | optional           | Yes        | Already optional                  |

#### Type 2 — Extensibility Inheritance Matrix

| Parent Property | Child Property | Resulting Property | Redundant? | Reason                            |
|-----------------|----------------|--------------------|------------|-----------------------------------|
| dynamic         | dynamic        | dynamic            | Yes        | Already dynamic                   |
| dynamic         | non-dynamic    | non-dynamic        | No         | Child restricts structure         |
| non-dynamic     | dynamic        | dynamic            | No         | Child allows extension            |
| non-dynamic     | non-dynamic    | non-dynamic        | Yes        | Already constrained               |

---

### 5.6 Canonical Example (Informative)

The following example illustrates a fully expanded canonical module using the property system defined above.
Comments annotate **presence** and **extensibility** properties and do not alter enforcement semantics.


Example:
```
modules/
└── <plugin_name>/                                 # Example: core/
    │
    ├── components/                                # Suggested Custom UI Components implementation (optional, dynamic)
    │   │
    │   ├── <component_a_name>/                    # Custom Component A (optional, dynamic)
    │   │   ├──<component_a_part_a>/               # Custom Component A Part A (optional, dynamic)
    │   │   │   ├──<component_a_part_a_1>.tsx
    │   │   │   └──<component_a_part_a_2>.tsx
    │   │   │
    │   │   ├──<component_a_part_b>/               # Custom Component A Part B (optional, dynamic)
    │   │   │   ├──<component_a_part_b_1>.tsx
    │   │   │   └──<component_a_part_b_2>.tsx
    │   │   │
    │   │   └──<component_a_name>.tsx              # Custom Component A index, renders component parts (optional)
    │   │                                          # Named after the component itself still optional you can do index.tsx or anything else you want
    │   │
    │   ├── <component_b_name>/                    # Custom Component B (optional, dynamic)
    │   │   ├──<component_b_part_a>/               # Custom Component B Part A (optional, dynamic)
    │   │   │   ├──<component_b_part_a_1>.tsx
    │   │   │   └──<component_b_part_a_2>.tsx
    │   │   │
    │   │   ├──<component_b_part_b>/               # Custom Component B Part B (optional, dynamic)
    │   │   │   ├──<component_b_part_b_1>.tsx
    │   │   │   └──<component_b_part_b_2>.tsx
    │   │   │
    |   |   └──<component_b_name>.tsx              # Custom Component B index, renders component parts (optional)
    │   │
    |   ├── <component_c_name>.tsx                 # Custom Component C (optional, dynamic)
    |   |   ├──<component_c_part_a>/               # Custom Component C Part A (optional, dynamic)
    |   |   │   ├──<component_c_part_a_1>.tsx
    |   |   │   └──<component_c_part_a_2>.tsx
    |   |   │
    |   |   ├──<component_c_part_b>/               # Custom Component C Part B (optional, dynamic)
    |   |   │   ├──<component_c_part_b_1>.tsx
    |   |   │   └──<component_c_part_b_2>.tsx
    |   |   │
    |   |   └──<component_c_name>.tsx              # Custom Component C index, renders component parts (optional)
    |   |
    │   └── App.tsx                                # RootComponent entry point (mandatory)
    │
    ├── cli/                                       # Headless CLI interface (mandatory, dynamic)
    │   |                                          # Internal Node File structure is non-dynamic and there are no mandatory nodes the nodes/commands are dynamically loaded.
    │   └── router/                                # CLI Command Router (mandatory, non-dynamic)
    │       │
    │       ├── build/                             # Build Command (optional, non-dynamic)
    │       │   ├── help.md                        # Help text (optional, non-dynamic)
    │       │   ├── build.ts                       # Command logic (non-dynamic)
    │       │   └── index.ts                       # Command entry point (non-dynamic)
    │       │
    │       ├── deploy/                            # Deploy Command (optional, non-dynamic)
    │       │   ├── help.md                        # Help text (optional, non-dynamic)
    │       │   ├── deploy.ts                      # Command logic (non-dynamic)
    │       │   └── index.ts                       # Command entry point (non-dynamic)
    │       │
    │       ├── dev/                               # Dev Command (optional, non-dynamic)
    │       │   ├── help.md                        # Help text (optional, non-dynamic)
    │       │   ├── dev.ts                         # Command logic (non-dynamic)
    │       │   └── index.ts                       # Command entry point (non-dynamic)
    │       │
    │       ├── test/                              # Test Command (optional, non-dynamic)
    │       │   ├── help.md                        # Help text (optional, non-dynamic)
    │       │   ├── test.ts                        # Command logic (non-dynamic)
    │       │   └── index.ts                       # Command entry point (non-dynamic)
    │       │
    │       ├── update/                            # Update Command (optional, non-dynamic)
    │       │   ├── help.md                        # Help text (optional, non-dynamic)
    │       │   ├── update.ts                      # Command logic (non-dynamic)
    │       │   └── index.ts                       # Command entry point (non-dynamic)
    │       │
    │       └── index.ts                           # CLI router entry point (mandatory, non-dynamic)
    │
    ├── router/                                    # TUI menu router (mandatory, dynamic)
    │   │
    │   ├── main/                                  # Main menu Router (mandatory, dynamic)
    |   |   |   
    |   |   ├──<L0 main menu node >/               # L0 node route folder (optional, non-dynamic)
    |   |   |   ├──<L1 sub menu child node>/       # L1 node route folder (optional, non-dynamic)
    |   |   |   |   ├──<L2 sub menu child node>/   # L2 node route folder (optional, non-dynamic)
    |   |   |   |   |   ├──<L3 sub menu child node>/   # L3 node route folder (optional, non-dynamic)
    |   |   |   |   |   |   └── menu.ts                # L3 child node entry (mandatory, non-dynamic)
    |   |   |   |   |   └── menu.ts                # L2 child node entry (mandatory, non-dynamic)
    |   |   |   |   └── menu.ts                    # L1 child node entry (mandatory, non-dynamic)
    |   |   |   └── menu.ts                        # L0 node entry (mandatory, non-dynamic)
    |   |   |    
    |   |   ├──<L0 parent menu node >/             # L0 node route folder (optional, non-dynamic)
    |   |   |   ├──<L1 sub menu child node>/       # L1 node route folder (optional, non-dynamic)
    |   |   |   |   ├──<L2 sub menu child node>/   # L2 node route folder (optional, non-dynamic)
    |   |   |   |   |   ├──<L3 sub menu child node>/   # L3 node route folder (optional, non-dynamic)
    |   |   |   |   |   |   └── menu.ts                # L3 child node entry (mandatory, non-dynamic)
    |   |   |   |   |   └── menu.ts                # L2 child node entry (mandatory, non-dynamic)
    |   |   |   |   └── menu.ts                    # L1 child node entry (mandatory, non-dynamic)
    |   |   |   └── menu.ts                        # L0 node entry (mandatory, non-dynamic)
    |   |   |    
    |   |   └── menu.ts                            # Main menu entry (mandatory, non-dynamic)
    │   │
    │   ├── welcome/                               # Welcome screen (mandatory, non-dynamic) - renders global welcome component
    │   │   └── index.ts                           # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component or leaves boilerplate for default.
    │   │
    │   ├── auth/                                  # Authentication screen (optional, non-dynamic) - renders global auth component
    │   │   └── index.ts                           # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component or leaves boilerplate for default.
    │   │
    │   ├── main/                                  # Main menu router (mandatory, dynamic) - Each folder = submenu node
    │   │   │
    │   │   ├── launcher/                          # Launcher Sub-Menu (optional, dynamic)
    │   │   │   ├── create-new-project/            # Create New Project Option (optional, dynamic)
    │   │   │   │   └── menu.ts                    # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component/action or leaves boilerplate for default.
    │   │   │   │
    │   │   │   ├── resume-session/                # Resume Session Option (optional, dynamic)
    │   │   │   │   └── menu.ts                    # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component/action or leaves boilerplate for default.
    │   │   │   │
    │   │   │   ├── open-folder/                   # Open Folder Option (optional, dynamic)
    │   │   │   │   └── menu.ts                    # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component/intent or leaves boilerplate for default.
    │   │   │   │
    │   │   │   └── menu.ts                        # Launcher Node/Menu entry (mandatory, non-dynamic)
    │   │   │
    │   │   ├── settings/                          # Launcher → Settings (mandatory, non-dynamic) - renders custom settings component
    │   │   │   └── menu.ts                        # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component or leaves boilerplate for default.
    │   │   │
    │   │   ├── restart/                           # Launcher → Restart (mandatory, non-dynamic) - renders global restart component
    │   │   │   └── menu.ts                        # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component or leaves boilerplate for default.
    │   │   │
    │   │   ├── exit/                              # Launcher → Exit (mandatory, non-dynamic) - renders global exit component
    │   │   │   └── menu.ts                        # Node/Menu entry (mandatory, non-dynamic) - user links to a custom component or leaves boilerplate for default.
    │   │   │
    │   │   └── menu.ts                            # Main dashboard entry (mandatory, non-dynamic) - user links to a custom component or leaves boilerplate for default.
    │   │
    │   ├── loading/                               # Loading screen (mandatory, non-dynamic)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── idle/                                  # Idle / screensaver (mandatory, non-dynamic)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── debug/                                 # Debug screens (mandatory, non-dynamic)
    │   │   │
    │   │   └── error/                             # Global error screen (mandatory, non-dynamic)
    │   │       └── index.ts                       # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── settings/                              # Global Settings (mandatory, non-dynamic)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── restart/                               # Global Restart (mandatory, non-dynamic)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── exit/                                  # Global Exit (mandatory, non-dynamic)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   └── index.ts                               # TUI router entry point (mandatory, non-dynamic)
    │
    ├── schemas/                                   # Schema definitions (mandatory, non-dynamic)
    |   |                                  
    │   ├── <schema_name>/                         # Schema name (optional, non-dynamic)
    │   │   ├── index.ts                           # Schema exports (mandatory, non-dynamic)
    │   │   └── <schema_file>.ts                   # Schema files (mandatory, non-dynamic)
    |   |
    │   └── index.ts                               # Schema exports (mandatory, non-dynamic)
    │
    ├── skills/                                    # Skills system (mandatory, non-dynamic)
    │   │
    │   ├── <skill_name>/
    |   │   │
    |   │   ├── scripts/                           # Script-based skills (mandatory, non-dynamic)
    |   │   │   ├── execute/                       # Execute skill (mandatory, dynamic)
    |   │   │   │   └── index.ts                   # Skill entry (mandatory, non-dynamic)
    |   │   │   │
    |   │   │   ├── build/                         # Build skill (optional, dynamic)
    |   │   │   │   └── index.ts                   # Skill entry (mandatory, non-dynamic)
    |   │   │   │
    |   │   │   ├── test/                          # Test skill (optional, dynamic)
    |   │   │   │   └── index.ts                   # Skill entry (mandatory, non-dynamic)
    |   │   │   │
    |   │   │   └── index.ts                       # Scripts skill registry (mandatory, non-dynamic)
    |   │   │
    |   │   ├── templates/                         # Markdown templates (optional, dynamic)
    |   │   │   └── index.ts                       # Templates entry (mandatory, non-dynamic)
    |   │   │
    |   │   ├── Skill.md                           # Skill manifest (mandatory, non-dynamic)
    |   │   └── Skill.ts                           # Skill runtime entry (mandatory, non-dynamic)
    │   │
    │   └── index.ts                               # Skills registry (mandatory, non-dynamic)
    │
    ├── backend/                                   # Backend logic (mandatory, non-dynamic)
    │   │
    │   ├── intents/                               # Orchestration entry points (mandatory, non-dynamic) - e.g navigation, menu actions, etc...
    │   │   ├── navigate.ts
    │   │   ├── createProject.ts
    │   │   └── startContainer.ts
    │   │
    │   ├── domain/                                # Business rules (mandatory, non-dynamic)
    │   │   ├── project.ts
    │   │   ├── container.ts
    │   │   └── session.ts
    │   │
    │   ├── infra/                                 # I/O & adapters (mandatory, non-dynamic)
    │   │   │
    │   │   ├── containers/                        # Container / runtime adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── config/                            # Configuration adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── log/                               # Logging adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── process/                           # OS & process adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── fs/                                # File system adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── storage/                           # Persistence / backing stores (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── network/                           # Network adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── api/                               # API adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── io/                                # Terminal / stdin / stdout adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── render/                            # Render targets (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── security/                          # Auth, crypto, secrets, permissions (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── time/                              # Clock, timers, scheduling (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── telemetry/                         # Logging, metrics, tracing (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── events/                            # Eventing / messaging (optional, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── scripts/                           # Script execution adapters (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   ├── capabilities/                      # Capability resolution & gating (mandatory, dynamic)
    │   │   │   └── index.ts
    │   │   │
    │   │   └── index.ts                           # Infra public API (mandatory, non-dynamic)
    │   │
    │   ├── pure/                                  # Pure computation (mandatory, non-dynamic) - e.g. utils, helpers, parsers, etc...
    │   │   └── index.ts
    │   │
    │   ├── state/                                 # Local state (mandatory, non-dynamic)
    │   │   ├── store.ts
    │   │   └── selectors.ts
    │   │
    │   ├── themes/                                # Theme definitions (mandatory, non-dynamic)
    │   │   └── index.ts
    │   │
    │   ├── schemas/                               # Shared schemas (mandatory, non-dynamic)
    │   │   └── index.ts
    │   │
    │   └── index.ts                               # Backend public surface (mandatory, non-dynamic)
    │
    ├── .env                                       # Environment variables (mandatory, dynamic)
    ├── .env.example                               # Environment variables example (optional, dynamic)
    ├── index.ts                                   # Module registration / public API (mandatory, non-dynamic)
    └── plugin.json                                # Plugin manifest (mandatory, non-dynamic)

```

This structure is mostly **mandatory, non-dynamic** and **mechanically enforceable** with some exceptions.

---
### 5.7 Minimum Valid Module (Standard)

A module that satisfies the structure below is considered **valid**.

This structure is **mandatory**, **hierarchically resolved**, and **mechanically enforceable**.
(Boilerplate gen sets this to a default minimal TUI screen for all modules.)
```
modules/
└── <plugin_name>/                                 # Module root (mandatory, non-dynamic)
    │
    ├── components/                                # UI components (mandatory, dynamic)
    │   └── App.tsx                                # Component entry point (mandatory)
    │
    ├── cli/                                       # Headless CLI subsystem (mandatory, dynamic)
    │   └── router/                                # CLI routing layer (mandatory, dynamic)
    │       └── index.ts                           # CLI router entry point (mandatory, non-dynamic)
    │
    ├── router/                                    # TUI routing subsystem (mandatory, dynamic)
    │   │
    │   ├── welcome/                               # Welcome screen (mandatory, non-dynamic)
    │   |   |                              
    │   |   |                                      # (Global component, renders special welcome component)
    │   |   └── index.ts                           # Screen entry point (mandatory, non-dynamic)
    │   │
    │   ├── main/                                  # Main menu Router (mandatory, dynamic)
    |   |   |   
    |   |   ├──<L0 main menu node >/               # L0 node route folder (optional, non-dynamic)
    |   |   |   ├──<L1 sub menu child node>/       # L1 node route folder (optional, non-dynamic)
    |   |   |   |   └── menu.ts                    # L1 child node entry (mandatory, non-dynamic)
    |   |   |   └── menu.ts                        # L0 node entry (mandatory, non-dynamic)
    |   |   |    
    |   |   ├──<L0 parent menu node >/             # L0 node route folder (optional, non-dynamic)
    |   |   |   ├──<L1 sub menu child node>/       # L1 node route folder (optional, non-dynamic)
    |   |   |   |   └── menu.ts                    # L1 child node entry (mandatory, non-dynamic)
    |   |   |   └── menu.ts                        # L0 node entry (mandatory, non-dynamic)
    |   |   |    
    |   |   ├──menu.ts                             # Main enu Node entry (mandatory, non-dynamic) 
    |   |   |   
    │   │   ├── auth/                              # Auth submenu (optional, non-dynamic) (links component to router/auth)
    │   │   │   └── menu.ts                        # Node entry (mandatory, non-dynamic)
    │   │   │
    │   │   ├── settings/                          # Settings submenu (mandatory, non-dynamic) (links component to router/settings)
    │   │   │   └── menu.ts                        # Node entry (mandatory, non-dynamic)
    │   │   │
    │   │   ├── restart/                           # Restart submenu (mandatory, dynamic) (links component to router/restart)
    │   │   │   └── menu.ts                        # Node entry (mandatory, non-dynamic)
    │   │   │
    │   │   ├── exit/                              # Launcher → Exit (mandatory, non-dynamic) (links component to router/exit)
    │   │   │   └── menu.ts                        # Node entry (mandatory, non-dynamic)
    │   │   │
    │   │   └── menu.ts                            # Main dashboard entry (mandatory, non-dynamic)
    │   │
    │   ├── loading/                               # Loading screen (mandatory, non-dynamic)
    │   |   |                              
    │   │   |                                      # (Global component, renders special loading component)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── idle/                                  # Idle / screensaver (mandatory, non-dynamic)
    │   |   |                              
    │   │   |                                      # (Global component, renders special idle component)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── debug/                                 # Debug screens (mandatory, non-dynamic)
    │   │   │
    │   │   └── error/                             # Global error screen (mandatory, non-dynamic)                        
    │   │   |                                      # (Global component, renders special error component)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── settings/                              # Global Settings (mandatory, non-dynamic)
    │   |   |                              
    │   |   |                                      # (Global component, renders router/main/settings specified component)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── restart/                               # Global Restart (mandatory, non-dynamic)
    |   |   |                              
    │   |   |                                      # (Global component, renders router/main/restart specified component)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   ├── exit/                                  # Global Exit (mandatory, non-dynamic)
    │   |   |                              
    │   |   |                                      # (Global component, renders router/main/exit specified component)
    │   │   └── index.ts                           # Screen entry (mandatory, non-dynamic)
    │   │
    │   └── index.ts                               # TUI router entry point (mandatory, non-dynamic)
    │
    ├── schemas/                                   # Schema definitions (mandatory, non-dynamic)
    |   |                                  
    │   ├── <schema_name>/                         # Schema name (optional, non-dynamic)
    │   │   ├── index.ts                           # Schema exports (mandatory, non-dynamic)
    │   │   └── <schema_file>.ts                   # Schema files (mandatory, non-dynamic)
    |   |
    │   └── index.ts                               # Schema exports (mandatory, non-dynamic)
    │
    ├── skills/                                    # Skills system root (mandatory, non-dynamic)
    │   ├── scripts/                               # Script-based skills (mandatory, non-dynamic)
    │   │   └── index.ts                           # Skills registry (mandatory, non-dynamic)
    │   │
    │   ├── Skill.md                               # Skill manifest (mandatory, non-dynamic)
    │   └── Skill.ts                               # Skill runtime entry (mandatory, non-dynamic)
    │
    ├── backend/                                   # Backend subsystem (mandatory, non-dynamic)
    │   ├── intents/                               # Orchestration / intent layer (mandatory, non-dynamic)
    │   │   └── index.ts                           # Intent surface (mandatory, non-dynamic)
    │   │
    │   ├── domain/                                # Business rules (mandatory, non-dynamic)
    │   │   └── index.ts                           # Domain exports (mandatory, non-dynamic)
    │   │
    │   ├── infra/                                 # Adapters & I/O (mandatory, dynamic)
    │   │   ├── api/                               # API adapter (mandatory, dynamic)
    |   |
    │   │   └── index.ts                           # Infra surface (mandatory, non-dynamic)
    │   │
    │   ├── pure/                                  # Pure computation (mandatory, non-dynamic)
    │   │   └── index.ts                           # Pure exports (mandatory, non-dynamic)
    │   │
    │   ├── state/                                 # State management (mandatory, non-dynamic)
    │   │   └── index.ts                           # State surface (mandatory, non-dynamic)
    │   │
    │   ├── themes/                                # Theme definitions (mandatory, non-dynamic)
    │   │   └── index.ts                           # Theme exports (mandatory, non-dynamic)
    │   │
    │   ├── types/                                 # Shared backend types (mandatory, non-dynamic)
    │   │   └── index.ts                           # Type exports (mandatory, non-dynamic)
    │   │
    │   └── index.ts                               # Backend public API (mandatory, non-dynamic)
    │
    ├── .env                                       # Environment variables (mandatory, dynamic)
    ├── .env.example                               # Environment variables example (optional, dynamic)
    ├── index.ts                                   # Module registration & public API (mandatory, non-dynamic)
    └── plugin.json                                # Plugin manifest (mandatory, non-dynamic)
```

This structure is **mandatory, non-dynamic** and **mechanically enforceable**.

---
## 6. Layer Responsibilities

### 6.1 `components/` — Frontend UI

* Pure visual components (TSX)
* No filesystem or shell access
* No business logic
* Stateless where possible

Components receive props and emit events only.

---

### 6.2 `backend/` — Application Logic

The execution brain of the module.

Includes:

* Business rules and invariants (`domain/`)
* Orchestration entry points (`intents/`)
* State containers and selectors (`state/`)
* Side effects and adapters (`infra/`)
* Shared types and pure computation

May be used by:

* `router/`
* `cli/`
* `skills/`

Never imports UI or router code.

---

### 6.3 `cli/` — Headless Interface

* Fully functional without TUI
* Folder-based command routing
* Deterministic and scriptable

Each command:

* Lives under `cli/router/<command>/`
* Imports `backend/` directly
* Has optional `help.md`

Example:

```
codeman core build
codeman core dev
```

---

### 6.4 `router/` — TUI Screen Graph

Defines **which screens exist and how they connect**.

Rules:

* One folder = one screen or menu node
* One `index.ts` or `menu.ts` entry per screen
* Declarative only

The router:

* Imports `components/` to render UI
* Imports `backend/` to read state or trigger intents
* Contains ZERO business logic

---

### 6.5 `skills/` — Standardized Skill System

* Declarative, callable capabilities
* Used by CLI, router, or automation
* Defined by `Skill.md` + `Skill.ts`

Skills may:

* Import `backend/`
* Execute domain-specific logic

Skills never render UI directly.

---

## 7. Router Architecture

### 7.1 Declarative by Construction

Routes export render functions and configuration only.

```ts
// modules/core/router/welcome/index.ts
export function render() {
  return <WelcomeScreen />;
}
```

No side effects. No state mutation.

---

### 7.2 Static Router Index

```ts
// modules/core/router/index.ts
export const routes = {
  welcome: () => import('./welcome'),
  auth: () => import('./auth'),
  main: () => import('./main'),
};
```

* Static
* Deterministic
* Code-splittable

---

## 8. CLI ↔ Router Relationship

The CLI and TUI routers are **conceptually aligned**, not structurally identical.

* CLI commands represent **actions**
* TUI routes represent **interactive flows**

Both ultimately invoke the same `backend/intents`, guaranteeing:

* One source of truth
* No duplicated logic
* Predictable automation

---

## 9. Core Module Clarification

`modules/core` is **not special architecturally**.

It follows the **exact same structure and dependency law** as any plugin.

Its only distinctions are:

* Loaded first
* Provides shared primitives

This prevents architectural drift.

---

## 10. Guarantees

| Guarantee           | Mechanism               |
| ------------------- | ----------------------- |
| Deterministic UI    | Static TUI routers      |
| Headless operation  | CLI isolation           |
| Testability         | UI / backend separation |
| Plugin safety       | Dependency law          |
| Long-term stability | Uniform module contract |

---

**End RFC-011**
