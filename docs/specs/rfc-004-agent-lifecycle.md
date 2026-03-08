# RFC-004: Agent Lifecycle & Memory Model

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## 1. Abstract

This RFC defines the lifecycle of an OpenGem Agent — from initialization to termination. It details how agents persist state ("Memory"), how sessions are paused/resumed, and how the **Orchestrator** coordinates multi-step workflows while enforcing security boundaries.

## 2. Agent Definition

An **Agent** in OpenGem is NOT a long-running daemon by default. It is an **Ephemeral Orchestration Unit** that exists to solve a specific goal within a specific **Secure Session**.

### 2.1 The State Machine

| State | Description | Allowed Actions |
|-------|-------------|-----------------|
| `INIT` | Bootstrapping, loading manifest | None (read-only) |
| `PLANNING` | Analyzing goal, identifying skills | Check Manifest, Query Skills |
| `EXECUTION` | Running commands, using tools | **Invoke Capabilities** |
| `VERIFICATION`| Confirming outcome | Read-only check |
| `TERMINATED` | Cleanup, log flush | None |

## 3. Memory Model

Agents need memory to reference past actions. OpenGem divides memory into four strictly defined segments:

### 3.1 The "Session" Container
All state lives in `~/.opengem/sessions/<session-id>/`.

1.  **User Memory (Explicit):**
    - What the user told the agent.
    - *Storage:* `context.json`
2.  **Working Memory (Short-Term):**
    - Tool outputs, intermediate steps, scratchpad.
    - *Storage:* In-memory (RAM), flushed to `working.md` on pause.
3.  **Long-Term Memory (Archival):**
    - Summaries of past sessions.
    - *Storage:* Vector database (optional) or `archive/` logs.
4.  **Semantic Memory (Knowledge):**
    - "How to use this codebase".
    - *Storage:* `RAG` index (read-only).

## 4. The Orchestrator Loop

The **Orchestrator** is the "main loop" of the agent. It is the **only** component allowed to call the `Runtime.execute()` choke point.

### 4.1 The Loop logic

```typescript
while (state !== TERMINATED) {
  1. Observation = Runtime.getLastOutput();
  2. Thought = LLM.generate(Memory + Observation);
  3. Action = Parse(Thought);
  4. Decision = CapabilityEnforcer.check(Action);

  if (Decision.DENY) {
    Runtime.emitError("Security Violation");
    state = TERMINATED; // OR request approval
  } else {
    Runtime.execute(Action);
  }
}
```

## 5. Persistence & Recovery

### 5.1 Suspend / Resume
Because the state is file-backed (`session.json`), an agent can be paused (Process Killed) and resumed days later. The `Orchestrator` simply rehydrates the `Memory` object from disk.

### 5.2 Crash Recovery
If the runtime crashes (e.g., OOM), the **Supervisor** (Control Plane) detects the exit code.
- **Auto-Recover:** If safe, restart and replay the last `Thought`.
- **Fail-Safe:** If crash was due to a security violation or panic, lock the session and alert the user.

## 6. Security Implications

-   **Memory Poisoning:** Agents cannot write to their own "Kernel Memory". They can only append to the User/Working logs.
-   **Secret Leaks:** Secrets are **never** stored in the Session JSON. They are referenced by ID (`secret:github_token`) and resolved only at execution time by the Runtime.

---
**END RFC-004**
