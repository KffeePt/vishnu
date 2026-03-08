# RFC-020: OpenGem Firewall

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

`opengem-firewall` is a platform-level, policy-first enforcement layer that provides capability-based access control, manifest & artifact integrity verification, sandboxing, secrets protection, runtime auditing, and policy-driven supervised execution for agents, skills, and scripts. It is not a network-only firewall — it is a **unified trust & execution control system** that prevents, detects, and limits side effects (file system, network, process, secrets exfiltration) and provides a tamper-evident audit trail suitable for marketplace distribution and forensics.

---

## 2. Motivation

Current problems observed:

* Agent behavior may deviate from declared capabilities (capability/behavior mismatch).
* `Skill.md` and scripts are unsigned/unauthenticated artifacts and can be swapped or modified at any time.
* Unsandboxed execution leaks API keys, cookies, secrets, or PII via outputs and logs (including hidden agent reasoning or chain-of-thought artifacts).
* Marketplace distribution requires automated vetting and runtime safety guarantees.
* Need for non-repudiable auditing and a user-supervised control plane (approve/deny actions).
* Require an architecture that enforces "no-trust" capability control while enabling useful automation.

---

## 3. Design Goals

1. **Enforce policy at adapter boundaries.** No adapter call should occur without policy validation and audit.
2. **Manifest & artifact integrity.** All skills & scripts executed must be verifiably signed; runtime integrity checks prevent tampering.
3. **Detect capability/behavior mismatches.** Compare declared capabilities to observed behavior and flag/mitigate mismatches.
4. **Minimal attack surface.** Default-deny network + resource access; allow by policy.
5. **Secrets & PII protection.** Prevent accidental or malicious exfiltration; pre-output filtering and redaction.
6. **Supervised approval workflows.** Require user/controller approval for sensitive actions.
7. **Tamper-evident auditing & rollback.** Git-like diffs, immutable audit logs, and workspace snapshots.
8. **Marketplace pipeline integration.** Static + dynamic vetting, signature chains, revocation.
9. **Extensible & testable.** Adapter-based architecture, Zod-schemata for manifests and runtime events.

---

## 4. Where `opengem-firewall` Lives

* **Platform (definitions & policy):** `platform/security/opengem-firewall/`
  Holds capability schema, policy language, signature verification, trusted key store, scanner definitions, and verification rules.

* **Runtime / Infra (enforcement):** `backend/infra/core/security/`
  Contains enforcement modules: sandbox runner, container runner, adapter wrappers, syscall monitor, network enforcer, output filters, audit logger.

This split keeps policy deterministic and enforcement localized to runtime adapters.

---

## 5. Core Concepts & Data Models

### 5.1 Capability Model (Zod schema)

A capability is a fine-grained permission declared by a skill and enforced at adapter call time.

```ts
// platform/security/schemas/capability.ts
import { z } from "zod";

export const CapabilitySchema = z.object({
  name: z.string(),                // e.g., "fs.read"
  resource: z.string().optional(), // e.g., "/tmp/*" or "api.example.com"
  mode: z.enum(["allow", "deny"]).default("allow"),
  constraints: z.record(z.any()).optional() // e.g., time windows, rate limits
});

export type Capability = z.infer<typeof CapabilitySchema>;
```

### 5.2 Skill Manifest (Skill.md) — canonical schema (Zod)

Skill manifests must be structured YAML/JSON with a cryptographic signature in the marketplace pipeline.

```ts
// platform/security/schemas/skillManifest.ts
import { z } from "zod";

export const SkillManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  author: z.string(),
  entrypoint: z.string(), // relative path to script/bundle
  capabilities: z.array(CapabilitySchema),
  expected_side_effects: z.array(z.string()).optional(),
  runtime_constraints: z.object({
    max_cpu_seconds: z.number().optional(),
    max_memory_mb: z.number().optional(),
  }).optional(),
  signed_by: z.string().optional(), // key id of signer (marketplace)
  signature: z.string().optional(), // base64 Ed25519 signature over canonical manifest + hash of bundle
});
export type SkillManifest = z.infer<typeof SkillManifestSchema>;
```

### 5.3 Adapter Event (Zod)

Every adapter call must emit an event validated by schema for auditing & policy.

```ts
export const AdapterEventSchema = z.object({
  timestamp: z.string(),
  actor: z.string(),         // skill id / agent id
  capability: z.string(),    // "fs.write"
  resource: z.string().optional(),
  input: z.any().optional(),
  output: z.any().optional(),
  result: z.enum(["allowed", "blocked", "error"]),
  rule_hit: z.string().optional()
});
```

---

## 6. Cryptographic Guarantees & Supply Chain

### 6.1 Artifact Signing

* All marketplace artifacts (Skill manifests and script bundles) are signed by the publisher using **Ed25519** (recommended) or RSA-PSS as fallback.
* Signatures are produced over a canonical serialization: canonicalized manifest JSON + SHA-256 of artifact bundle.
* Clients must verify signature chain against a trusted key store (root-of-trust) before allowing execution.

### 6.2 Immutable Install & Hash Checks

* Installed plugins are stored in an immutable store (installation path marked read-only).
* On startup and periodically, the runtime verifies bundle hashes against signed manifests.

### 6.3 Revocation & CRL

* Maintain a revocation registry (CRL) for keys and artifact hashes. Marketplace must publish revocation lists; runtime must check at policy evaluation.

---

## 7. Enforcement Architecture

### 7.1 Adapter Wrapping

All core adapters (fs, network, process, container, gpio, etc.) are wrapped by enforcement proxies in `infra/core/security/enforcement/`. A wrapped adapter performs:

1. Validate caller identity (actor)
2. Validate manifest signature & installation integrity
3. Check declared capability against capability model & policy
4. Apply constraints (resource allowlists, time windows, quotas)
5. If allowed: call real adapter; capture syscall / network info
6. Validate/scan output for secrets/PII via output filters
7. Emit `AdapterEvent` to audit log
8. If disallowed: block and log

### 7.2 Policy Engine

* Runs in platform layer. Policy language should be declarative JSON/YAML with support for allowlists, deny rules, resource globs, time/rate constraints, and risk scoring.
* Policy evaluation returns `{ allow: boolean, rule: string, actions: ["block"| "notify"| "sandbox" ] }`.

### 7.3 Sandbox & Container Runner

* Default execution environment: container runtime (podman/docker with strict seccomp, read-only root, no host mounts, no host network).
* Container runner enforces:

  * Filesystem namespaces
  * User namespaces (non-root inside container)
  * Seccomp filters / syscalls whitelist
  * cgroups limits (cpu, memory, disk I/O)
  * Network namespace with default-deny and egress allowlist
  * No credentials injected unless explicitly approved

### 7.4 Output Filters & Secret Scanners

* Before any stdout/stderr or return value is surfaced to UI:

  * Run regex-based & ML-assisted secret scanner (API keys, tokens, email, phone, PII patterns).
  * Run policy-based redaction or block.
* All filtered content is logged as masked with reference to adapter event.

### 7.5 Behavior Profiling & Anomaly Detection

* Track aggregate metrics per skill: file paths accessed, networks contacted, process spawns.
* If observed behavior deviates from declared capabilities or from historical baseline (statistical anomaly), auto-flag and possibly auto-block based on risk score.

### 7.6 Supervision & Approval Flow

* Execution modes:

  * `supervised` (default): sensitive actions require user/owner approval; agent pauses and emits approval request.
  * `semi-supervised`: low-risk actions proceed; medium/high risk require user or admin approval.
  * `autonomous` (opt-in, high trust): actions allowed per declared capabilities without interactive confirmation.
* Approval UI: present diff/snapshot + exact action description. Approvals are recorded and signed by the approver.

---

## 8. Secrets & PII Protection

1. **No default injection:** secrets are not present inside container runtime unless explicitly injected via a secure approval API. Injection is ephemeral and recorded.
2. **Secret Vault & Ephemeral Tokens:** secrets are provided via a vault service which issues time-limited tokens to adapters (not raw keys).
3. **Output scanning & redaction** as above.
4. **No host-level mounts or keychain access** to agents by default.

---

## 9. Marketplace Vetting Pipeline

1. **Static analysis:** code scanning for eval, `child_process`, suspicious libraries, obfuscated code.
2. **Signature & reproducible build checks:** verify bundle hash matches manifest signature; encourage reproducible builds.
3. **Dynamic analysis (honeypots):** run skills in a high-fidelity sandbox with simulated secrets and sensitive resources to test for exfiltration attempts.
4. **Behavior scoring:** assign risk score; require higher-signing trust for risky capabilities.
5. **Publish-time signing:** marketplace publishes manifest + signature + metadata + CRL entries.

Artifacts failing any stage are rejected or flagged with higher restrictions (e.g., supervised-only).

---

## 10. Auditing & Workspace Tracking (Git-like)

* Every execution affecting a workspace must:

  1. Snapshot workspace state before execution (content-addressed).
  2. Track all writes and record diffs (file-level patch sets).
  3. Produce a structured change record: files changed, lines added/removed, binary diffs, processes spawned, network calls.
  4. Commit change record into an append-only audit store (content-addressed).
* GUI: present commits as "agent commits" with ability to review, revert/rollback, cherry-pick changes into main workspace.
* Audit logs must be tamper-evident (append-only + signed by runtime agent) and optionally anchored to an external ledger for non-repudiation.

---

## 11. Threat Model (brief)

Threats addressed:

* Malicious or compromised skill trying to access secrets, escalate privileges, modify host.
* Supply chain attacks: swapped or tampered skill bundles.
* Malicious publish to marketplace to trick users.
* Hidden exfiltration via agent outputs.
* Privilege escalation via container escape.

Assumptions:

* Hardware root of trust may be present but not required.
* Signed manifests rely on secure key storage for signers.
* Adapters are the only allowed host interface; direct host calls by skill code are not possible if runtime enforced.

Limitations:

* Zero-day sandbox escapes are possible but mitigated by cgroups, seccomp, kernel hardening, and minimal host exposure.
* Malware detection is probabilistic; focus is containment, detection, and rapid remediation.

---

## 12. APIs & Operational Interfaces

### 12.1 Runtime Adapter Invocation (pseudo)

```ts
// infra enforcement wrapper
async function callAdapter(actorId, capability, resource, input) {
  const manifest = verifyManifest(actorId);
  const policyDecision = policyEngine.evaluate(actorId, capability, resource, manifest);
  if (!policyDecision.allow) {
    audit.log({ actorId, capability, resource, result: "blocked", rule: policyDecision.rule });
    return { error: "blocked", reason: policyDecision.rule };
  }
  // execute in sandboxed context
  const result = await sandboxRunner.execute(adapterName, input, policyDecision.constraints);
  const postValidated = outputValidator.validate(result);
  audit.log({ actorId, capability, resource, input, output: postValidated, result: "allowed", rule: policyDecision.rule });
  return postValidated;
}
```

### 12.2 Approval API

```http
POST /api/v1/approvals
Body: {
  actorId, pendingActionId, approverId, mode
}
```

### 12.3 Audit Query API

```http
GET /api/v1/audit?actor=skill-x&since=...
```

---

## 13. Testing & Validation Strategy

1. **Unit tests** for policy engine, schema validators (Zod), signature verification.
2. **Integration tests** for enforcement wrappers and adapter proxies.
3. **Fuzz** adapter inputs & outputs to ensure no bypass routes.
4. **Red-team** with simulated malicious skills attempting exfiltration, spying, and persistence.
5. **Reproducible sandbox tests**: marketplace dynamic analysis with seeded secrets and network honeypots to catch exfiltration logic.
6. **Continuous monitoring** in prod with anomaly detectors and canary agents.

---

## 14. Migration Plan (high level)

1. **Platform definitions:** implement capability schema, signing verification, policy engine library under `platform/security/opengem-firewall`.
2. **Adapter wrappers:** implement enforcement proxies for core infra adapters (`fs`, `network`, `process`, `containers`, `io`, `render`, `security`) in `backend/infra/core/security`.
3. **Install-time immutable store:** change installer to write to immutable path and record signed manifest.
4. **Marketplace integration:** require signing and publish revocation list endpoints.
5. **UI/Approval flow:** add approval components in `modules/core/components` and router screens to review agent actions.
6. **Audit & workspace tracking:** implement snapshot & diffing service and integrate into UI.
7. **Rollout:** default to `supervised` for all third-party skills; allow `autonomous` only after a whitelisting trust process.

---

## 15. Definition of Done

* All skill/script execution requires manifest signature verification; unsigned artifacts are rejected or run in fully contained demo mode.
* All core adapters are wrapped and enforce policy & logging.
* Output filtering prevents obvious secret leaks (API keys, tokens, common PII) in test cases.
* Marketplace pipeline enforces signing and dynamic sandbox testing.
* GUI displays agent execution diffs and provides approve/revert workflow.
* Audit logs are append-only and queryable.
* Capability/behavior mismatch policy flags and produces alerts; an initial set of anomaly detectors exist.

---

## 16. Guarantees & Tradeoffs

| Guarantee              | Mechanism                                           |
| ---------------------- | --------------------------------------------------- |
| Integrity of artifacts | Signed manifests + hash + immutable installs        |
| Containment            | Container + seccomp + cgroups + no host mounts      |
| Policy enforcement     | Adapter-level proxies + policy engine               |
| Detection              | Static + dynamic analysis + behavioral profiling    |
| Auditability           | Append-only signed logs + workspace diffs           |
| User control           | Supervised approval UI + ephemeral secret injection |

Tradeoffs:

* Usability friction: default supervised mode increases prompts/approval.
* No absolute malware detection: focus on containment + fast detection.
* Operational complexity: requires key management, revocation, policy administration.

---

## 17. Open Questions / Future Work

* Hardware attestation integration (TPM / Secure Enclave) for stronger root-of-trust.
* Formal verification of policy engine for critical deployments.
* Privacy-preserving ML models for better PII detection without leaking data.
* Marketplace trust tiers and delegation of signing authority.
* Optional remote attestation service for high-assurance deployments.

---

## 18. Appendix — Example Skill Manifest (canonical JSON)

```json
{
  "name": "example-skill",
  "version": "1.2.0",
  "author": "alice@example.com",
  "entrypoint": "dist/index.js",
  "capabilities": [
    {"name":"fs.read","resource":"/projects/example/*"},
    {"name":"network.http","resource":"api.example.com"}
  ],
  "runtime_constraints": {"max_cpu_seconds": 30, "max_memory_mb": 256},
  "signed_by": "marketplace-key-01",
  "signature": "BASE64_SIGNATURE"
}
```

---

## 19. Final Notes

`opengem-firewall` unifies supply-chain integrity, runtime enforcement, secrets protection, and user-supervised control into a single policy-first system that is pluggable into the platform and enforces the RFC-011 dependency law: **security policies are platform-defined; enforcement is runtime-localized at infra adapters**.
