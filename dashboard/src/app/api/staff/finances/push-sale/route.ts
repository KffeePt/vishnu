import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';

/** POST /api/staff/finances/push-sale — stores an envelope-encrypted sale record pushed by a staff member */
export async function POST(request: NextRequest) {
    try {
        console.log('[API: /staff/finances/push-sale] Received E2E finance push request');
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('[API: /staff/finances/push-sale] Missing or invalid authorization header');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        let staffUid = decodedToken.uid;
        console.log(`[API: /staff/finances/push-sale] Authenticated request for staff UID: ${staffUid}`);

        const body = await request.json();
        const { encryptedData, staffWrappedDEK, adminWrappedDEK, iv, encryptionVersion, staffUidOverride, validationParams } = body;

        // 2. Allow Admins/Owners to push records on behalf of a staff member (Repayment/Debt)
        if (staffUidOverride && staffUidOverride !== staffUid) {
            if (decodedToken.admin || decodedToken.owner || decodedToken.manager) {
                console.log(`[API: /staff/finances/push-sale] Admin override activated. Target staff UID: ${staffUidOverride}`);
                staffUid = staffUidOverride;
            } else {
                console.error('[API: /staff/finances/push-sale] Forbidden: Only admins can use staffUidOverride');
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
        }

        if (!encryptedData || !staffWrappedDEK || !adminWrappedDEK || !iv) {
            console.error('[API: /staff/finances/push-sale] Missing encryption payloads in body');
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

        // Server-Side Price Validation
        if (validationParams) {
            const { baseValue, flexibilityPercent, finalValue } = validationParams;
            if (typeof baseValue !== 'number' || typeof flexibilityPercent !== 'number' || typeof finalValue !== 'number') {
                return NextResponse.json({ error: 'Mismatched validation parameters' }, { status: 400 });
            }

            const flex = flexibilityPercent / 100;
            const minPrice = baseValue * (1 - flex);
            const maxPrice = baseValue * (1 + flex);

            // Add a tiny epsilon (0.001) for floating point precision rounding leniency
            if (finalValue < minPrice - 0.001 || finalValue > maxPrice + 0.001) {
                console.error(`[API: /staff/finances/push-sale] Price validation failed! Expected between ${minPrice} and ${maxPrice}, got ${finalValue}`);
                return NextResponse.json({ error: 'El precio final excede los límites de flexibilidad permitidos.' }, { status: 400 });
            }
        }

        // Create a new sale record in the staff's finances sub-collection
        console.log(`[API: /staff/finances/push-sale] Proceeding to create record for ${staffUid}`);
        const recordRef = db.collection('finances').doc(staffUid).collection('records').doc();

        await recordRef.set({
            // Envelope-encrypted payload (version 2)
            encryptedData,
            staffWrappedDEK,
            adminWrappedDEK,
            iv,
            encryptionVersion: encryptionVersion ?? 2,
            createdAt: admin.firestore.Timestamp.now(),    // Server-side timestamp for reliable sorting
            staffUid: staffUid,            // Plaintext correlation ID
        });

        console.log(`[API: /staff/finances/push-sale] Sale record successfully created: ${recordRef.id} for staff: ${staffUid}`);
        return NextResponse.json({ success: true, id: recordRef.id });
    } catch (error: any) {
        console.error('[API: /staff/finances/push-sale] EXCEPTION:', error);
        return NextResponse.json({ error: 'Failed to record sale' }, { status: 500 });
    }
}
