# RFC-003: Execution Runtime & Isolation Model

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC defines the **OpenGem Runtime**, the engine responsible for executing untrusted skill code. It introduces a pluggable **Isolation Model** that allows execution to scale from a local Node.js process (low isolation) to a Firecracker MicroVM (maximum isolation) without changing the skill code.

## 2. The Runtime Interface

Regardless of where the code runs, it sees the same "Platform API". We do NOT expose raw Node.js APIs to skills.

### 2.1 The Standard Library (Virtualized)

| API | Real Node.js | OpenGem Virtual | Behavior |
|-----|--------------|-----------------|----------|
| `fs` | `import fs` | `gem.fs` | Scoped to manifest paths. |
| `http` | `import fetch` | `gem.net` | Whitelisted domains only. |
| `child_process`| `spawn()` | `gem.exec` | Whitelisted binaries only. |

## 3. Isolation Levels

The user (or system policy) selects the isolation level per agent.

### Level 0: Host Process (Development)
- **Mechanism:** JavaScript `Proxy` objects and runtime checks within the main `codeman` process.
- **Pros:** Zero latency, easy debugging.
- **Cons:** Shared memory; a crash kills the CLI; malicious code could pollute the global scope.
- **Use Case:** Trusted Core Skills, Local Development.

### Level 1: Container (Standard)
- **Mechanism:** Docker / Podman ephemeral containers.
- **Execution:**
  - Filesystem: Mounted volumes (scoped).
  - Network: Bridge network with firewall rules.
- **Pros:** Filesystem isolation, process namespace separation.
- **Cons:** Startup latency (ms to seconds).
- **Use Case:** Community Skills, General Agent Workflows.
- **Default Runtime:** Podman (Daemonless, Rootless by default).

### Level 2: MicroVM (Paranoid / Cloud)
- **Mechanism:** AWS Firecracker or QEMU/KVM.
- **Execution:** dedicated kernel per agent.
- **Pros:** True hard multitenancy.
- **Cons:** High complexity, requires virtualization support.
- **Use Case:** Running untrusted code from the open internet.

## 4. The Runtime Bridge (V2)

To ensure strict decoupling and type safety, components communicate via a **Runtime Bridge Pattern**.

### 4.1 Architecture
The runtime exposes a unified, strictly typed interface (`RuntimeBridge`) that provides access to:
- **Gateway**: mDNS and Protocol handling.
- **State**: Global state store and heartbeat.
- **Execution**: Process management and Providers.
- **Registry**: Menu and Action registration.

RunV2 enforces strict TypeScript interfaces (`MenuContext`, `RuntimeMenuContext`) for all interactions. Code casting to `any` is strictly forbidden in core bridges to prevent runtime crashes.

### 4.3 Container Orchestration (`master-agent.ts`)

The `MasterAgent` class in `runtime/orchestration/master-agent.ts` acts as the control plane for Level 1 (Container) isolation:

- **Runtime Selection**: Prioritizes **Podman** (Daemonless) but falls back to Docker if Podman is missing.
- **Agent Lifecycle**: Manages starting, stopping, and reconciling container agents.
- **Image Strategy**: Uses standardized images (e.g., `opengem-alpine`, `opengem-popos`) to ensure consistent environments.
- **Pre-flight Checks**: Validates runtime availability via `runtime/orchestration/pre-flight.ts` before attempting execution.

## 5. The Bridge Protocol (IPC)

Communication between the **Control Plane** (Host) and the **Execution Runtime** (Guest) happens via JSON-RPC.

```json
Request:
{
  "id": 1,
  "method": "fs.readFile",
  "params": ["./src/main.ts"]
}

Response:
{
  "id": 1,
  "result": "console.log('hello')..."
}
```

The **Host** enforces capabilities *before* forwarding the request to the OS (for Level 0) or *configures* the container constraints (for Level 1).

## 5. Resource Management

To prevent Denial of Service (DoS):

- **Timeouts:** Every execution step has a hard timeout (default 30s).
- **Memory Limits:** Containers are capped (e.g., 512MB RAM).
- **Output Limits:** Stdout is truncated after 10MB to prevent buffer exhaustion attacks.

---
**END RFC-003**
