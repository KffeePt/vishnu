import { NextRequest, NextResponse } from 'next/server';
import admin, { db, rtdb } from '@/config/firebase-admin';
import { encryptSignal } from '@/lib/sentinel-crypto';

// Re-export existing constants or define based on claims
const LIMIT_STAFF = 3;
const LIMIT_ADMIN = 5;
const LIMIT_OWNER = 10;

interface PresenceNode {
    sessionId: string;
    connectedAt: number;
}

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        if (!rtdb) {
            return NextResponse.json({ error: 'RTDB not configured' }, { status: 500 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const body = await request.json();
        const { sessionToken } = body;

        if (!sessionToken) {
            return NextResponse.json({ error: 'Session token required for presence enforcement' }, { status: 400 });
        }

        // Determine user limit based on custom claims
        let limit = LIMIT_STAFF;
        if (decodedToken.owner) limit = LIMIT_OWNER;
        else if (decodedToken.admin) limit = LIMIT_ADMIN;

        // Query RTDB for active presence sessions
        const presenceRef = rtdb.ref(`presence/${uid}`);
        const snapshot = await presenceRef.get();

        // Fetch current Codebook from RTDB
        const codebookSnap = await rtdb.ref('codebook/current').get();
        const codebook = codebookSnap.exists() ? codebookSnap.val() : null;

        if (snapshot.exists()) {
            const sessionsMap = snapshot.val();
            const activeSessions = Object.keys(sessionsMap).map(key => ({
                sessionId: key,
                connectedAt: sessionsMap[key].connectedAt || 0
            }));

            // If we are over the limit, we need to revoke the oldest session(s)
            if (activeSessions.length > limit) {
                // Sort ascending by connection time (oldest first)
                activeSessions.sort((a, b) => a.connectedAt - b.connectedAt);

                const sessionsToRevoke = activeSessions.slice(0, activeSessions.length - limit);

                for (const session of sessionsToRevoke) {
                    console.log(`[Sentinel Enforcer] Revoking session ${session.sessionId} for user ${uid} due to limit constraint.`);

                    // 1. Delete from Firestore so the token is invalidated server-side
                    await db.collection('sessions').doc(session.sessionId).delete().catch(console.error);

                    // 2. Remove RTDB presence manually
                    await presenceRef.child(session.sessionId).remove().catch(console.error);

                    // 3. Send Sentinel Signal to gracefully log the client out if still connected
                    try {
                        const publicDoc = await db.collection('public').doc(uid).get();
                        const publicKeyPem = publicDoc.data()?.sentinelPublicKey;

                        if (publicKeyPem && codebook) {
                            const signal = encryptSignal('sessionRevoked', codebook, { sessionId: session.sessionId }, publicKeyPem);

                            const newSignalRef = rtdb.ref(`signals/${uid}`).push();
                            await newSignalRef.set({
                                codeWord: signal.codeWord,
                                iv: signal.iv,
                                ciphertext: signal.ciphertext,
                                wrappedKey: signal.wrappedKey,
                                timestamp: signal.timestamp,
                                consumed: false
                            });
                        }
                    } catch (signalErr) {
                        console.error(`[Sentinel Enforcer] Failed to send revoke signal to ${uid}:`, signalErr);
                    }
                }
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[Sentinel Enforcer] Error:', error);
        return NextResponse.json({ error: 'Internal server error while enforcing Sentinel limits' }, { status: 500 });
    }
}

function wrappedKeyBase64(buffer: ArrayBuffer): string {
    return Buffer.from(buffer).toString('base64');
}
