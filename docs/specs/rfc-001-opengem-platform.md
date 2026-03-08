# RFC-001: OpenGem Secure Agent Platform

**Status:** Implemented (v0.1)
**Authors:** Santi Sanchez
**Created:** 2026-01-31
**Version:** 0.1.0
**Updated:** 2026-02-04

---



## 1. Abstract

This RFC defines the architecture, security model, and migration strategy for **OpenGem**, a secure, no‑trust, agent‑first platform evolved from the legacy **Vish** TUI system and informed by lessons (and failures) observed in **OpenClaw**‑style agent ecosystems.

OpenGem treats agents, skills, plugins, and instructions as *hostile by default*. It introduces explicit capability declarations, auditable execution, isolation‑ready runtimes, and a hardened control plane while preserving backward compatibility with existing Vish/Codeman functionality.

---

## 2. Motivation

Agent platforms have replicated package‑manager trust models without the sandboxing, provenance, and auditability that made those systems survivable. This has resulted in:

- Unsigned skills behaving as arbitrary binaries
- Instruction-following as an attack surface
- Ambient authority granted to plugins and agents
- No reliable provenance or audit trail

OpenGem exists to:
- Prevent silent compromise
- Make permission boundaries explicit
- Enable safe extensibility
- Provide a foundation for VM‑level isolation

---

## 3. Non‑Goals

OpenGem explicitly does **not** attempt to:

- Be trustless via social reputation alone
- Automatically secure legacy skills without user involvement
- Provide "magic" zero‑config agent execution
- Hide security decisions from the user

Security correctness always outweighs convenience.

---

## 4. Terminology

- **Codeman** – The TUI‑driven interface governing all actions (OpenGem TUI)
- **Agent** – An orchestration entity that executes workflows
- **Skill** – Signed Binaries providing custom functionality along with a manifest.md that declares
              capabilities metadata provenance and documentation for the skill.
- **Capability** – A tool with granular permission explicitly declared by a skill
- **Ambient Authority** – Implicit access without declaration (forbidden)
- **Isolation Runtime/ Container** – Execution boundary (process, container, VM)

---

## 5. System Overview

### 5.1 High‑Level Architecture

```
User
  ↓
OpenGem Control Plane (TUI/GUI)
  ↓
Agent Interface Layer
  ↓
Capability Enforcement
  ↓
Isolation Runtime/ Container (host → container → VM)
```

All execution flows pass through a **single enforcement choke point**.

---

## 6. Legacy Compatibility

### 6.1 OpenGem

- OpenGem is a fork of Vishnu and Codeman that now is a secure agent platform with a GUI and TUI
  for software development and general purpose agentic workflows.

### 6.2 Codeman

- Codeman AND Vishnu's APIs have been **modified** to support OpenGem.
- Codeman is the command and development center of OpenGem.

---

## 7. Artifact‑Driven Architecture

The `/artifact` directory is considered temporary TUI generated and pretty printed human readable artifacts that encode codebase file state. (NOT! AI generated artifacts)

- Tree Structure
- Audit, Test, Runtime and Build and Release Reports and logs
  (Separate from /logs which should still be used for general logging)
- Human readable Git history artifacts

---

## 8. Agent Model

### 8.1 Definition

Agents are orchestration entities that:
- Run workflows with tools in the OS
- Coordinate skills
- Possess **zero implicit permissions**

### 8.2 Restrictions

Agents may not:
- Access filesystem directly
- Access network directly
- Spawn processes directly

All actions must go through capability‑gated interfaces.

A Whitelist of actions can be granted to let agent execute actions without user supervision.

Example:


```json
{
  "agent_id": "developer-assistant",
  "unsupervised_whitelist": [
    "fs.read:./src/**",
    "exec.spawn:npm test",
    "git.status",
    "skill.execute:code-analyzer"
  ]
}
```

## 9. Plugin and Skill Model

### 9.1 Plugin Definition

A Plugin is a distribution unit that bundles one or more Skills, TUI components, or scripts. It serves as the primary unit of extensibility and provenance within the OpenGem ecosystem.

### 9.2 Plugin Manifest (`plugin.json`)

Every plugin must include a signed manifest defining its identity, entry point, and required capabilities.

```json
{
  "id": "katana",
  "name": "Katana Toolkit",
  "version": "1.0.0",
  "certificate_hash": "7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d67728bd5700f12e0588ad",
  "description": "High-level plugin toolkit for generating plugins, scripts, menus, agent skills, and TUI components",
  "main": "index.ts",
  "capabilities": [
    "filesystem",
    "terminal"
  ]
}
```

### 9.3 Relationship to Skills

- **Containerization**: Plugins act as the provider and lifecycle manager.
- **Exposure**: Skills are the specific executable units exposed by the plugin to Agents.
- **Shared Context**: All skills shipped within a plugin share the plugin's security context and provenance (verified via `certificate_hash`).

### 9.4 Verification and Loading

1.  **Hash Validation**: The `certificate_hash` is verified against the plugin's contents at load time.
2.  **Capability Granting**: Capabilities requested in the manifest are compared against user-defined policy before the plugin is initialized.
3.  **Isolation**: The `main` entry point is executed within the Isolation Runtime, preventing the plugin from accessing resources outside its declared capabilities.

## 10. Capability System

### 10.1 Principles

- Explicit > implicit
- Least privilege
- Deny by default
- Auditable by design

### 10.2 Capability Categories (Non‑Exhaustive)

- `fs.read`: Read files from the filesystem.
- `fs.write`: Create or modify files on the filesystem.
- `fs.list`: List directory contents.
- `fs.delete`: Remove files or directories.
- `fs.move`: Move or relocate files and directories.
- `fs.copy`: Duplicate files and directories.
- `fs.watch`: Monitor the filesystem for changes.
- `net.outbound`: Establish outgoing network connections.
- `net.inbound`: Accept incoming network connections.
- `exec.spawn`: Execute external processes.
- `exec.kill`: Terminate running processes.
- `exec.list`: List active processes.
- `exec.watch`: Monitor processes for changes.
- `secrets.read`: Read secrets from the secrets manager.
- `secrets.write`: Create or modify secrets in the secrets manager.
- `secrets.delete`: Remove secrets from the secrets manager.
- `secrets.list`: List secrets in the secrets manager.
- `secrets.watch`: Monitor secrets for changes.
- `secrets.move`: Move or relocate secrets in the secrets manager.
- `secrets.copy`: Duplicate secrets in the secrets manager.
- `secrets.watch`: Monitor secrets for changes.

### 10.3 Enforcement

- All capability checks occur at execution time
- Initial implementation is log‑only
- Future versions enforce hard denial

---

## 11. Execution Choke Point

All skill execution must pass through a single function responsible for:

- Capability validation
- Audit logging
- Runtime dispatch
- Error containment

This function is the **primary security invariant** of OpenGem.

---

## 12. Runtime & Isolation

### 12.1 Isolation Abstraction

```
opengem/runtime/isolation/
```

Defines interfaces for:
- Filesystem access
- Network access
- Process execution

### 12.2 Isolation Levels

1. Host (development)
2. Container (intermediate)
3. MicroVM (Firecracker / KVM)

The interface remains stable across all levels.

---

## 13. Channel Architecture

### 13.1 Supported Channels

- CLI (default)
- Telegram
- Discord
- Signal

### 13.2 Rules

- No channel bypasses permissions
- No channel holds secrets directly
- All channels route through agent interface

---

## 14. OpenClaw Concept Integration

### 14.1 Retained Concepts

- Skill‑based extensibility
- Agent orchestration
- Tool abstraction

### 14.2 Rejected Concepts

- Unsigned skills
- Markdown‑driven instruction execution
- Trust‑by‑default registries
- Implicit permissions

### 14.3 Redesign Strategy

All adopted concepts are reimplemented under OpenGem’s security invariants.

---

## 15. Provenance & Trust (Scaffolded)

OpenGem defines placeholders for:

- Skill signatures
- Provenance chains
- Community audits
- Trust signals

These systems exist structurally but may be no‑op in v0.1.

---

## 16. Audit & Observability

Every skill execution must emit:

- Timestamp
- Agent ID
- Skill ID
- Capabilities requested
- Capabilities granted
- Capabilities executed
- File-level outcome (git level, e.g diffs, patches, etc.)
- Execution outcome (execution level, e.g exit code, stdout, stderr, etc.)

Audit logs are immutable append‑only records.

---

## 17. Security Invariants

The following MUST ALWAYS hold:

- No ambient authority
- No silent permission grants
- No direct tool execution
- No unaudited execution paths
- No instruction execution without context

Violation of any invariant is a critical security bug.

---

## 18. Risks & Tradeoffs

- Increased friction for skill authors
- Slower initial development velocity
- More verbose user prompts

These are accepted costs for correctness.

---

## 19. Future Work

- Mandatory signature enforcement
- Deterministic builds
- Skill reproducibility checks
- Formal verification of capability enforcement
- Default microVM execution

---

## 20. Conclusion

OpenGem is not an agent framework. It is an **agent operating system** designed for hostile environments.

If a feature bypasses security, it is a bug.

If security makes something harder, that is the point. But always within reason.

---

**RFC-001 ends here.**

