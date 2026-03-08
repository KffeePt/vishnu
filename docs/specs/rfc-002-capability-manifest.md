# RFC-002: Capability Manifest Specification

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC defines the **Capability Manifest**, a strict JSON-based contract that declares the exact permissions an OpenGem Skill or Agent requires to function. It establishes the **"Default Deny"** security posture, where any action not explicitly listed in the manifest is blocked by the runtime.

## 2. Motivation

In legacy systems (OpenClaw, Vish), agents had ambient authority—inheriting the permissions of the user running the process. This meant a "Weather Skill" could arguably upload SSH keys to a remote server.

To solve this, we introduce **Explicit Capability Grants**.

## 3. Manifest Definition

The manifest is a file named `opengem.manifest.json` located at the root of a Skill package.

### 3.1 Schema Structure

```json
{
  "schemaVersion": "1.0",
  "name": "gem-core-file-manager",
  "version": "1.0.0",
  "description": "Safe filesystem operations",
  "capabilities": {
    "fs": {
      "read": ["./src", "./docs"],
      "write": ["./src"],
      "delete": []
    },
    "net": {
      "outbound": ["https://api.github.com"],
      "inbound": []
    },
    "exec": {
      "allowedBinaries": ["git", "node"],
      "allowShell": false
    },
    "secrets": {
      "vaults": ["github_tokens"]
    }
  }
}
```

### 3.2 Capability Namespaces

| Namespace | Scope | Description |
|-----------|-------|-------------|
| `fs` | Filesystem | Controls paths for read, write, and delete operations. |
| `net` | Network | Whitelists domains for outbound requests. Inbound is generally blocked. |
| `exec` | Process | Whitelists allowed binaries. Shell access is dangerous and marked with `⚠️`. |
| `secrets` | Vault | Grants access to specific secret keys in the Secure Storage. |

## 4. Enforcement Lifecycle

### 4.1 Loading
When a skill is loaded, the `PluginVerifier` reads the manifest. Any syntax errors cause the skill to fail loading immediately.

### 4.2 Granting
During the **Secure Session Handshake**, the user is presented with the requested capabilities.
> "Skill 'File Manager' requests Write Access to './src'. Allow? [y/N]"

### 4.3 Runtime Check
At the **Execution Choke Point**:
1. Skill intercepts a call (e.g., `fs.writeFile`).
2. The `CapabilityEnforcer` compares path against the allowed `fs.write` array.
3. **Match:** Operation proceeds.
4. **No Match:** `AccessDeniedError` is thrown, incident is logged.

## 5. Security Invariants

1.  **Immutability:** A manifest cannot be changed at runtime.
2.  **Path Traversal:** Capabilities are normalized. `../` attempts escaping the scope are detected and blocked.
3.  **Strictness:** Wildcards (`*`) are allowed ONLY in Dev Mode. Production requires explicit paths or domains.

## 6. UX Considerations

- **Grouping:** Capabilities should be grouped by intent ("Network Access") rather than raw API ("socket.connect").
- **Alerts:** "High Risk" capabilities (Shell, Secrets, Delete) are displayed in **RED** during confirmation.

---
**END RFC-002**
