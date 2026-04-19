import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const { uid } = body;

        if (!uid) {
            return NextResponse.json({ error: 'Valid UID required' }, { status: 400 });
        }

        const docRef = db.collection('staff-data').doc(uid);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Staff registration not found' }, { status: 404 });
        }

        // Delete from staff-data
        const batch = db.batch();
        batch.delete(docRef);

        // Delete from public mirror if exists
        const publicDocRef = db.collection('public').doc(uid);
        batch.delete(publicDocRef);

        await batch.commit();

        return NextResponse.json({
            success: true,
            message: `Staff registration reset successfully`,
        });
    } catch (error: any) {
        console.error(`Error processing staff reset:`, error);
        return NextResponse.json({ error: error.message || 'Failed to process reset' }, { status: 500 });
    }
}
