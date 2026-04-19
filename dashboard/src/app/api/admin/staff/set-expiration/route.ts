import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { admin } from '@/config/firebase-admin'; import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

/**
 * POST /api/admin/staff/set-expiration
 * Force an expiration period for a staff member's master password.
 */
export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const { uid, days } = body;

        if (!uid || typeof uid !== 'string') {
            return NextResponse.json({ error: 'UID is required' }, { status: 400 });
        }

        if (typeof days !== 'number' || days < 0) {
            return NextResponse.json({ error: 'Days must be a non-negative number' }, { status: 400 });
        }

        const docRef = db.collection('staff-data').doc(uid);

        // Setting days = 0 forces an immediate change on next login
        await docRef.set({
            requirePasswordChangeDays: days,
            passwordLastChangedAt: admin.firestore.FieldValue.serverTimestamp() // Reset the clock now
        }, { merge: true });

        // If they want immediate expiration, we could also revoke current refresh tokens
        if (days === 0) {
            await admin.auth().revokeRefreshTokens(uid);
        }

        return NextResponse.json({ success: true, message: 'Expiration policy updated' });
    } catch (error) {
        console.error('Error setting staff password expiration:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
