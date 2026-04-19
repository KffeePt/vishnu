import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { admin } from '@/config/firebase-admin';
import { hashMasterPassword } from '@/lib/encryption';
import { getAuthDocCached } from '@/lib/sessionAuth';

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const callerId = decodedToken.uid;

        // Owner can query another user's public key via ?uid=
        const targetUid = request.nextUrl.searchParams.get('uid');
        if (targetUid && targetUid !== callerId) {
            // Owners AND Admins can read another user's key info (for inventory management UI)
            if (!decodedToken.owner && !decodedToken.admin) {
                return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
            }
            // Read from root staff-data/{uid}
            const doc = await db.collection('staff-data').doc(targetUid).get();

            if (!doc.exists) {
                return NextResponse.json({ isSet: false, hasKeys: false, publicKey: null });
            }
            const data = doc.data()!;
            let publicKey = data.publicKey ?? null;

            // Fallback: check public/{uid} mirror if staff-data doesn't have the key
            if (!publicKey) {
                const publicDoc = await db.collection('public').doc(targetUid).get();
                if (publicDoc.exists) {
                    publicKey = publicDoc.data()?.publicKey ?? publicDoc.data()?.['staff-key'] ?? null;
                }
            }

            return NextResponse.json({
                isSet: !!data.passwordHash,
                hasKeys: !!publicKey,
                publicKey,
            });
        }

        // Default: return caller's own status from root staff-data/{uid}
        const doc = await db.collection('staff-data').doc(callerId).get();

        // Get system initialization status (cached — avoids quota exhaustion)
        const adminAuthDoc = await getAuthDocCached();
        const isSystemReady = adminAuthDoc.exists;

        // Determine if they have a password set in Firebase Auth
        const userRecord = await admin.auth().getUser(callerId);
        const hasPasswordProvider = userRecord.providerData.some(p => p.providerId === 'password');

        if (!doc.exists) {
            return NextResponse.json({
                isSet: hasPasswordProvider,
                hasKeys: false,
                isSystemReady
            });
        }
        const data = doc.data()!;
        return NextResponse.json({
            isSet: hasPasswordProvider || !!data.passwordHash,
            hasKeys: !!data.publicKey,
            encryptedPrivateKey: data.encryptedPrivateKey ?? null,
            publicKey: data.publicKey ?? null,
            isSystemReady
        });
    } catch (error) {
        console.error('Error checking master password status:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const body = await request.json();
        const { masterPassword, publicKey, encryptedPrivateKey } = body;
        const username = typeof body?.username === 'string' ? body.username.trim() : '';

        // Guard: Verify admin has completed initial setup (cached — avoids quota exhaustion)
        const adminAuthDoc = await getAuthDocCached();
        if (!adminAuthDoc.exists) {
            return NextResponse.json(
                { error: 'System not initialized. An administrator must complete setup first.' },
                { status: 503 }
            );
        }

        if (!masterPassword || masterPassword.length < 6) {
            return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
        }

        const passwordHash = await hashMasterPassword(masterPassword);

        const docData: Record<string, any> = {
            passwordHash,
            updatedAt: new Date().toISOString(),
        };

        // Check if this is a self-registration (no existing status from admin creation)
        const existingDoc = await db.collection('staff-data').doc(userId).get();
        const existingStatus = existingDoc.exists ? existingDoc.data()?.status : undefined;
        const isFirstSetup = !existingDoc.exists || !existingDoc.data()?.passwordHash;
        if (!existingStatus) {
            docData.status = 'pending';
            const completedAt = new Date();
            docData.setupCompletedAt = completedAt.toISOString();
        }

        if (isFirstSetup && !USERNAME_PATTERN.test(username)) {
            return NextResponse.json(
                { error: 'Username is required on first setup and must be 3-32 characters using only letters, numbers, periods, underscores, or hyphens.' },
                { status: 400 }
            );
        }

        // Optionally store RSA keypair data (generated client-side)
        if (publicKey && encryptedPrivateKey) {
            docData.publicKey = publicKey;
            docData.encryptedPrivateKey = encryptedPrivateKey; // { wrappedKey, salt, iv }
        }

        // Store directly in root staff-data/{userId} document
        await db.collection('staff-data').doc(userId).set(docData, { merge: true });

        if (isFirstSetup && username) {
            await db.collection('staff').doc(userId).set({
                username,
                updatedAt: admin.firestore.Timestamp.now(),
            }, { merge: true });
        }

        // Mirror public key to public collection for discoverability
        if (publicKey) {
            await db.collection('public').doc(userId).set({
                publicKey: publicKey,
                updatedAt: new Date().toISOString(),
            }, { merge: true });
        }


        // Cleanup old location if it exists (optional, but good practice)
        // await db.collection('staff-data').doc(userId).collection('settings').doc('auth').delete();

        // Option 3: Device-Bound Key Wrapping
        // Backfill the wrapped MP blobs for all passkeys and TOTP so future logins are seamless
        try {
            const { wrapForAllPasskeys, wrapForTotp } = require('@/lib/mp-wrap');
            await Promise.all([
                wrapForAllPasskeys(masterPassword, userId),
                wrapForTotp(masterPassword, userId)
            ]);
        } catch (wrapErr) {
            console.error('Failed to backfill wrapped MP blobs during staff password setup:', wrapErr);
            // Non-fatal, session was still created
        }

        return NextResponse.json({ success: true, hasKeys: !!(publicKey && encryptedPrivateKey) });
    } catch (error) {
        console.error('Error setting master password:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
