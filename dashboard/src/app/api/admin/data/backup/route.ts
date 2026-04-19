import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { exportFirestoreBackupSnapshot } from '@/lib/firestore-backup';

export async function GET(request: NextRequest) {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
        return authResult;
    }

    try {
        const snapshot = await exportFirestoreBackupSnapshot(
            db,
            process.env.FIREBASE_PROJECT_ID ?? null
        );

        return NextResponse.json(snapshot, { status: 200 });
    } catch (error) {
        console.error('Database backup failed:', error);
        return NextResponse.json({ error: 'Failed to generate backup' }, { status: 500 });
    }
}
