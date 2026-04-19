import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { db } from "@/config/firebase-admin";
import admin from '@/config/firebase-admin';
import { encryptWithSystemKey, decryptWithSystemKey } from "@/lib/encryption";

export async function GET(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (!decodedToken.owner && !decodedToken.admin) {
            return NextResponse.json({ error: 'Admin or Owner access required' }, { status: 403 });
        }

        const docRef = db.collection('whitelist').doc('collections');
        const doc = await docRef.get();
        let collections: string[] = [];

        if (doc.exists) {
            const data = doc.data();
            if (data?.encryptedData) {
                try {
                    const dec = decryptWithSystemKey({
                        encryptedData: data.encryptedData,
                        salt: data.salt,
                        iv: data.iv,
                        authTag: data.authTag
                    });

                    // The payload might be an object containing collections or a stringified JSON
                    if (typeof dec === 'string') {
                        collections = JSON.parse(dec).collections || [];
                    } else if (dec.collections) {
                        collections = dec.collections;
                    }
                } catch (err) {
                    console.error("Decrypt error", err);
                    return NextResponse.json({ error: 'Failed to decrypt whitelist data' }, { status: 400 });
                }
            } else if (data?.collections) {
                // Legacy plaintext fallback
                collections = data.collections;
            }
        }

        return NextResponse.json({ collections });
    } catch (error) {
        console.error("Error fetching whitelist:", error);
        return NextResponse.json({ error: "Failed to fetch whitelist" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (!decodedToken.owner && !decodedToken.admin) {
            return NextResponse.json({ error: 'Admin or Owner access required' }, { status: 403 });
        }

        const body = await request.json();
        const { action, collections } = body;

        if (!['add', 'remove'].includes(action) || !Array.isArray(collections)) {
            return NextResponse.json({ error: 'Invalid action or collections array' }, { status: 400 });
        }

        const docRef = db.collection('whitelist').doc('collections');
        const doc = await docRef.get();
        let currentCollections: string[] = [];

        if (doc.exists) {
            const data = doc.data();
            if (data?.encryptedData) {
                try {
                    const dec = decryptWithSystemKey({
                        encryptedData: data.encryptedData,
                        salt: data.salt,
                        iv: data.iv,
                        authTag: data.authTag
                    });

                    if (typeof dec === 'string') {
                        currentCollections = JSON.parse(dec).collections || [];
                    } else if (dec.collections) {
                        currentCollections = dec.collections;
                    }
                } catch {
                    return NextResponse.json({ error: 'Invalid system key or corrupted whitelist data' }, { status: 400 });
                }
            } else if (data?.collections) {
                currentCollections = data.collections;
            }
        }

        if (action === 'add') {
            const newSet = new Set([...currentCollections, ...collections]);
            currentCollections = Array.from(newSet);
        } else if (action === 'remove') {
            currentCollections = currentCollections.filter(c => !collections.includes(c));
        }

        const payload = JSON.stringify({ collections: currentCollections });
        const encryptedData = encryptWithSystemKey(payload);

        // Overwrite the document entirely with the encrypted structure
        await docRef.set({
            encryptedData: encryptedData.encryptedData,
            salt: encryptedData.salt,
            iv: encryptedData.iv,
            authTag: encryptedData.authTag
        });

        return NextResponse.json({ message: `Successfully ${action}ed collections.` });
    } catch (error) {
        console.error(`Error updating whitelist:`, error);
        return NextResponse.json({ error: `Failed to update whitelist` }, { status: 500 });
    }
}
