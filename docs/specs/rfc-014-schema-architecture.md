# RFC-014: Schema Architecture

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## Motivation
As the codebase grows, schemas become scattered across modules, making it difficult to:
1. Share common types across modules
2. Maintain consistency in data structures
3. Discover available schemas

This RFC establishes clear guidelines for schema placement.

---

## Schema Tiers

### Tier 1: Global Schemas (`/schemas/`)
**Location**: `/schemas/`
**Purpose**: Core types shared across multiple modules and packages.

**Contents**:
- `cli-schema.ts` - CLI argument types
- `engine-schema.ts` - Engine state and lifecycle types
- `menu-schema.ts` - Menu node and navigation types
- `plugin.schema.ts` - Plugin manifest and lifecycle types
- `runtime-state-schema.ts` - Global runtime state
- `error-schema.ts` - Standardized error types
- `debug-schema.ts` - Debug message and config types
- `infra/` - Infrastructure layer schemas (io, fs, process, etc.)
- `index.ts` - Unified re-export

**Import Path**: `@opengem/schemas/*`

### Tier 2: Module-Local Schemas (`/modules/<module>/schemas/`)
**Location**: `/modules/<module>/schemas/`
**Purpose**: Types specific to a single module, not shared externally.

**Structure**:
```
modules/<module>/schemas/
├── <schema_name>/
│   └── index.ts     # Schema definition
└── index.ts         # Module schema re-export
```

**Import Path**: `@opengem/modules/<module>/schemas/*`

---

## Guidelines

### When to use Global Schemas
- Type is used by 2+ modules
- Type is part of the public plugin API
- Type represents core infrastructure (IO, FS, Network)
- Type is used by runtime or platform packages

### When to use Module-Local Schemas
- Type is internal to one module
- Type is implementation detail, not API
- Type is experimental/unstable

### Schema Promotion
When a module-local schema becomes widely used:
1. Move file from `modules/<module>/schemas/` to `/schemas/`
2. Update `@opengem/schemas/index.ts` to export it
3. Update all imports to use `@opengem/schemas/*`
4. Leave a re-export stub in module for backwards compatibility

---

## Examples

### Global Schema (error-schema.ts)
```typescript
// /schemas/error-schema.ts
export type ErrorSeverity = 'fatal' | 'error' | 'warning' | 'info';

export interface OpenGemError {
    code: string;
    message: string;
    stack?: string;
    context?: string;
    timestamp: number;
    recoverable: boolean;
    severity?: ErrorSeverity;
}
```

### Module-Local Schema (katana)
```typescript
// /modules/katana/schemas/template-schema/index.ts
export interface PluginTemplate {
    name: string;
    description: string;
    files: TemplateFile[];
}

export interface TemplateFile {
    path: string;
    content: string;
}
```

---

## Implementation Checklist
- [x] Create `/schemas/infra/` for infrastructure schemas
- [x] Create `error-schema.ts` and `debug-schema.ts`
- [x] Create `/schemas/index.ts` unified export
- [x] Create `schemas/index.ts` for each module
- [ ] Migrate scattered schemas to appropriate tier
- [ ] Update linter to enforce tier rules

---

## References
- RFC-011: Unified Module Architecture
- RFC-012: Dependency Law
