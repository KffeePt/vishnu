import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { decryptData, encryptData } from '@/lib/encryption';

/**
 * POST /api/admin/auth/upgrade-session
 * Used by the AuthForm after a successful TOTP/Passkey authentication.
 * Those methods verify identity, but we still need the owner's master password 
 * to decrypt their vault. This endpoint receives the password, verifies it, 
 * attaches it to their existing session, and backfills wrapped keys.
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Verify admin role
        const isOwner = decodedToken.role === 'owner' || decodedToken.owner === true;
        if (!isOwner) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const { masterPassword } = await request.json();
        const sessionToken = request.headers.get('x-master-password-session');

        if (!masterPassword || !sessionToken) {
            return NextResponse.json({ error: 'Password and session token required' }, { status: 400 });
        }

        // Verify the session belongs to this user
        const sessionRef = db.collection('sessions').doc(sessionToken);
        const sessionDoc = await sessionRef.get();

        if (!sessionDoc.exists) {
            return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
        }

        const sessionData = sessionDoc.data()!;
        if (sessionData.userId !== decodedToken.uid) {
            return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
        }

        // Verify the password is correct using the global auth check
        try {
            const authDoc = await db.collection('udhhmbtc').doc('auth').get();
            if (!authDoc.exists) throw new Error('Auth doc missing');
            const authData = authDoc.data()!;
            const decryptedTest = decryptData(authData.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') throw new Error('Invalid');
        } catch (error) {
            return NextResponse.json({ error: 'Invalid decryption password' }, { status: 403 });
        }

        // Attach to session
        const EncryptedMasterPassword = encryptData(masterPassword, sessionToken);
        await sessionRef.update({
            encryptedMasterPassword: EncryptedMasterPassword
        });

        // Option 3: Device-Bound Key Wrapping
        // Since we now have the user's master password verified, we can use it to 
        // backfill the wrapped MP blobs for all their passkeys and TOTP so future 
        // logins are seamless
        try {
            const { wrapForAllPasskeys, wrapForTotp } = require('@/lib/mp-wrap');
            await Promise.all([
                wrapForAllPasskeys(masterPassword, decodedToken.uid),
                wrapForTotp(masterPassword, decodedToken.uid)
            ]);
        } catch (wrapErr) {
            console.error('Failed to backfill wrapped MP blobs during upgrade-session:', wrapErr);
            // Non-fatal, session was still successfully upgraded
        }

        return NextResponse.json({ success: true });

    } catch (error: any) {
        console.error('Error attaching password to session:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
