# Database & Authentication Schema

Vishnu relies on **Firebase Authentication** as its primary identity provider and "Database" for user permissions (via Custom Claims).

## 1. User Identity Logic

### The "Owner"
There are two types of Owners:
1.  **Main Owner (God Mode):**
    - Defined by `OWNER_EMAIL` in the .env file.
    - **Immutable:** Cannot be modified or deleted via CLI.
    - Has full access to everything.
2.  **Claimed Owner:**
    - A user with the `{ owner: true }` custom claim.
    - Can be toggled by the Main Owner.

### Custom Claims Schema
The system uses Firebase Custom Claims to store RBAC (Role-Based Access Control) data directly on the user's ID token.

```typescript
interface UserClaims {
  // Access Levels (Booleans)
  owner?: boolean;  // Full System Control
  admin?: boolean;  // Administrative Features (Admin Panel, etc.)
  staff?: boolean;  // Operational Features (Orders, etc.)

  // Operational Role (String)
  // Only relevant if staff === true
  role?: 'manager' | 'chef' | 'repartidor' | 'user';
}
```

## 2. Authentication Flow (`auth.ts`)

1.  **Trigger:** User selects "Login" in CLI.
2.  **Local Server:** CLI spins up a temporary HTTP server on port 3005.
3.  **Browser:** Opens `http://localhost:3005/`.
4.  **Client SDK:** Web page uses Firebase Client SDK to `signInWithPopup(GoogleAuthProvider)`.
5.  **Token Handoff:**
    - Client gets ID Token.
    - Redirects to `http://localhost:3005/callback?token=...`.
6.  **Verification (Server-Side):**
    - CLI receives token.
    - Verifies via **Firebase Admin SDK**.
    - Checks Claims: Must be `owner` OR match `OWNER_EMAIL`.
    - **Strict Mode:** If not an owner, rejects login (returns 403).

## 3. User Manager (`menus/users/manager.ts`)

The CLI provides a UI to manage these claims:
- **List Users:** Fetches `auth.listUsers(50)`.
- **Toggle Permissions:** Uses `auth.setCustomUserClaims(uid, ...)`.
- **Visuals:**
    - `[👑 Main Owner]` (Yellow)
    - `[👑 Owner]` (Green)
    - `[🛡️ Admin]` (Cyan)
    - `[🛠️ Staff]` (Blue)
