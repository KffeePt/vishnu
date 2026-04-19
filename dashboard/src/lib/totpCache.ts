import { db } from '@/config/firebase-admin';

// ─── TOTP Cache ──────────────────────────────────────────────────────────────
// Caches TOTP secret existence/verification status per userId.
interface TotpCacheEntry {
    exists: boolean;
    verified: boolean;
    encryptedSecret?: string;
    wrappedMasterPassword?: string;
    expiresAt: number;
}

const totpCache = new Map<string, TotpCacheEntry>();
const TOTP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getTotpStatusCached(userId: string) {
    const now = Date.now();
    const cached = totpCache.get(userId);

    if (cached && cached.expiresAt > now) {
        return cached;
    }

    try {
        const doc = await db.collection('totp-secrets').doc(userId).get();
        const data = doc.data();

        const entry: TotpCacheEntry = {
            exists: doc.exists,
            verified: data?.verified || false,
            encryptedSecret: data?.encryptedSecret,
            wrappedMasterPassword: data?.wrappedMasterPassword,
            expiresAt: now + TOTP_CACHE_TTL
        };

        totpCache.set(userId, entry);
        return entry;
    } catch (error: any) {
        console.error(`[TotpCache] Firestore error for user ${userId}, likely quota exhausted:`, error.message);

        // Return a graceful offline fallback indicating TOTP is not set up / not available
        const offlineEntry: TotpCacheEntry = {
            exists: false,
            verified: false,
            expiresAt: now + TOTP_CACHE_TTL
        };
        // Do not cache the error state, so it recovers automatically if quota restores
        return offlineEntry;
    }
}

export function invalidateTotpCache(userId: string) {
    totpCache.delete(userId);
}

export function clearAllTotpCaches() {
    totpCache.clear();
}
