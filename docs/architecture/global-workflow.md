# Global Workflow & Integrity

Vishnu is not just a CLI; it is a workflow enforcer. It ensures that your development environment remains consistent even as you switch between dozens of projects.

## The Global State

Managed by `codeman/core/state.ts`, the Global State persists in `~/.vishnu/state.json`.

```json
{
  "lastActive": {
    "path": "C:\\Users\\Dev\\Documents\\GitHub\\my-app",
    "projectId": "my-app-prod",
    "userEmail": "dev@example.com",
    "lastUsed": "2024-01-01T12:00:00Z"
  }
}
```

## Context Guard Rails

When you run `vishnu`, the system performs a **Triple-Check Validation**:

1.  **Local Context**: Checks the `.env` in the current directory.
2.  **Global History**: Checks where you were last working (`state.json`).
3.  **External Context**: Checks the active project in `firebase-tools` (Firebase CLI).

### The "Context Warning"
If these contexts do not align (e.g., your terminal is in `Project A` but Firebase CLI is set to `Project B`), CodeMan triggers a **Context Warning**.

> ⚠️ **Context Warning**
> Your environment context has changed or is inconsistent.
> - Path: `.../Project A`
> - Firebase: `Project B` (MISMATCH)

This prevents accidental deployments to the wrong environment.

## The "Golden Path" Setup

1.  **Install Vishnu**: Run `setup.exe` (or `setup.bat`).
    - Clones `vishnu` repo.
    - Generates SSH keys.
    - Links `vishnu` command globally.
2.  **Link Project**: Navigate to a project and run `vishnu link-project`.
    - Auto-scans `.env` variables.
    - Updates Global State.
3.  **Develop**: Use `vishnu` to launch dev servers, run tests, or manage users.

## Shiva's Role
While you work, Shiva monitors entropy. If you leave documentation tasks unfinished or files in the wrong place, Shiva's background process (triggered via `shiva/index.ts`) will organize or archive them into `docs/archived_tasks`.
