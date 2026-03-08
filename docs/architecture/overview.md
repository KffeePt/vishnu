# Architecture Overview

## The Trinity

The **Vishnu System** is an engineered "Preserver" framework designed to maintain order, ensure consistency, and reduce entropy across multiple development projects. It is built upon a trinity of core components:

### 1. Vishnu (The Preserver)
The central nervous system.
- **Role:** Installation, Updates, System Integrity.
- **Repo:** `KffeePt/vishnu`
- **Mechanism:** A global C++ installer (`vishnu-installer.exe`) that clones/updates the source and links the global `vishnu` command.
- **Location:** `~/Documents/GitHub/vishnu` (Source), `~/.vishnu` (Config).

### 2. CodeMan (The Creator)
The interactive interface.
- **Role:** Developer Tooling, Context Awareness, Scaffold & Config.
- **Repo:** Part of Vishnu (Monorepo).
- **Format:** Key-driven Terminal Layout (TUI).
- **Key Feature:** **Context Awareness**. CodeMan detects if you are in a valid project, verifies `.env` consistency against global state, and adapts its menus (e.g., specific tools for Next.js vs Flutter).

### 3. Shiva (The Destroyer/Organizer)
The autonomous agent.
- **Role:** Entropy Management, Cleanup, Documentation Organization.
- **Behavior:** Runs as a singleton background process.
- **Function:** Monitors the `docs/` folder, archives stale tasks, and ensures the file structure adheres to the "Golden Path".

## System Philosophy

> "Order out of Chaos."

Vishnu enforces a **Global Workflow** where:
1.  All projects live in `~/Documents/GitHub`.
2.  Every project has a standard `.env` structure (managed by Vishnu).
3.  Authentication is centralized via **Firebase Auth**, employing secure POST body tokens, CSRF nonces, and strictly-typed HTTP-only cookies.
4.  Data and state management lean on **Firestore** as the primary backend for both the Vishnu CLI and all generated client apps (Flutter/Next.js).
5.  Documentation is self-organizing (Shiva).

## Directory Structure
```
~/Documents/GitHub/vishnu/
├── bin/                # Global CLI entry points
├── codeman/            # Main Typescript CLI Application
│   ├── core/           # Engine, State, Auth
│   ├── menus/          # Interactive Menu Nodes
│   └── setup/          # C++ Installer Source
├── shiva/              # Background Organizer Agent
└── docs/               # System Documentation (You are here)
```
