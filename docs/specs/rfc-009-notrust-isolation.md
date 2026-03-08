# RFC-009: NoTrust Isolation Model

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---


**Status:** PROPOSAL
**Date:** 2026-02-01
**Author:** Antigravity

## Context
As OpenGem migrates legacy features from OpenClaw (e.g., WhatsApp Baileys integrations, external scraping tools), it encounters modules that are inherently insecure or require high-privilege access.

## Objective
Establish a **"NoTrust"** isolation tier for features that interact with external protocols or untrusted codebases. This is partially implemented via the **Container Orchestration Layer** (`runtime/orchestration/`) which manages isolated Podman/Docker containers.

## Architectural Design

### 1. The NoTrust Context
Modules marked as `notrust` must run in a sub-runtime with:
- **Zero File System Access**: Unless explicitly white-listed in a dedicated `notrust-storage` directory.
- **Narrow Network Access**: Restricted to specific domains/IPs required for the protocol (e.g., `graph.facebook.com` for WhatsApp).
- **No Shared State**: Cannot access the primary `AgentState` or `CapabilityManifest` of the core.

### 2. Capability Registry
```typescript
// security/capabilities/notrust/registry.ts
export interface NoTrustCapability {
    moduleId: string;
    level: 'L1_RESTRICTED' | 'L2_ISOLATED' | 'L3_VIRTUALIZED';
    allowedDomains: string[];
    maxMemoryMb: number;
}
```

### 3. Execution Layer
- `L1_RESTRICTED`: Process-level flags (e.g., `--disallow-fs`).
- `L2_ISOLATED`: Worker threads with custom `require` logic.
- `L3_VIRTUALIZED`: WebAssembly or Containerized execution (Future roadmap).

## Application
- **OpenCode (In-VM Agent)**: Runs in **`L2_ISOLATED`** inside the PopOS VM. It is the primary coding agent for agentic tasks, replacing Claude Code. No direct host FS access; all host communication via HTTP API.
- **WhatsApp Bot**: Runs in `L2_ISOLATED` with access only to WhatsApp web sockets and a local `baileys-session` folder.
- **Discord Bot**: Runs in `L1_RESTRICTED` with zero FS access.
- **Web Scraping**: Runs in `L3_VIRTUALIZED` (Chromium sandbox).

### Dashboard Integration
The **Tools CLI** (RFC-010) and the **Container Agent Dashboard** (`codeman/extensions/core/components/agent-dashboard.ts`) provide visibility into these isolated environments.

### OpenCode Deployment Notes (PopOS VM)
```bash
# Installation
npm i -g opencode-ai

# Start Server (Remote Access Enabled)
export OPENCODE_SERVER_PASSWORD="secure_password"
export OPENCODE_SERVER_USERNAME="opengem"
opencode serve --host 0.0.0.0 --port 8080

# Secure tunnel from host (optional if Tailscale is configured)
ssh -L 8080:localhost:8080 user@popos-vm
```

## Security Requirements
- All `notrust` modules MUST log every network request to the Audit Firestore.
- Failures in `notrust` modules must NOT crash the main Gateway process.
