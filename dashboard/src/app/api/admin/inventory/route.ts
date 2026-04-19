import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { InventoryItemSchema } from '@/zod_schemas/candy-store-related';
import { decryptData, encryptData, sha256Hash } from '@/lib/encryption';
import { getMasterPassword } from '@/lib/sessionAuth';
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

        const searchParams = request.nextUrl.searchParams;
        const category = searchParams.get('category');

        let masterPassword;
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);
        let items = content.inventory || [];

        if (category) {
            items = items.filter((item: any) => item.category === category);
        }

        // Sort by name
        items.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''));

        return NextResponse.json(items);
    } catch (error) {
        console.error('Error fetching inventory items:', error);
        return NextResponse.json({ error: 'Failed to fetch inventory items' }, { status: 500 });
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

        let masterPassword;
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 401 });
        }

        const body = await request.json();

        const content = await decryptVolume(masterPassword);
        content.inventory = content.inventory || [];

        // Handle Append To Existing Item logic
        if (body.appendToItemId) {
            const existingIdx = content.inventory.findIndex((i: any) => i.id === body.appendToItemId);
            if (existingIdx === -1) {
                return NextResponse.json({ error: 'Target item not found for appending' }, { status: 404 });
            }

            // Increment the quantity using parsed quantity data from the append action safely
            const qtyToAdd = parseFloat(body.quantity) || 0;
            if (qtyToAdd > 0) {
                content.inventory[existingIdx].quantity += qtyToAdd;
                content.inventory[existingIdx].updatedAt = new Date().toISOString();
            }

            await saveVolume(content, masterPassword);

            return NextResponse.json(content.inventory[existingIdx], { status: 200 });
        }

        // Handle New Item Creation logic
        // Strip fields not in schema before validation
        const { assignedTo, assignedToName, ...rest } = body;
        const validation = InventoryItemSchema.safeParse(rest);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors.map(e => e.message).join(', ') }, { status: 400 });
        }

        const newItem: any = {
            ...validation.data,
            id: Date.now().toString(), // Generate a new ID
            assignments: [],
            notes: validation.data.notes || null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        content.inventory.push(newItem);

        await saveVolume(content, masterPassword);

        return NextResponse.json(newItem, { status: 201 });
    } catch (error) {
        console.error('Error creating inventory item:', error);
        return NextResponse.json({ error: 'Failed to create inventory item' }, { status: 500 });
    }
}
