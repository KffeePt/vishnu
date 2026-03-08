# RFC-015: OpenGem Framework Specification

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---



## Framework API Surface

### 1. `io` — Terminal & User Interaction
| Method | Description |
|--------|-------------|
| `io.text(prompt)` | Read a line of text input |
| `io.confirm(prompt)` | Yes/No confirmation |
| `io.select(prompt, options)` | Single-select list |
| `io.waitForKey()` | Wait for any keypress |
| `io.clear()` | Clear terminal screen |
| `io.hideCursor()` / `io.showCursor()` | Cursor visibility |
| `io.enableMouse()` / `io.disableMouse()` | Mouse event capture |

**Runtime Source**: `runtime/io/io.ts`

---

### 2. `state` — Persistent State Management
| Method | Description |
|--------|-------------|
| `state.get(key)` | Retrieve value |
| `state.set(key, value)` | Store value |
| `state.remove(key)` | Delete key |
| `state.clear()` | Clear all state |
| `state.subscribe(key, callback)` | Watch for changes |

**Runtime Source**: `runtime/state/state.ts`

---

### 3. `render` — UI Composition
| Method | Description |
|--------|-------------|
| `render.frame(options)` | Render a framed box |
| `render.list(title, items)` | Render interactive list |
| `render.table(data)` | Render data table |
| `render.progress(percent)` | Progress bar |

**Runtime Source**: `runtime/render/render-coordinator.ts`, `codeman/platform/components/`

---

### 4. `registry` — Plugin & Capability Discovery
| Method | Description |
|--------|-------------|
| `registry.getPlugins()` | List loaded plugins |
| `registry.getCapabilities()` | List available capabilities |
| `registry.onReload(id, callback)` | Hot reload subscription |

**Runtime Source**: `runtime/registry/registry.ts`

---

### 5. `fs` — Filesystem Operations 🚧 NEW
| Method | Description |
|--------|-------------|
| `fs.read(path)` | Read file contents |
| `fs.write(path, data)` | Write file |
| `fs.exists(path)` | Check existence |
| `fs.list(dir)` | List directory |
| `fs.watch(path, callback)` | Watch for changes |
| `fs.remove(path)` | Delete file/dir |

**Runtime Source**: TO BE CREATED (`runtime/fs/`)

---

### 6. `exec` — Process & Shell Execution 🚧 NEW
| Method | Description |
|--------|-------------|
| `exec.run(cmd, args)` | Run command, wait for result |
| `exec.spawn(cmd, args)` | Spawn background process |
| `exec.stream(cmd, onData)` | Stream stdout/stderr |
| `exec.kill(pid)` | Terminate process |

**Runtime Source**: TO BE CREATED (`runtime/exec/`)

---

### 7. `net` — Network & HTTP 🚧 NEW
| Method | Description |
|--------|-------------|
| `net.fetch(url, options)` | HTTP request |
| `net.ws.connect(url)` | WebSocket connection |
| `net.ws.send(socket, data)` | Send WebSocket message |
| `net.ipc.send(channel, data)` | IPC to agent/container |

**Runtime Source**: Partial in `runtime/bridge/`, TO BE EXPANDED

---

### 8. `agent` — Agent Container Communication 🚧 NEW
| Method | Description |
|--------|-------------|
| `agent.send(containerId, message)` | Send message to agent |
| `agent.receive(containerId)` | Receive agent response |
| `agent.list()` | List active containers |
| `agent.spawn(config)` | Create new agent container |
| `agent.kill(containerId)` | Terminate container |

**Runtime Source**: TO BE CREATED (`runtime/agent/`)

---

### 9. `skills` — Skill Management 🚧 NEW
| Method | Description |
|--------|-------------|
| `skills.register(id, handler)` | Register a skill |
| `skills.execute(id, params)` | Execute a skill |
| `skills.list()` | List available skills |

**Runtime Source**: Partial in `codeman/modules/*/skills/`, TO BE UNIFIED

---

### 10. `config` — Configuration & Secrets 🚧 NEW
| Method | Description |
|--------|-------------|
| `config.get(key)` | Read config value |
| `config.getEnv(name)` | Read environment variable |
| `config.getSecret(key)` | Read secret (vault) |

**Runtime Source**: TO BE CREATED (`runtime/config/`)

---

### 11. `events` — Pub/Sub & Lifecycle 🚧 NEW
| Method | Description |
|--------|-------------|
| `events.emit(event, data)` | Emit event |
| `events.on(event, callback)` | Subscribe to event |
| `events.off(event, callback)` | Unsubscribe |
| `events.once(event, callback)` | One-time subscription |

**Runtime Source**: TO BE CREATED (`runtime/events/`)

---

### 12. `log` — Structured Logging 🚧 NEW
| Method | Description |
|--------|-------------|
| `log.info(message, data)` | Info level |
| `log.warn(message, data)` | Warning level |
| `log.error(message, data)` | Error level |
| `log.debug(message, data)` | Debug level |

**Runtime Source**: TO BE CREATED (`runtime/log/`)

---

## Gap Analysis

| Service | Exists in Runtime | Exposed in Platform API |
|---------|-------------------|-------------------------|
| IO | ✅ `runtime/io` | ✅ `@opengem/services/io` |
| State | ✅ `runtime/state` | ⚠️ Partial |
| Render | ✅ `runtime/render` | ❌ Not exposed |
| Registry | ✅ `runtime/registry` | ❌ Not exposed |
| Filesystem | ❌ Missing | ❌ Not exposed |
| Exec/Shell | ❌ Missing | ❌ Not exposed |
| Network/WS | ⚠️ Partial (`bridge`) | ❌ Not exposed |
| Agent Comms | ❌ Missing | ❌ Not exposed |
| Skills | ⚠️ Scattered | ❌ Not unified |
| Config | ⚠️ Partial (`paths.ts`) | ❌ Not exposed |
| Events | ❌ Missing | ❌ Not exposed |
| Logging | ❌ Missing | ❌ Not exposed |

---

## Implementation Plan

### Phase 1: Expose Existing Services
1. Wire `state`, `render`, `registry` into `@opengem/platform/api/index.ts`
2. Add type exports for all services

### Phase 2: Create Missing Runtime Services
1. `runtime/fs/` — Filesystem wrapper
2. `runtime/exec/` — Process execution
3. `runtime/events/` — Event bus
4. `runtime/log/` — Logging service

### Phase 3: Agent & Skills Infrastructure
1. `runtime/agent/` — Container communication
2. Unify skill registration under Platform API

### Phase 4: Linter Enforcement
1. Update RFC-013 linter to **require** all `[module]/utils` imports use `@opengem/platform/api`
2. Ban direct `@opengem/runtime/*` imports from modules

---

## Future Considerations
- **Sandboxing**: All API calls should be interceptable for capability checks (RFC-009).
- **Remote Runtime**: API facade enables moving Runtime to separate process/worker.
- **Versioning**: Platform API will be versioned (v1, v2) for stability.
