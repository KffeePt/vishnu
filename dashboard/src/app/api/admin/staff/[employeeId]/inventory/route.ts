import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { admin } from '@/config/firebase-admin';

/**
 * GET /api/admin/staff/[employeeId]/inventory
 * Returns the most recent inventory payload for the specified staff member.
 * This is used by admins during the sync process to preserve crafted items.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ employeeId: string }> }
) {
    try {
        const { employeeId } = await params;
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Only admins or owners can access this endpoint
        if (!decodedToken.admin && !decodedToken.owner) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Fetch the staff's most recent inventory assignment document
        const snapshot = await db
            .collection('inventory')
            .where('staffId', '==', employeeId)
            .orderBy('assignedAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
             return NextResponse.json({ inventory: null });
        }

        const doc = snapshot.docs[0];
        
        return NextResponse.json({ 
             inventory: {
                id: doc.id,
                encryptedPayload: doc.data().encryptedData || doc.data().encryptedPayload,
                encryptedData: doc.data().encryptedData,
                staffWrappedDEK: doc.data().staffWrappedDEK,
                adminWrappedDEK: doc.data().adminWrappedDEK,
                iv: doc.data().iv,
                encryptionVersion: doc.data().encryptionVersion,
                status: doc.data().status,
                assignedAt: doc.data().assignedAt?.toDate?.()?.toISOString() ?? null,
             }
        });
    } catch (error) {
        console.error('Error fetching staff inventory assignment for admin:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
