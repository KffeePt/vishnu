# RFC-005: Skill Forge & Developer Experience

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC defines the **Developer Experience (DX)** for building OpenGem Skills. It introduces the **Skill Forge**, a set of CLI tools and standards that ensure skills are buildable, testable, and secure by design. It explicitly forbids "npm-style" chaos (no arbitrary postinstall scripts) in favor of a strictly managed build lifecycle.

## 2. Skill Package Structure

A valid OpenGem Skill is a standard directory structure:

```
my-skill/
├── opengem.manifest.json  # (RFC-002) - Security Contract
├── src/
│   ├── index.ts           # Entry point (Exports Actions)
│   └── lib/               # Helper logic
├── docs/                  # Markdown documentation for LLMs
├── tests/                 # Required integration tests
├── scripts/               # Managed build scripts (limited)
└── package.json           # Minimal dependencies
```

## 3. The Forge Workflow

We provide a specialized toolchain: `gem-forge` (via `opengem skill ...`).

### 3.1 `opengem skill init`
Scaffolds a new skill from a "Golden Template".
- Prompts for capabilities.
- Sets up TypeScript config.
- Creates the manifest.

### 3.2 `opengem skill build`
Compiles the skill to a **Deterministic Artifact**.
- **No Side Effects:** Build scripts cannot access the network.
- **Bundling:** Dependencies are bundled (esbuild) to produce a single `.js` file to avoid `node_modules` hell at runtime.

### 3.3 `opengem skill test`
Runs the skill in a **Mocked Runtime**.
- **Mocked Capabilities:** The test runner injects fake `fs` and `net` interfaces.
- **Invariant Check:** Verifies that the skill *actually* requests the permissions it claims to need. If code calls `fs.write` but manifest lacks it, the test fails.

## 4. Publishing & Provenance

### 4.1 Signatures
When a skill is "Finished":
1.  The Forge hashes the bundle (`bundle.js`) and the manifest (`opengem.manifest.json`).
2.  The Developer signs this hash with their PGP key.
3.  The signature is stored in `signature.sig`.

### 4.2 The Registry (Future)
OpenGem will support decentralized registries. A registry is simply a static file server hosting signed bundles. There is no central "npm registry" logic required.

## 5. Legacy Migration Guide (Vish → OpenGem)

For developers porting legacy Codeman tools:

1.  **Audit:** Run `opengem skill audit <legacy-folder>`. It statically analyzes code to guess required capabilities.
2.  **Wrap:** Move logic into `src/` and wrap `fs` calls with `import { fs } from '@opengem/sdk'`.
3.  **Manifest:** Generate the manifest based on the audit.
4.  **Verify:** Run tests.

## 6. Strictness Rules

To prevent supply-chain attacks:

1.  **No `postinstall`:** The runtime ignores `scripts` in `package.json`.
2.  **Verified SDK:** Skills must only import `@opengem/sdk`. Imports of `child_process` or `fs` are banned by the linter and the build fails.

---
**END RFC-005**
