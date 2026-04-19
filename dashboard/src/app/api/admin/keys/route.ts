import { NextRequest, NextResponse } from 'next/server';
import { admin, db } from '@/config/firebase-admin';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Only owner or admin can access the admin key
        if (!decodedToken.owner && !decodedToken.admin) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const doc = await db.collection('staff-data').doc(decodedToken.uid).get();

        if (!doc.exists) {
            return NextResponse.json({
                hasKeys: false,
                publicKey: null,
                encryptedPrivateKey: null
            });
        }

        const data = doc.data()!;

        return NextResponse.json({
            hasKeys: !!data.publicKey,
            publicKey: data.publicKey ?? null,
            encryptedPrivateKey: data.encryptedPrivateKey ?? null
        });
    } catch (error) {
        console.error('Error fetching admin keys:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
