# RFC-010: Tools CLI Architecture

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

The **Tools CLI** (`codeman/extensions/tools/cli/index.ts`) is the unified developer interface for OpenGem. It consolidates build, test, artifact generation, and system audit tasks into a single entry point, accessible via the `opengem` command (or `run_tools.bat`). It operates in two modes: **Classic TUI** (interactive menu) and **Automation CLI** (headless flags).

## 2. Motivation

Previous workflows relied on disparate scripts (`generate-artifacts.ts`, `ci.ts`, `test-inquirer.ts`) with no central discovery mechanism. This led to:
- "Script fatigue" where developers forgot availale tools.
- inconsistent execution environments.
- Difficulty in automating CI/CD pipelines alongside local dev tasks.

RFC-010 establishes the Tools CLI as the canonical way to interact with the development environment.

## 3. Architecture

### 3.1 Dual-Mode Interface

```typescript
// tools/cli/index.ts

if (hasFlags) {
    // Automation Mode
    await runHeadlessAction(flags);
} else {
    // TUI Mode
    startInteractiveMenu();
}
```

- **Automation Mode:** Optimized for scripts, CI pipelines, and quick actions.
- **TUI Mode:** Interactive menu system using ansi-escapes for navigation, optimized for discovery.

### 3.2 Command Structure

| Flag | Description | Underlying Script |
|------|-------------|-------------------|
| `--help`, `-h` | Show usage help | N/A |
| `--build <target>` | Build binaries (win, linux, all) | `utils/build/build-all.ts` |
| `--test`, `-t` | Run test suite | `bun test` |
| `--check` | Run type check | `tsc -p tsconfig.prod.json` |
| `--deploy`, `-d` | Run release pipeline | `codeman/extensions/tools/ci.ts --release` |
| `--artifacts <type>` | Generate system artifacts | `codeman/extensions/tools/generate-artifacts.ts` |
| `--audit` | System health check (Podman/Node) | `actions/system-check.ts` |

### 3.3 Artifact Generation Integration

The CLI integrates tightly with `tools/generate-artifacts.ts` to support granular generation:

- `opengem -a tree`: Generates only the file tree (fast).
- `opengem -a capabilities`: Generates capability manifests.
- `opengem -a menus`: Scans and documents menu structures.
- `opengem -a audit`: Updates the audit log snapshot.

## 4. System Health & Pre-flight

The `--audit` flag (and startup check) verifies:
- **Node Runtime**: Version compatibility.
- **Container Runtime**: Checks for Podman (preferred) or Docker using `runtime/orchestration/pre-flight.ts`.
- **Dependencies**: Ensuring `bun` and critical tools are present.

## 5. Security Principles

- **No Implicit Auth**: The CLI does not store secrets; it relies on environment variables (`.env`).
- **Local First**: All build and generation tasks run locally.
- **Explicit Confirmation**: Destructive actions (like `--deploy`) running in TUI mode require interactive confirmation.

---
**End RFC-010**
