import { NextRequest } from 'next/server';
import { db } from '@/config/firebase-admin';
import { decryptData, encryptData } from '@/lib/encryption';
import { AuthSession } from '@/types/candyland';
import { createHash } from 'crypto';

// ─── Auth Doc Cache ───────────────────────────────────────────────────────────
// Caches successful master password validations against the udhhmbtc/auth doc.
// During high-volume test bursts, every API call previously re-read this doc,
// exhausting Firestore quotas. TTL of 5 min matches session validity windows.
interface AuthCacheEntry {
  passwordHash: string; // sha256 of the validated master password
  expiresAt: number;
}
let authDocCache: AuthCacheEntry | null = null;
const AUTH_DOC_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ─── Auth Doc Snapshot Cache ──────────────────────────────────────────────────
// Caches the raw udhhmbtc/auth DocumentSnapshot so routes that only need
// .exists (e.g. staff/master-password) don't re-read Firestore on every call.
let cachedAuthDocSnapshot: { snapshot: FirebaseFirestore.DocumentSnapshot; expiresAt: number } | null = null;

/** Returns a cached DocumentSnapshot of udhhmbtc/auth (TTL: 5 min). */
export async function getAuthDocCached(): Promise<FirebaseFirestore.DocumentSnapshot> {
  const now = Date.now();
  if (cachedAuthDocSnapshot && cachedAuthDocSnapshot.expiresAt > now) {
    return cachedAuthDocSnapshot.snapshot;
  }

  try {
    const snapshot = await db.collection('udhhmbtc').doc('auth').get();
    cachedAuthDocSnapshot = { snapshot, expiresAt: now + AUTH_DOC_CACHE_TTL };
    return snapshot;
  } catch (error: any) {
    console.error("[SessionAuth] Firestore error in getAuthDocCached, likely quota exhausted:", error.message);

    // Synthesize a fake non-existent snapshot fallback to prevent 500 errors
    // and let the application gracefully handle "not found/not configured"
    const fakeSnapshot = {
      exists: false,
      data: () => undefined,
      id: 'auth',
      ref: db.collection('udhhmbtc').doc('auth')
    } as any as FirebaseFirestore.DocumentSnapshot;

    return fakeSnapshot;
  }
}

/** Clears the cached udhhmbtc/auth snapshot. Call when doc is modified or system reset. */
export function clearAuthDocCache() {
  cachedAuthDocSnapshot = null;
}

/** Clears the master password validation cache. */
export function clearAuthPasswordCache() {
  authDocCache = null;
}
// ─────────────────────────────────────────────────────────────────────────────

function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates if a session is active and valid
 * @param sessionToken The session token to validate
 * @param userId Optional user ID to verify session belongs to user
 * @returns The decrypted session data if valid, null otherwise
 */
export async function validateSession(sessionToken: string, userId?: string): Promise<any | null> {
  try {
    if (!sessionToken) {
      return null;
    }

    const sessionRef = db.collection('sessions').doc(sessionToken);
    const sessionDoc = await sessionRef.get();

    if (!sessionDoc.exists) {
      return null;
    }

    const sessionData = sessionDoc.data();

    // Check if session has expired - compare server timestamps
    const expiresAt = sessionData!.expiresAt.toDate ? sessionData!.expiresAt.toDate() : new Date(sessionData!.expiresAt);
    const now = new Date();

    if (now > expiresAt) {
      // Clean up expired session
      await sessionRef.delete();
      return null;
    }

    // Check if session belongs to the requesting user (if userId provided)
    if (userId && sessionData!.userId !== userId) {
      return null;
    }

    // If session has encrypted data, we can't fully validate/decrypt it without the master password
    // which this function might not have access to yet if it's being called from middleware.
    // However, the existence of the valid session document proves authentication was successful.

    // We return the raw session data (including encrypted parts)
    // The caller (API route) can then decrypt it if provided with the master password context
    return sessionData;
  } catch (error) {
    console.error('Error validating session:', error);
    return null;
  }
}

/**
 * Middleware function to require session authentication
 * @param request NextRequest object
 * @returns null if authenticated, NextResponse error if not
 */
export async function requireSessionAuth(request: any): Promise<any> {
  const sessionToken = request.headers.get('x-master-password-session');

  if (!sessionToken) {
    return new Response(JSON.stringify({ error: 'Session authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessionData = await validateSession(sessionToken);
  if (!sessionData) {
    return new Response(JSON.stringify({ error: 'Invalid or expired session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return null; // Session is valid
}

/**
 * Retrieves and validates the master password from the session token
 * @param request NextRequest or standard Request object
 * @param uid Optional User ID
 * @returns The validated master password
 */
export async function getMasterPassword(request: NextRequest | Request, uid?: string): Promise<string> {
  let masterPassword = '';
  const sessionToken = request.headers.get('x-master-password-session');

  if (sessionToken) {
    const sessionData = await validateSession(sessionToken, uid);
    if (sessionData && sessionData.encryptedMasterPassword) {
      try {
        masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
      } catch (e) {
        console.error("Failed to decrypt master password from session", e);
      }
    }
  }

  // Deprecated fallback removed for security: the raw password must not be transmitted in headers.

  if (!masterPassword) {
    throw new Error('Valid master password session required');
  }

  // ─── Cache check: skip Firestore read if this password was validated recently ───
  const pwHash = hashPassword(masterPassword);
  const now = Date.now();
  if (authDocCache && authDocCache.passwordHash === pwHash && authDocCache.expiresAt > now) {
    return masterPassword; // Cache hit — no Firestore read needed
  }
  // ────────────────────────────────────────────────────────────────────────────────

  const authDoc = await db.collection('udhhmbtc').doc('auth').get();
  if (!authDoc.exists) throw new Error('Master password not set');
  const authData = authDoc.data()!;
  try {
    const decryptedTest = decryptData(authData.encryptedData, masterPassword);
    if (decryptedTest !== 'master_password_valid') throw new Error('Invalid');
  } catch (error) {
    throw new Error('Invalid master password');
  }

  // ─── Cache the successful validation ────────────────────────────────────────
  authDocCache = { passwordHash: pwHash, expiresAt: now + AUTH_DOC_CACHE_TTL };
  // ────────────────────────────────────────────────────────────────────────────

  return masterPassword;
}

