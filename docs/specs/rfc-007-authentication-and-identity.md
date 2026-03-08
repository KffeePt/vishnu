# RFC-007: Authentication and Identity

**Status:** Draft
**Authors:** OpenGem Team
**Created:** 2024-01-01

---


**Status:** Accepted
**Area:** Security / Identity

## 1. Overview
OpenGem utilizes **Firebase Authentication** as its primary identity provider. This RFC defines the "Single-User Handshake" protocol that establishes the **Root of Trust** for a session.

## 2. The Identity Handshake
1. **Trigger:** `opengem login` creates an ephemeral Auth Server on `127.0.0.1:3005`.
2. **Browser Auth:** The user authenticates via a secure Firebase web context (Google Sign-In).
3. **Verification:** The minted ID Token is posted to the local server. The CLI verifies the signature via the Firebase Admin SDK.
4. **Email Check:** The `token.email` MUST match the HARDCODED `OWNER_EMAIL` in the system configuration.

## 3. Capability Bridge
Authentication proves **WHO** is operating. It does not grant permission to agents by itself.
- **Identity:** Unlocks the Control Plane.
- **Authorization:** Requires an explicit Capability Grant (RFC-002) for the specific agent/task.

## 4. Security Measures
- **Ephemeral Port:** The Auth Server bounds to loopback and dies immediately after one successful login.
- **Nonce/CSRF:** Uses signed nonces to prevent token interception.
- **Single-User:** No "multi-tenancy". Only the owner can authorize actions.

## 5. Artifacts
- **Token Storage:** Local encryption (AES-256) for the persistent refresh token in `~/.opengem/auth.json`.
