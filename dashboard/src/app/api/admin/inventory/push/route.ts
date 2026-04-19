import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { Timestamp } from 'firebase-admin/firestore';

/** POST /api/admin/inventory/push — stores an envelope-encrypted inventory assignment */
export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization')!;
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

        // Only owners can push inventory
        if (!decodedToken.owner) {
            return NextResponse.json({ error: 'Only owners can push inventory' }, { status: 403 });
        }

        const body = await request.json();
        const { staffUid, encryptedData, staffWrappedDEK, adminWrappedDEK, iv, encryptionVersion } = body;

        if (!staffUid || !encryptedData || !staffWrappedDEK || !adminWrappedDEK || !iv) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Verify staff member exists and has encryption keys
        const staffAuthDoc = await db.collection('public').doc(staffUid).get();
        const staffAuthData = staffAuthDoc.data();
        if (!staffAuthDoc.exists || (!staffAuthData?.publicKey && !staffAuthData?.['staff-key'])) {
            return NextResponse.json(
                { error: 'Staff member has not set up encryption keys' },
                { status: 400 }
            );
        }

        // Overwrite the single live assignment document for this staff member
        await db.collection('inventory').doc(staffUid).set({
            staffId: staffUid,
            // Envelope-encrypted payload (version 2)
            encryptedData,
            staffWrappedDEK,
            adminWrappedDEK,
            iv,
            encryptionVersion: encryptionVersion ?? 2,
            assignedAt: Timestamp.now(),
            assignedBy: decodedToken.uid,
            status: 'pending',
        });

        return NextResponse.json({ success: true, id: staffUid });
    } catch (error: any) {
        console.error('Error pushing inventory:', error);
        return NextResponse.json({ error: 'Failed to push inventory' }, { status: 500 });
    }
}

/** GET /api/admin/inventory/push — lists inventory assignments */
export async function GET(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization')!;
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

        let query: any = db.collection('inventory');

        // Staff can only see their own assignments; admins/owners see all
        if (!decodedToken.admin && !decodedToken.owner) {
            query = query.where('staffId', '==', decodedToken.uid);
        }

        const snapshot = await query.orderBy('assignedAt', 'desc').limit(50).get();

        const assignments = snapshot.docs.map((doc: any) => ({
            id: doc.id,
            ...doc.data(),
            assignedAt: doc.data().assignedAt?.toDate?.()?.toISOString() ?? null,
        }));

        return NextResponse.json(assignments);
    } catch (error: any) {
        console.error('Error fetching inventory assignments:', error);
        return NextResponse.json({ error: 'Failed to fetch assignments' }, { status: 500 });
    }
}
