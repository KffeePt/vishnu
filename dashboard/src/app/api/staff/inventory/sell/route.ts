import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';

/** POST /api/staff/inventory/sell — stores an envelope-encrypted inventory assignment updated by the staff member */
export async function POST(request: NextRequest) {
    try {
        console.log('[API: /staff/inventory/sell] Received request');
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('[API: /staff/inventory/sell] Missing or invalid authorization header');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const staffUid = decodedToken.uid;
        console.log(`[API: /staff/inventory/sell] Authenticated request for staff UID: ${staffUid}`);

        const body = await request.json();
        const { encryptedData, staffWrappedDEK, adminWrappedDEK, iv, encryptionVersion, allSold } = body;

        if (!encryptedData || !staffWrappedDEK || !adminWrappedDEK || !iv) {
            console.error('[API: /staff/inventory/sell] Missing encryption payloads in body');
            return NextResponse.json({ error: 'Missing encryption payloads' }, { status: 400 });
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
        // Use merge: true to avoid overwriting assignedAt/assignedBy from the original admin push
        console.log(`[API: /staff/inventory/sell] Updating inventory doc for ${staffUid} (merge: true, allSold: ${allSold})`);
        await db.collection('inventory').doc(staffUid).set({
            // Envelope-encrypted payload (version 2)
            encryptedData,
            staffWrappedDEK,
            adminWrappedDEK,
            iv,
            encryptionVersion: encryptionVersion ?? 2,
            lastSoldAt: admin.firestore.Timestamp.now(),    // Track when staff last pushed an update
            status: allSold ? 'sold' : 'live',
        }, { merge: true });

        console.log(`[API: /staff/inventory/sell] Successfully updated inventory doc for ${staffUid}`);
        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('[API: /staff/inventory/sell] EXCEPTION:', error);
        return NextResponse.json({ error: 'Failed to update inventory' }, { status: 500 });
    }
}
