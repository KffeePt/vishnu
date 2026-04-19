import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { decryptData, EncryptedContent } from '@/lib/encryption';
import { validateSession } from '@/lib/sessionAuth';

const USERNAME_PATTERN = /^[A-Za-z0-9._-]{3,32}$/;

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        const canManageUsername = decodedToken.admin !== true && decodedToken.owner !== true;

        // Staff members need the admin's master password to decrypt their own data
        // For the Candyman panel, we require the admin to have logged into this device
        // and stored the master password session. If it's not provided, we can't decrypt.
        let masterPassword = '';
        const sessionToken = request.headers.get('x-master-password-session');
        if (sessionToken) {
            const sessionData = await validateSession(sessionToken);
            if (sessionData && sessionData.encryptedMasterPassword) {
                try {
                    masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
                } catch (e) {
                    console.warn("Failed to decrypt master password from session in staff data route");
                }
            }
        }

        const docRef = db.collection('staff-data').doc(userId);
        const doc = await docRef.get();
        const usernameDoc = canManageUsername ? await db.collection('staff').doc(userId).get() : null;
        const username = canManageUsername && typeof usernameDoc?.data()?.username === 'string'
            ? usernameDoc.data()?.username
            : undefined;

        if (!doc.exists) {
            return NextResponse.json({ error: 'Staff profile not found' }, { status: 404 });
        }

        const data = doc.data()!;
        let profile = { ...data };

        // Attempt decryption if we have the master password
        if (data.encryptedData && masterPassword) {
            try {
                const decrypted = decryptData(data as EncryptedContent, masterPassword);
                profile = { ...profile, ...decrypted };

                // Remove the encrypted blob from the response
                delete profile.encryptedData;
                delete profile.salt;
                delete profile.iv;
                delete profile.authTag;
            } catch (e) {
                console.warn(`[Staff/Data] Failed to decrypt staff data for ${userId}`);
                // If decryption fails, we just return the unencrypted parts
            }
        }

        return NextResponse.json({
            id: doc.id,
            profitPercent: profile.profitPercent ?? 50, // Default to 50%
            sellingRules: profile.sellingRules || {},
            name: profile.name,
            username,
            canManageUsername,
            email: profile.email,
            role: profile.role,
            isActive: profile.isActive,
        });
    } catch (error) {
        console.error('Error fetching staff data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        if (decodedToken.admin === true || decodedToken.owner === true) {
            return NextResponse.json({ error: 'Admin/owner users cannot set a username for themselves.' }, { status: 403 });
        }

        const body = await request.json();
        const username = typeof body?.username === 'string' ? body.username.trim() : '';

        if (!USERNAME_PATTERN.test(username)) {
            return NextResponse.json({ error: 'Username must be 3-32 characters and use only letters, numbers, periods, underscores, or hyphens.' }, { status: 400 });
        }

        await db.collection('staff').doc(decodedToken.uid).set({
            username,
            updatedAt: admin.firestore.Timestamp.now(),
        }, { merge: true });

        return NextResponse.json({ success: true, username });
    } catch (error) {
        console.error('Error updating staff username:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
