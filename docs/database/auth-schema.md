# Database & Authentication Schema

Vishnu uses Firebase Auth for identity, RTDB for live access authority, Firestore for policy and logs, and Cloud Functions for session mutation/enforcement.

## Identity vs Access

- Firebase Auth answers: who is this user?
- RTDB answers: does this user have a currently valid live session?
- Custom claims still carry the user's role, but claims alone are not enough to grant access.

## Roles

Supported managed roles:

- `owner`
- `admin`
- `maintainer`
- `staff`
- `dev`
- `projectManager`
- `senior`
- `junior`
- `partner`
- `user`

## Live Session Records

The canonical session record lives at `/sessions/{sessionId}` in RTDB.

Required fields:

- `uid`
- `role`
- `createdAt`
- `lastActivity`
- `expiresAt`
- `revoked`
- `isOwnerBypass`
- `client`

The current active session for each user is mirrored at `/users/{uid}.activeSessionId`.

## Global Timer Policy

Live timer values are stored at `/globalTimers`:

- `tuiInactivityLock`
- `authWindowTimeout`
- `ownerBypassWindow`
- `tokenRefreshLead`
- `updatedAt`
- `updatedBy`

Compatibility mirrors in milliseconds are still stored for older TUI surfaces:

- `projectInactivityMs`
- `browserLoginTimeoutMs`
- `ownerBypassTimeoutMs`
- `tokenRefreshSkewMs`
- `forcedReauthAt`

## Firestore Policy and Logs

### `policy/accessControl`

Stores upper bounds for live timers:

- `maxSessionDuration`
- `maxBypassDuration`

### `sessionLogs`

Append-only audit trail for:

- session creation
- validation
- heartbeats
- revocation
- expiration

## Enforcement Surfaces

### Codeman TUI

- Login establishes Firebase Auth identity.
- Project entry creates a live access session through Cloud Functions.
- Heartbeats and timer changes go through callable functions.
- RTDB subscriptions are read-only from the client's perspective.

### Dashboard

- Browser login exchanges the Firebase ID token for a Firebase session cookie.
- Server routes validate the RTDB session on every access-sensitive request.
- Browser activity touches the session through `/api/session`, not direct client RTDB writes.

## Browser Session Bridge

The TUI can mint a dashboard session handoff by calling `createSessionCookieBridge` and opening the returned `/api/auth/bridge` URL on the dashboard domain.

## Security Rules

- RTDB rules live in `database.rules.json`
- Firestore rules live in `firestore.rules`

These rules allow authenticated users to read timer state and their own session state, while owner/admin operations remain server-controlled.
