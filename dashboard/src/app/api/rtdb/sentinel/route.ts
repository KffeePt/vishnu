import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import * as bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const publicDoc = await db.collection('public').doc(uid).get();
        const staffDoc = await db.collection('staff-data').doc(uid).get();

        const isSet = !!publicDoc.data()?.sentinelPublicKey;
        const encryptedKey = staffDoc.data()?.sentinelEncryptedPrivateKey || null;

        return NextResponse.json({ isSet, encryptedPrivateKeyB64: encryptedKey });
    } catch (error) {
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const body = await request.json();
        const { action, password, publicKeyPem, publicKey, encryptedPrivateKeyB64, encryptedPrivateKey } = body;
        const resolvedPublicKey = publicKeyPem || publicKey;
        const resolvedEncPrivKey = encryptedPrivateKeyB64 || encryptedPrivateKey;

        if (action !== 'setup' && action !== 'rotate') {
            return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
        }

        if (!password || !resolvedPublicKey || !resolvedEncPrivKey) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const staffDocRef = db.collection('staff-data').doc(uid);
        const publicDocRef = db.collection('public').doc(uid);
        const staffDoc = await staffDocRef.get();

        if (action === 'rotate' && staffDoc.exists) {
            const existingHash = staffDoc.data()?.sentinelPasswordHash;
            if (existingHash) {
                const isSame = await bcrypt.compare(password, existingHash);
                if (isSame) {
                    return NextResponse.json({ error: 'New Sentinel password must be different from the previous one.' }, { status: 400 });
                }
            }
        }

        const newHash = await bcrypt.hash(password, 10);

        const batch = db.batch();
        batch.set(staffDocRef, {
            sentinelPasswordHash: newHash,
            sentinelEncryptedPrivateKey: resolvedEncPrivKey
        }, { merge: true });

        batch.set(publicDocRef, {
            sentinelPublicKey: resolvedPublicKey
        }, { merge: true });

        await batch.commit();

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error managing Sentinel password:', error);
        return NextResponse.json({ error: 'Server error' }, { status: 500 });
    }
}
