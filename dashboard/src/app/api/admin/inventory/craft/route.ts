import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { decryptData, encryptData, sha256Hash } from '@/lib/encryption';
import { getMasterPassword } from '@/lib/sessionAuth';
import { formatQty } from '@/lib/format-qty';
import { convertQty, SupportedUnit } from '@/lib/unit-conversion';
import crypto from 'crypto';
import { InventoryItem } from '@/types/candyland';

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

export async function POST(req: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(req);
        if (authResult) return authResult;

        const body = await req.json();
        const { recipeId, action, multiplier = 1, losses = {} } = body;

        if (!recipeId || (action !== 'craft' && action !== 'reverse')) {
            return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 });
        }

        const masterPassword = await getMasterPassword(req);
        if (!masterPassword) {
            return NextResponse.json({ error: 'Master password missing' }, { status: 401 });
        }

        const systemState = await decryptVolume(masterPassword);
        if (!systemState.inventory || !systemState.recipes) {
            return NextResponse.json({ error: 'System volume malformed' }, { status: 500 });
        }

        const recipe = systemState.recipes.find((r: any) => r.id === recipeId);
        if (!recipe) {
            return NextResponse.json({ error: 'Recipe not found in state' }, { status: 404 });
        }

        const items: InventoryItem[] = systemState.inventory;
        const outIdx = items.findIndex((i: InventoryItem) => i.id === recipe.outputItemId);
        if (outIdx === -1) {
            return NextResponse.json({ error: 'Output item not found in master inventory' }, { status: 404 });
        }

        const m = Math.max(1, Number(multiplier) || 1);

        if (action === 'craft') {
            // Verify ingredients
            for (const ing of recipe.ingredients) {
                const idx = items.findIndex(i => i.id === ing.itemId);
                const reqQty = ing.quantity * m;
                if (idx === -1) {
                    return NextResponse.json({ error: `Cannot craft: An ingredient item has been permanently deleted from inventory.` }, { status: 400 });
                } else if (items[idx].quantity < reqQty) {
                    return NextResponse.json({ error: `Insufficient quantity for ingredient ${items[idx].name}. Need ${reqQty}.` }, { status: 400 });
                }
            }

            // Deduct
            for (const ing of recipe.ingredients) {
                const idx = items.findIndex(i => i.id === ing.itemId);
                items[idx].quantity = formatQty(items[idx].quantity - (ing.quantity * m));
            }

            // Add Output
            items[outIdx].quantity = formatQty(items[outIdx].quantity + (recipe.outputQuantity * m));

        } else if (action === 'reverse') {
            if (!recipe.reversible) {
                return NextResponse.json({ error: 'This recipe is not marked as reversible.' }, { status: 400 });
            }

            const reqOutQty = recipe.outputQuantity * m;
            if (items[outIdx].quantity < reqOutQty) {
                return NextResponse.json({ error: `Insufficient master supply to reverse craft. Need ${reqOutQty}.` }, { status: 400 });
            }

            // Deduct Output
            items[outIdx].quantity = formatQty(items[outIdx].quantity - reqOutQty);

            // Return Salvage
            for (const ing of recipe.ingredients) {
                // By default, return salvageQuantity if defined, else quantity
                const defaultReturnPerBatch = ing.salvageQuantity !== undefined ? ing.salvageQuantity : ing.quantity;

                // If the user specified a dynamic loss for this ingredient (per batch)
                let customLossPerBatch = 0;
                if (losses && typeof losses[ing.itemId] === 'number') {
                    customLossPerBatch = losses[ing.itemId];
                }

                // Actual return = (defaultReturn - customLoss) * multiplier
                // Ensure it doesn't drop below 0
                const actualReturnPerBatch = Math.max(0, defaultReturnPerBatch - customLossPerBatch);
                const totalReturn = actualReturnPerBatch * m;

                if (totalReturn > 0) {
                    const idx = items.findIndex(i => i.id === ing.itemId);
                    if (idx !== -1) {
                        items[idx].quantity = formatQty(items[idx].quantity + totalReturn);
                    }
                }
            }
        }

        await saveVolume(systemState, masterPassword);

        return NextResponse.json({ success: true, message: `Successfully executed ${action} for recipe.` });

    } catch (error: any) {
        console.error("Error in inventory craft/reverse:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
