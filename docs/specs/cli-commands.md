# CLI Command Structure Spec

> **Version:** 1.0
> **Status:** Active
> **Last Updated:** 2026-02-11

## Overview

OpenGem uses a unified CLI entry pattern that standardizes:
1.  **Development Mode**: Explicit hot-reloading via `bun run dev ...`
2.  **Release Mode**: Explicit optimized execution via `bun run <plugin>`

This replaces the legacy `bun run prod` pattern.

## Command Reference

### Development Mode (Hot Reload)
Use these commands when actively coding. The process will auto-restart on file changes.

| Command | Target | Description |
| :--- | :--- | :--- |
| `bun run dev` | **Codeman** | Launches the main TUI agent interface. (Default) |
| `bun run dev tools` | **Tools** | Launches the Developer Tools CLI. |
| `bun run dev shiva` | **Shiva** | Launches the Shiva Task Manager CLI. |
| `bun run dev katana` | **Katana** | Launches the Katana Scaffolding CLI. |
| `bun run dev <alias>` | **Various** | Supports aliases: `c` (Codeman), `t` (Tools), `s` (Shiva), `k` (Katana). |

> **Note:** Development mode uses `scripts/dev.ts` to spawn `bun --watch`.

### Release Mode (Production)
Use these commands to test the application as it will run in production (minified/optimized simulation).

| Command | Target | Environment |
| :--- | :--- | :--- |
| `bun run codeman` | Codeman | `NODE_ENV=production` |
| `bun run tools` | Tools | `NODE_ENV=production` |
| `bun run shiva` | Shiva | `NODE_ENV=production` |
| `bun run katana` | Katana | `NODE_ENV=production` |
| `bun run opengem` | Codeman | (Alias for codeman) |

## Flags

Global flags accepted by the main Codeman CLI:

- `--help`, `-h`: Show usage information.
- `--bare`, `-b`: Run in headless mode (no TUI).
- `--overlay`, `-o`: Enable debug overlay.

## Plugin Entry Points

| Plugin | Entry File |
| :--- | :--- |
| **Codeman** | `packages/platform/src/app/interactive-cli.ts` |
| **Tools** | `modules/tools/cli/index.ts` |
| **Shiva** | `modules/shiva/cli/index.ts` |
| **Katana** | `modules/katana/cli/router/index.ts` |
