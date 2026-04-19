import { db, admin } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { decryptData, encryptData, sha256Hash } from "@/lib/encryption";
import { validateSession } from '@/lib/sessionAuth';
import crypto from 'crypto';

async function decryptVolume(masterPassword: string) {
    const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
    if (!metaDoc.exists) throw new Error('Volume not found');

    const meta = metaDoc.data()!;
    const decryptedMeta = decryptData({
        encryptedData: meta.encryptedData,
        salt: meta.salt,
        iv: meta.iv,
        authTag: meta.authTag
    }, masterPassword);

    const { chunkIds } = decryptedMeta;
    const chunks: string[] = [];
    for (const chunkId of chunkIds) {
        const chunkDoc = await db.collection('udhhmbtc').doc(chunkId).get();
        if (!chunkDoc.exists) throw new Error(`Missing chunk: ${chunkId}`);
        chunks.push(chunkDoc.data()!.chunk);
    }

    const encryptedDataStr = chunks.join('');
    return decryptData({
        encryptedData: encryptedDataStr,
        salt: decryptedMeta.salt,
        iv: decryptedMeta.iv,
        authTag: decryptedMeta.authTag
    }, masterPassword);
}

async function saveVolume(content: any, masterPassword: string) {
    const encryptedObj = encryptData(content, masterPassword);
    const dataHash = sha256Hash(JSON.stringify(content));

    const chunkSize = 1024 * 1024;
    const chunks: string[] = [];
    for (let i = 0; i < encryptedObj.encryptedData.length; i += chunkSize) {
        chunks.push(encryptedObj.encryptedData.slice(i, i + chunkSize));
    }

    const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
    let oldChunkIds: string[] = [];
    if (metaDoc.exists) {
        const meta = metaDoc.data()!;
        const decryptedMeta = decryptData({
            encryptedData: meta.encryptedData,
            salt: meta.salt,
            iv: meta.iv,
            authTag: meta.authTag
        }, masterPassword);
        oldChunkIds = decryptedMeta.chunkIds || [];
    }

    const newMeta = {
        chunkCount: chunks.length,
        salt: encryptedObj.salt,
        iv: encryptedObj.iv,
        authTag: encryptedObj.authTag,
        chunkIds: chunks.map(() => crypto.randomUUID()),
        dataHash,
    };
    const encryptedMeta = encryptData(newMeta, masterPassword);

    const batch = db.batch();
    for (const chunkId of oldChunkIds) {
        batch.delete(db.collection('udhhmbtc').doc(chunkId));
    }
    for (let i = 0; i < chunks.length; i++) {
        batch.set(db.collection('udhhmbtc').doc(newMeta.chunkIds[i]), {
            chunk: chunks[i],
            createdAt: new Date(),
        });
    }
    batch.set(db.collection('udhhmbtc').doc('meta-data'), {
        encryptedData: encryptedMeta.encryptedData,
        salt: encryptedMeta.salt,
        iv: encryptedMeta.iv,
        authTag: encryptedMeta.authTag,
        updatedAt: new Date(),
    });

    await batch.commit();
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

        let masterPassword = '';
        const sessionToken = request.headers.get('x-master-password-session');

        if (sessionToken) {
            const sessionData = await validateSession(sessionToken, decodedToken.uid);
            if (sessionData && sessionData.encryptedMasterPassword) {
                try {
                    masterPassword = decryptData(sessionData.encryptedMasterPassword, sessionToken);
                } catch (e) {
                    console.error("Failed to decrypt master password from session", e);
                }
            }
        }


        if (!masterPassword) {
            return NextResponse.json({ error: 'Master password required for migration' }, { status: 400 });
        }

        const authDoc = await db.collection('udhhmbtc').doc('auth').get();
        if (!authDoc.exists) {
            return NextResponse.json({ error: 'Master password not set' }, { status: 400 });
        }
        const authData = authDoc.data()!;
        try {
            const decryptedTest = decryptData(authData.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') throw new Error('Invalid');
        } catch (error) {
            return NextResponse.json({ error: 'Invalid master password' }, { status: 401 });
        }

        // 1. Fetch plain-text inventory-items
        const inventorySnapshot = await db.collection('inventory').get();
        const inventoryItems = inventorySnapshot.docs.map(doc => {
            const data = doc.data() as any;
            // Ensure timestamps are converted to dates or serializable format for JSON stringification
            const cleanedData = { ...data, id: doc.id };
            if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                cleanedData.createdAt = data.createdAt.toDate().toISOString();
            }
            if (data.updatedAt && typeof data.updatedAt.toDate === 'function') {
                cleanedData.updatedAt = data.updatedAt.toDate().toISOString();
            }
            return cleanedData;
        });

        // 2. Decrypt volume
        const content = await decryptVolume(masterPassword);

        // 3. Insert and encrypt
        // Use an object map to merge existing inventory if run multiple times?
        // Destructive migration - we'll just overwrite or merge
        content.inventory = content.inventory || [];
        const existingIds = new Set(content.inventory.map((i: any) => i.id));

        let migratedCount = 0;
        for (const item of inventoryItems) {
            if (!existingIds.has(item.id)) {
                content.inventory.push(item);
                migratedCount++;
            }
        }

        await saveVolume(content, masterPassword);

        // 4. Delete old plaintext docs
        if (inventoryItems.length > 0) {
            const deleteBatch = db.batch();
            inventorySnapshot.docs.forEach((doc) => {
                deleteBatch.delete(doc.ref);
            });
            await deleteBatch.commit();
        }

        return NextResponse.json({
            message: "Inventory migrated successfully",
            report: {
                migrated: migratedCount,
                deleted: inventoryItems.length
            }
        });

    } catch (error) {
        console.error("Error migrating inventory:", error);
        return NextResponse.json({ error: "Failed to migrate inventory" }, { status: 500 });
    }
}
