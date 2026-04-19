import { NextRequest, NextResponse } from 'next/server';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { db, rtdb } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { generateCodebook } from '@/lib/sentinel-wordlist';
import { createBroadcastSignal } from '@/lib/sentinel-crypto';
import { decryptData } from '@/lib/encryption';

export async function GET(request: NextRequest) {
    try {
        if (!rtdb) {
            return NextResponse.json({ error: 'RTDB not initialized. Check FIREBASE_DATABASE_URL.' }, { status: 503 });
        }

        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const doc = await db.collection('sentinel').doc('codebook').get();
        if (!doc.exists) return NextResponse.json({ version: 0, rotatedAt: null });

        return NextResponse.json(doc.data());
    } catch (error) {
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        if (!rtdb) {
            return NextResponse.json({ error: 'RTDB not initialized. Check FIREBASE_DATABASE_URL.' }, { status: 503 });
        }

        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        if (!decodedToken.owner) {
            return NextResponse.json({ error: 'Owner access required for rotation' }, { status: 403 });
        }

        const body = await request.json();
        if (body.action !== 'rotate') return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

        const masterPassword = body.masterPassword;
        if (!masterPassword) {
            return NextResponse.json({ error: "Master password is required" }, { status: 400 });
        }

        const authDoc = await db.collection('udhhmbtc').doc('auth').get();
        if (!authDoc.exists) {
            return NextResponse.json({ error: "Master password not set" }, { status: 400 });
        }
        const authData = authDoc.data();
        try {
            const decryptedTest = decryptData(authData!.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') {
                throw new Error('Invalid');
            }
        } catch (error) {
            return NextResponse.json({ error: 'Invalid master password' }, { status: 401 });
        }

        const docRef = db.collection('sentinel').doc('codebook');
        const doc = await docRef.get();

        const currentVersion = doc.exists ? doc.data()?.version || 0 : 0;
        const previousHash = doc.exists ? doc.data()?.hash || 'initial' : undefined; // Simplified mock hash

        const newCodebook = generateCodebook(currentVersion, previousHash);

        // Sanitize object to remove undefined properties (like previousHash if it's undefined)
        // because Firestore doesn't allow 'undefined' natively without ignoreUndefinedProperties
        const safeCodebook = Object.fromEntries(
            Object.entries(newCodebook).filter(([_, v]) => v !== undefined)
        );

        // 1. Update Firestore
        await docRef.set(safeCodebook);

        // 2. Clear Sentinel Public Keys to force rotation for staff
        const publicUsers = await db.collection('public').get();
        if (publicUsers.docs.length > 0) {
            const batch = db.batch();
            publicUsers.docs.forEach(d => {
                batch.update(d.ref, { sentinelPublicKey: admin.firestore.FieldValue.delete() });
            });
            await batch.commit();
        }

        // 3. Broadcast rotation signal to actively connected clients
        const broadcastSignal = createBroadcastSignal('sentinelRotated', newCodebook, { reason: 'manual_rotation' });
        const signalId = rtdb.ref('signals/broadcast').push().key;
        await rtdb.ref(`signals/broadcast/${signalId}`).set(broadcastSignal);

        // 4. Update the current codebook block in RTDB for clients to sync latest version number
        await rtdb.ref('codebook/current').set({
            version: newCodebook.version,
            rotatedAt: newCodebook.rotatedAt
        });

        return NextResponse.json({ success: true, version: newCodebook.version });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error('Error rotating codebook:', message, error);
        return NextResponse.json({ error: 'Server error rotating codebook', detail: message }, { status: 500 });
    }
}
