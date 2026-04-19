import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { admin } from '@/config/firebase-admin';

/**
 * GET /api/staff/inventory
 * Returns all inventory assignments for the authenticated staff member.
 * The encryptedPayload is RSA-encrypted and must be decrypted client-side
 * using the staff member's private key (unlocked by their master password).
 */
export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        // Only staff or owner can access this endpoint
        if (!decodedToken.staff && !decodedToken.owner) {
            return NextResponse.json({ error: 'Forbidden — staff access required' }, { status: 403 });
        }

        const snapshot = await db
            .collection('inventory')
            .where('staffId', '==', userId)
            .get();

        const assignments = snapshot.docs
            .map(doc => ({
                id: doc.id,
                encryptedPayload: doc.data().encryptedData || doc.data().encryptedPayload,
                encryptedData: doc.data().encryptedData,
                staffWrappedDEK: doc.data().staffWrappedDEK,
                adminWrappedDEK: doc.data().adminWrappedDEK,
                iv: doc.data().iv,
                encryptionVersion: doc.data().encryptionVersion,
                status: doc.data().status,
                assignedAt: doc.data().assignedAt?.toDate?.()?.toISOString() ?? null,
            }))
            .sort((a, b) => {
                if (!a.assignedAt) return 1;
                if (!b.assignedAt) return -1;
                return new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime();
            });

        return NextResponse.json(assignments);
    } catch (error) {
        console.error('Error fetching staff inventory assignments:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
