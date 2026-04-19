import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { db, rtdb } from "@/config/firebase-admin";
import { decryptData } from "@/lib/encryption";
import { validateSession } from '@/lib/sessionAuth';
import admin from '@/config/firebase-admin';
import { createBroadcastSignal } from '@/lib/sentinel-crypto';
import { Codebook } from '@/lib/sentinel-wordlist';

export async function POST(request: NextRequest) {
    try {
        // Check authentication and owner access
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (!decodedToken.owner) {
            return NextResponse.json({ error: "Owner access required" }, { status: 403 });
        }

        const { action, masterPassword } = await request.json();

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

        // The duplicate line `const { action, masterPassword } = await request.json();` is removed as per instruction.

        if (action === 'reset-staff-keys') {
            const publicSnap = await db.collection('public').get();
            const staffSnap = await db.collection('staff-data').get();
            const batch = db.batch();
            let count = 0;

            publicSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.publicKey !== undefined) {
                    batch.delete(doc.ref);
                    count++;
                }
            });

            staffSnap.docs.forEach(doc => {
                const data = doc.data();
                if (data.encryptedPrivateKey !== undefined || data.publicKey !== undefined || data.passwordHash !== undefined) {
                    batch.update(doc.ref, {
                        encryptedPrivateKey: admin.firestore.FieldValue.delete(),
                        publicKey: admin.firestore.FieldValue.delete(),
                        passwordHash: admin.firestore.FieldValue.delete(),
                        salt: admin.firestore.FieldValue.delete(), // Just in case salt is separate
                    });
                }
            });

            if (count > 0 || staffSnap.docs.length > 0) await batch.commit();

            if (rtdb) {
                const codebookDoc = await db.collection('sentinel').doc('codebook').get();
                if (codebookDoc.exists) {
                    const codebook = codebookDoc.data() as Codebook;
                    const broadcast = createBroadcastSignal('keysReset', codebook, { reason: 'admin_reset' });
                    const signalId = rtdb.ref('signals/broadcast').push().key;
                    await rtdb.ref(`signals/broadcast/${signalId}`).set({ ...broadcast, sender: decodedToken.uid });
                }
            }

            return NextResponse.json({ success: true, deleted: { public: count } });
        } else if (action === 'reset-staff-all') {
            const collections = ['public', 'staff-data', 'inventory', 'totp-secrets', 'passkeys', 'webauthn-challenges'];
            const deleted: Record<string, number> = {};

            for (const coll of collections) {
                const snap = await db.collection(coll).get();
                if (!snap.empty) {
                    // Batch delete (max 500 operations per batch)
                    let batch = db.batch();
                    let count = 0;
                    let totalDeleted = 0;
                    for (const doc of snap.docs) {
                        if (coll === 'public') {
                            const data = doc.data();
                            if (data.publicKey === undefined) continue; // Protect non-key documents
                        }

                        batch.delete(doc.ref);
                        count++;
                        totalDeleted++;

                        // Cleanup known subcollections for staff-data just in case
                        if (coll === 'staff-data') {
                            batch.delete(doc.ref.collection('settings').doc('auth'));
                            count++;
                        }

                        if (count >= 490) { // Keep under 500 limit securely
                            await batch.commit();
                            batch = db.batch();
                            count = 0;
                        }
                    }
                    if (count > 0) {
                        await batch.commit();
                    }
                    if (coll === 'staff-data') {
                        await db.collection('staff-data').doc('_init').set({
                            initialized: true,
                            timestamp: new Date().toISOString()
                        });
                    }
                    deleted[coll] = totalDeleted;
                } else {
                    deleted[coll] = 0;
                }
            }
            if (rtdb) {
                const codebookDoc = await db.collection('sentinel').doc('codebook').get();
                if (codebookDoc.exists) {
                    const codebook = codebookDoc.data() as Codebook;
                    const broadcast = createBroadcastSignal('keysReset', codebook, { reason: 'admin_reset' });
                    const signalId = rtdb.ref('signals/broadcast').push().key;
                    await rtdb.ref(`signals/broadcast/${signalId}`).set({ ...broadcast, sender: decodedToken.uid });
                }
            }

            if (rtdb) {
                const codebookDoc = await db.collection('sentinel').doc('codebook').get();
                if (codebookDoc.exists) {
                    const codebook = codebookDoc.data() as Codebook;
                    const broadcast = createBroadcastSignal('keysReset', codebook, { reason: 'admin_reset_all' });
                    const signalId = rtdb.ref('signals/broadcast').push().key;
                    await rtdb.ref(`signals/broadcast/${signalId}`).set({ ...broadcast, sender: decodedToken.uid });
                }
            }

            return NextResponse.json({ success: true, deleted });
        } else {
            return NextResponse.json({ error: "Invalid action" }, { status: 400 });
        }

    } catch (error) {
        console.error("Error in reset staff:", error);
        return NextResponse.json({ error: "Failed to reset staff data" }, { status: 500 });
    }
}
