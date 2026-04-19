import { db } from '@/config/firebase-admin';

// ─── Passkey Cache ────────────────────────────────────────────────────────────
// Centralized in-memory cache for passkey query results per userId.
// Consolidates logic that was previously duplicated or missing in various routes.
interface PasskeyCacheEntry {
    docs: FirebaseFirestore.QueryDocumentSnapshot[];
    expiresAt: number;
}

const passkeyCache = new Map<string, PasskeyCacheEntry>();
const PASSKEY_CACHE_TTL = 2 * 60 * 1000; // 2 minutes

/**
 * Gets passkeys for a user, using cache if available.
 */
export async function getPasskeysForUserCached(userId: string): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const now = Date.now();
    const cached = passkeyCache.get(userId);

    if (cached && cached.expiresAt > now) {
        return cached.docs;
    }

    try {
        const snapshot = await db.collection('passkeys').where('userId', '==', userId).get();
        passkeyCache.set(userId, { docs: [...snapshot.docs], expiresAt: now + PASSKEY_CACHE_TTL });
        return snapshot.docs;
    } catch (error: any) {
        console.error(`[PasskeyCache] Firestore error for user ${userId}, likely quota exhausted:`, error.message);
        // Fallback to empty array to allow graceful degradation
        return [];
    }
}

/**
 * Invalidates the passkey cache for a specific user.
 * Call this when a passkey is added or deleted.
 */
export function invalidatePasskeyCache(userId: string) {
    passkeyCache.delete(userId);
}

/**
 * Clears the entire passkey cache.
 * Call this during global system resets.
 */
export function clearAllPasskeyCaches() {
    passkeyCache.clear();
}
