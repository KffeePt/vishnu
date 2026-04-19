import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';
import { z } from 'zod';

const RefundRequestSchema = z.object({
    encryptedData: z.string(),
    iv: z.string(),
    staffWrappedDEK: z.string(),
    adminWrappedDEK: z.string(),
    encryptionVersion: z.number().int().default(2),
    saleRecordHash: z.string().optional() // Optional now since losses don't have this
});

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const employeeId = decodedToken.uid;

        const body = await request.json();
        const validation = RefundRequestSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid payload schema', details: validation.error.errors }, { status: 400 });
        }

        // Duplicate Check: See if a pending refund already exists for this hashed sale ID
        if (validation.data.saleRecordHash) {
            const existingQuery = await db.collection('refunds')
                .where('employeeId', '==', employeeId)
                .where('status', '==', 'pending')
                .where('saleRecordHash', '==', validation.data.saleRecordHash)
                .limit(1)
                .get();

            if (!existingQuery.empty) {
                return NextResponse.json({ error: 'Ya existe un reembolso pendiente para esta venta.' }, { status: 409 });
            }
        }

        const employeeDoc = await db.collection('staff-data').doc(employeeId).get();
        const employeeName = employeeDoc.exists ? employeeDoc.data()?.name || decodedToken.email || employeeId : decodedToken.email || employeeId;

        const refundRequest = {
            employeeId,
            employeeName,
            status: 'pending',
            createdAt: new Date().toISOString(),
            ...validation.data
        };

        const docRef = await db.collection('refunds').add(refundRequest);

        return NextResponse.json({ success: true, id: docRef.id });

    } catch (error) {
        console.error('Error creating refund request:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
