import { NextRequest, NextResponse } from 'next/server';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { db, rtdb } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { SentinelAction, Codebook } from '@/lib/sentinel-wordlist';
import { encryptSignal, createBroadcastSignal } from '@/lib/sentinel-crypto';

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
        if (!decodedToken.owner && !decodedToken.admin) {
            return NextResponse.json({ error: 'Admin or Owner access required' }, { status: 403 });
        }

        const body = await request.json();
        const { action, targetUid, payload = {} } = body as { action: SentinelAction, targetUid?: string, payload?: any };

        if (!action) return NextResponse.json({ error: 'Missing action' }, { status: 400 });

        // Get active codebook
        const codebookDoc = await db.collection('sentinel').doc('codebook').get();
        if (!codebookDoc.exists) return NextResponse.json({ error: 'Codebook not initialized' }, { status: 500 });
        const codebook = codebookDoc.data() as Codebook;

        if (targetUid) {
            // Unicast (Direct Signal)
            const publicDoc = await db.collection('public').doc(targetUid).get();
            const publicKeyPem = publicDoc.data()?.sentinelPublicKey;

            if (!publicKeyPem) {
                return NextResponse.json({ error: 'Target user has not set up Sentinel.' }, { status: 400 });
            }

            const encrypted = encryptSignal(action, codebook, payload, publicKeyPem);

            const signalId = rtdb.ref(`signals/${targetUid}`).push().key;
            await rtdb.ref(`signals/${targetUid}/${signalId}`).set({
                ...encrypted,
                sender: decodedToken.uid,
                consumed: false
            });

            await db.collection('sessions').doc(decodedToken.uid).set({
                sentinelMetadata: {
                    lastSignalSent: Date.now(),
                    signalCount: admin.firestore.FieldValue.increment(1)
                }
            }, { merge: true });

            return NextResponse.json({ success: true, signalId });
        } else {
            // Broadcast
            const broadcast = createBroadcastSignal(action, codebook, payload);
            const signalId = rtdb.ref('signals/broadcast').push().key;
            await rtdb.ref(`signals/broadcast/${signalId}`).set({
                ...broadcast,
                sender: decodedToken.uid
            });

            await db.collection('sessions').doc(decodedToken.uid).set({
                sentinelMetadata: {
                    lastSignalSent: Date.now(),
                    signalCount: admin.firestore.FieldValue.increment(1)
                }
            }, { merge: true });

            return NextResponse.json({ success: true, signalId, broadcast: true });
        }

    } catch (error) {
        console.error('Error pushing signal:', error);
        return NextResponse.json({ error: 'Server error pushing signal' }, { status: 500 });
    }
}
