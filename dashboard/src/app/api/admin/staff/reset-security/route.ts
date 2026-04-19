import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

/**
 * POST /api/admin/staff/reset-security
 * Resets a staff member's security settings (master password, keys).
 * This is a ZERO-KNOWLEDGE reset.
 * 
 * Impact:
 * - Deletes the 'auth' fields in staff-data/{uid} (root)
 * - Deletes the 'auth' document in staff-data/{uid}/settings (legacy)
 * - Staff member must set a NEW master password on next login
 * - All existing inventory assignments for this staff member become PERMANENTLY decryption-locked (lost)
 * - Owner must re-push inventory after staff re-enrolls
 */
export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const { uid, tempPassword } = body;
        if (!uid || typeof uid !== 'string') {
            return NextResponse.json({ error: 'UID is required' }, { status: 400 });
        }

        if (tempPassword) {
            await admin.auth().updateUser(uid, {
                password: tempPassword
            });
        }

        // 1. Delete the entire staff-data/{uid} document
        const docRef = db.collection('staff-data').doc(uid);
        await docRef.delete();

        // 2. Delete the legacy auth settings document (password hash + keys)
        await db
            .collection('staff-data')
            .doc(uid)
            .collection('settings')
            .doc('auth')
            .delete();

        // 3. Delete all 'inventory-assignments' since they are now useless garbage.
        const assignmentsQuery = await db
            .collection('inventory')
            .where('staffId', '==', uid)
            .get();

        const batch = db.batch();
        assignmentsQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();

        // 4. Delete public key mirror
        await db.collection('public').doc(uid).delete();

        // 5. Delete TOTP secret
        await db.collection('totp-secrets').doc(uid).delete();

        // 6. Delete all passkeys
        const passkeysSnapshot = await db
            .collection('passkeys')
            .where('userId', '==', uid)
            .get();

        if (!passkeysSnapshot.empty) {
            const pkBatch = db.batch();
            passkeysSnapshot.docs.forEach(doc => {
                pkBatch.delete(doc.ref);
            });
            await pkBatch.commit();
        }

        // 7. Delete webauthn challenges
        await db.collection('webauthn-challenges').doc(uid).delete();

        return NextResponse.json({ success: true, message: 'Security reset complete. Assignments cleared.' });
    } catch (error) {
        console.error('Error resetting staff security:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
