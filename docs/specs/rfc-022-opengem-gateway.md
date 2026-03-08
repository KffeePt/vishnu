# RFC-022: OpenGem Gateway

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---


**Status:** Draft
**Authors:** KffeePt
**Created:** 2026-02-07
**Version:** 0.1.0

------------------------------------------------------------
1. Abstract
------------------------------------------------------------

This RFC defines the package architecture for the system,
including the Gateway layer and the SDK. The goal is to:

- Isolate I/O and transport concerns
- Separate runtime, control plane, and interfaces
- Enable multiple clients and transports
- Provide a stable SDK for external developers
- Maintain strict boundaries between layers

This document establishes folder structure, responsibilities,
interfaces, and design constraints.

------------------------------------------------------------
2. Design Principles
------------------------------------------------------------

The architecture follows these principles:

1. Gateway is the control plane.
2. Runtime is stateless or minimally stateful.
3. All external communication flows through the Gateway.
4. SDK must not depend on internal implementation details.
5. Adapters isolate protocols and platforms.
6. Contracts are defined through schemas or interfaces.

------------------------------------------------------------
3. High-Level Architecture
------------------------------------------------------------

            Clients / Apps
        (CLI, Web, Mobile, Bots)
                    |
                    |
                 SDK Layer
                    |
                    |
                Gateway Layer
        (Routing, Sessions, Events)
                    |
        --------------------------
        |                        |
   Runtime / Agents        External Services
     (LLM, tools)        (DB, APIs, queues)

------------------------------------------------------------
4. Package Structure
------------------------------------------------------------

Recommended monorepo layout:

/packages
    /gateway
    /runtime
    /protocol
    /sdk
    /adapters
    /cli
    /shared

------------------------------------------------------------
5. Package Responsibilities
------------------------------------------------------------

5.1 gateway

Purpose:
Control plane, routing, sessions, event distribution.

Responsibilities:
- WebSocket or IPC server
- Session management
- Authentication
- Message routing
- Adapter orchestration
- Event broadcasting

Must NOT:
- Execute heavy business logic
- Depend on UI
- Contain model-specific code

Example structure:

gateway/
  src/
    server/
    sessions/
    routing/
    events/
    registry/
    config/
    types/

------------------------------------------------------------

5.2 runtime

Purpose:
Execution of agents, workflows, or tasks.

Responsibilities:
- Tool execution
- Model interaction
- Pipelines
- Job execution

Must NOT:
- Handle transports directly
- Maintain client connections

------------------------------------------------------------

5.3 protocol

Purpose:
Shared contracts between SDK, gateway, and clients.

Responsibilities:
- Request/response schemas
- Event definitions
- Error codes
- Versioning

This package must be dependency-light.

------------------------------------------------------------

5.4 adapters

Purpose:
Transport and platform integrations.

Examples:
- HTTP adapter
- WebSocket adapter
- Telegram adapter
- Discord adapter
- CLI adapter

Adapter Pattern:

Adapter
  connect()
  send()
  receive()
  normalizeMessage()

Adapters emit normalized events to Gateway.

------------------------------------------------------------

5.5 sdk

Purpose:
Developer-facing API to communicate with the gateway.

Responsibilities:
- Connection management
- Typed client
- Event subscriptions
- Retry and reconnect logic

SDK must:
- Depend only on protocol
- Not depend on gateway internals

Example structure:

sdk/
  src/
    client/
    connection/
    events/
    auth/
    types/

------------------------------------------------------------

5.6 shared

Purpose:
Utilities shared across packages.

Examples:
- logging
- config loading
- small helpers

Must remain minimal to avoid tight coupling.

------------------------------------------------------------

6. Gateway Internal Architecture
------------------------------------------------------------

Gateway modules:

gateway/
  server/
    websocketServer.ts
    connectionManager.ts

  routing/
    messageRouter.ts
    commandRouter.ts

  sessions/
    sessionStore.ts
    sessionManager.ts

  events/
    eventBus.ts
    broadcaster.ts

  registry/
    adapterRegistry.ts

Flow:

Client → Gateway → Router → Runtime → Gateway → Client

------------------------------------------------------------

7. Session Model
------------------------------------------------------------

A session represents:

- User identity
- Conversation state
- Context metadata
- Execution history

Session storage options:
- Memory + persistence
- Database
- File store

Gateway is source of truth.

------------------------------------------------------------

8. Event Model
------------------------------------------------------------

Events must be:

- Typed
- Versioned
- Serializable

Examples:

chat.message
session.updated
agent.started
agent.finished
system.health

------------------------------------------------------------

9. SDK Design
------------------------------------------------------------

SDK must provide:

connect()
disconnect()
send()
subscribe()
invoke()

Example usage:

client = new GatewayClient(url)
await client.connect()

client.subscribe("chat.message", handler)

await client.invoke("agent.run", payload)

------------------------------------------------------------

10. Transport Abstraction
------------------------------------------------------------

Gateway must support multiple transports:

Transport Interface:

start()
stop()
send()
onMessage()

Possible transports:

WebSocket
HTTP streaming
Local IPC
gRPC (optional future)

------------------------------------------------------------

11. Plugin System
------------------------------------------------------------

Adapters and tools should register through:

registerAdapter(name, adapter)
registerTool(name, tool)

This avoids modifying core code.

------------------------------------------------------------

12. Error Handling
------------------------------------------------------------

Errors must include:

code
message
details
traceId

Never leak internal stack traces in production mode.

------------------------------------------------------------

13. Security Considerations
------------------------------------------------------------

Authentication:
- Tokens or keys

Authorization:
- Role-based permissions

Transport security:
- TLS when remote

------------------------------------------------------------

14. Versioning Strategy
------------------------------------------------------------

protocol version must be compatible across:

SDK
Gateway
Clients

Use semantic versioning.

------------------------------------------------------------

15. Future Extensions
------------------------------------------------------------

Planned capabilities:

- Distributed gateways
- Multi-node runtime
- Plugin marketplace
- Observability module

------------------------------------------------------------

16. Decision Summary
------------------------------------------------------------

Gateway = control plane
Runtime = execution
SDK = client interface
Protocol = contract
Adapters = integrations

Strict boundaries enforced.

END RFC
