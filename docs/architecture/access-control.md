# Access Control Architecture

Vishnu now uses a shared, server-authoritative access layer across the Codeman TUI and the Vercel dashboard.

## Core Model

- Firebase Auth proves identity.
- RTDB is the live access authority.
- Firestore stores policy bounds and append-only session logs.
- Cloud Functions own the canonical session mutations used by the TUI.
- Dashboard server routes enforce the same RTDB session state before allowing access.

## Realtime Database

### `/globalTimers`

```json
{
  "tuiInactivityLock": 3600,
  "authWindowTimeout": 120,
  "ownerBypassWindow": 3600,
  "tokenRefreshLead": 120,
  "updatedAt": 1712199323000,
  "updatedBy": "uid-or-email"
}
```

Legacy millisecond mirrors are still written for compatibility with older TUI screens:

```json
{
  "projectInactivityMs": 3600000,
  "browserLoginTimeoutMs": 120000,
  "ownerBypassTimeoutMs": 3600000,
  "tokenRefreshSkewMs": 120000,
  "forcedReauthAt": 1712199323000
}
```

### `/sessions/{sessionId}`

```json
{
  "uid": "user_id",
  "role": "owner",
  "createdAt": 1712199323000,
  "lastActivity": 1712199500000,
  "expiresAt": 1712202923000,
  "revoked": false,
  "isOwnerBypass": false,
  "client": "tui"
}
```

### `/users/{uid}`

```json
{
  "role": "owner",
  "activeSessionId": "sessionId",
  "email": "user@example.com",
  "updatedAt": 1712199500000
}
```

## Firestore

### `policy/accessControl`

```json
{
  "maxSessionDuration": 86400,
  "maxBypassDuration": 86400,
  "updatedAt": 1712199323000,
  "updatedBy": "uid-or-email"
}
```

### `sessionLogs`

Each log entry stores:

- `uid`
- `sessionId`
- `event`
- `actorUid`
- `timestamp`
- `metadata`

## Cloud Functions

The access-control backend lives in `functions/src/access-control.ts`.

### Exported callables

- `getAccessBootstrap`
- `createAccessSession`
- `validateAccessSession`
- `touchAccessSession`
- `revokeAccessSession`
- `revokeAllAccessSessions`
- `listAccessSessions`
- `updateGlobalTimers`
- `createSessionCookieBridge`

## TUI Flow

1. Firebase Auth login returns an ID token.
2. Project entry calls `createAccessSession`.
3. Heartbeats call `touchAccessSession`.
4. Global Settings reads `/globalTimers` live from RTDB.
5. Maintenance timer edits call `updateGlobalTimers`.
6. Logout or close revokes the live session.

## Dashboard Flow

1. Browser login posts the ID token to `/api/auth/session-login`.
2. The route creates or refreshes the RTDB access session and mints the Firebase session cookie.
3. `/api/session` becomes the dashboard session authority surface:
   - `GET` validates the live RTDB session
   - `PATCH` touches the live RTDB session
   - `DELETE` revokes it
4. Admin layouts reject requests when the RTDB session is missing, revoked, expired, or inactive.

## Browser Handoff

For TUI-to-dashboard handoff:

1. TUI creates a live access session.
2. TUI calls `createSessionCookieBridge`.
3. The returned URL points at `/api/auth/bridge`.
4. The dashboard verifies the session cookie, stores it as `__session`, and redirects into `/admin`.

## Rules

- RTDB rules are defined in `database.rules.json`.
- Firestore rules are updated in `firestore.rules`.
- Server/admin SDK writes bypass rules, but client-facing reads and limited writes are still constrained by them.

## Operational Notes

- The dashboard should only initialize a client RTDB connection when `NEXT_PUBLIC_FIREBASE_DATABASE_URL` is explicitly set.
- The TUI always prefers the Vishnu backend bundle under `vishnu/.secrets` for centralized access control.
- If the live RTDB session is not valid, access is denied even if Firebase Auth still says the user is signed in.
