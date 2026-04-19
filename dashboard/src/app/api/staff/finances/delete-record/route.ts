import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

/** DELETE /api/staff/finances/delete-record — Deletes an E2E record from any staff subcollection */
export async function DELETE(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const { recordId, staffUid } = body;

        if (!recordId || !staffUid) {
            return NextResponse.json({ error: 'Missing recordId or staffUid' }, { status: 400 });
        }

        const docRef = db.collection('finances').doc(staffUid).collection('records').doc(recordId);

        const doc = await docRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: 'Record not found' }, { status: 404 });
        }

        await docRef.delete();

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error('Error deleting E2E record:', error);
        return NextResponse.json({ error: 'Failed to delete record' }, { status: 500 });
    }
}
