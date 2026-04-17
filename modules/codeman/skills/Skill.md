# Codeman Bridge

This module is a bridge to the live Codeman implementation in `/codeman`.
Launcher entrypoints point at `/modules/codeman`, which delegates to the
authoritative auth, menu, CI/CD, and TUI flows under `/codeman`.

The migration contract is:
- new integrations should import from `modules/codeman`
- legacy `/codeman` files remain temporary shims or legacy implementations
- deletion is only safe after parity checks and no non-shim runtime imports remain

