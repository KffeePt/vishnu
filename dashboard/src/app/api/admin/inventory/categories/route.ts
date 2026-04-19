import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

export async function GET(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const docRef = db.collection('inventory').doc('categories');
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return NextResponse.json({ categories: ['equipment', 'candy', 'supplies'] }); // Default fallback
        }

        return NextResponse.json(docSnap.data());
    } catch (error) {
        console.error('Error fetching categories:', error);
        return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();

        if (!body.encryptedData || !body.iv || !body.adminWrappedDEK) {
            return NextResponse.json({ error: 'Missing encryption payload' }, { status: 400 });
        }

        const docRef = db.collection('inventory').doc('categories');

        await docRef.set({
            encryptedData: body.encryptedData,
            iv: body.iv,
            adminWrappedDEK: body.adminWrappedDEK,
            encryptionVersion: body.encryptionVersion || 2,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error saving categories:', error);
        return NextResponse.json({ error: 'Failed to save categories' }, { status: 500 });
    }
}
