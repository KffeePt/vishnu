import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import * as admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const token = authHeader.split('Bearer ')[1];
        await admin.auth().verifyIdToken(token);

        // Find all owner or admin users
        const listUsersResult = await admin.auth().listUsers(100);
        const adminUsers = listUsersResult.users.filter(u => u.customClaims?.owner === true || u.customClaims?.admin === true);

        if (adminUsers.length === 0) {
            return NextResponse.json({ error: 'No admin found' }, { status: 404 });
        }

        // Prioritize owners to ensure the deterministic instance owner receives E2E messages
        adminUsers.sort((a, b) => {
            const aIsOwner = a.customClaims?.owner === true ? 1 : 0;
            const bIsOwner = b.customClaims?.owner === true ? 1 : 0;
            if (aIsOwner !== bIsOwner) {
                return bIsOwner - aIsOwner; // Owners first
            }
            return new Date(b.metadata.lastSignInTime || 0).getTime() - new Date(a.metadata.lastSignInTime || 0).getTime();
        });

        // Get public keys for all assigned admins/owners
        const adminKeys: { uid: string, publicKey: string }[] = [];

        for (const user of adminUsers) {
            const publicDoc = await db.collection('public').doc(user.uid).get();
            const publicKey = publicDoc.data()?.publicKey;

            if (publicKey) {
                adminKeys.push({ uid: user.uid, publicKey });
            }
        }

        if (adminKeys.length === 0) {
            return NextResponse.json({ error: 'No admins have set up E2E encryption keys' }, { status: 404 });
        }

        return NextResponse.json({
            // Return array of keys for robust E2E delivery 
            keys: adminKeys,
            // Keep the deterministic priority owner as the fallback 'publicKey' for legacy clients just in case
            publicKey: adminKeys[0].publicKey
        });
    } catch (error: any) {
        console.error('Error fetching admin key:', error);
        return NextResponse.json({ error: 'Failed to fetch admin key' }, { status: 500 });
    }
}
