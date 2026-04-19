import { db } from '@/config/firebase-admin';
import { DecodedIdToken } from 'firebase-admin/auth';

/**
 * Returns true if the user matches OWNER_UID AND has no role claims
 * AND the bootstrap gate has not been permanently closed.
 * This allows the owner to bootstrap their account (set up claims,
 * register passkeys, etc.) without a persistent bypass.
 */
export async function isBootstrapOwner(decoded: DecodedIdToken | Record<string, any>): Promise<boolean> {
    if (!process.env.OWNER_UID) return false;
    if (decoded.uid !== process.env.OWNER_UID) return false;

    // If the user already has ANY role claim, they should use claims — not UID bypass
    const hasRoleClaims = decoded.owner === true || decoded.admin === true || decoded.staff === true;
    if (hasRoleClaims) return false;

    // Check if bootstrap is permanently closed (One-Time Gate)
    try {
        const doc = await db.collection('app-config').doc('bootstrap').get();
        if (doc.exists && doc.data()?.isClosed === true) {
            return false; // Gateway is permanently closed
        }
    } catch (err) {
        console.error('Failed to read bootstrap state', err);
        return false; // Fail closed for security
    }

    return true;
}

/**
 * Permanently closes the bootstrap gate securely.
 */
export async function closeBootstrapGate(): Promise<void> {
    try {
        await db.collection('app-config').doc('bootstrap').set({ isClosed: true }, { merge: true });
        console.log('Bootstrap gate permanently closed.');
    } catch (err) {
        console.error('Failed to close bootstrap gate', err);
    }
}
