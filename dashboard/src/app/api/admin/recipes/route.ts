import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { CraftingRecipeSchema } from '@/zod_schemas/candy-store-related';
import { encryptWithSystemKey, decryptWithSystemKey, decryptData, encryptData, sha256Hash } from '@/lib/encryption';
import { getMasterPassword } from '@/lib/sessionAuth';
import crypto from 'crypto';

// ─── Helpers for Migration ────────────────────────────────────────────────────────
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

async function runMigrationIfNecessary(request: NextRequest, decodedToken: admin.auth.DecodedIdToken) {
    const publicSnap = await db.collection('recipes').doc('public').collection('items').limit(1).get();
    const privateSnap = await db.collection('recipes').doc('private').collection('items').limit(1).get();

    // If new collections already have data, assume migration is done
    if (!publicSnap.empty || !privateSnap.empty) {
        return false; // no migration ran
    }

    let masterPassword;
    try {
        masterPassword = await getMasterPassword(request, decodedToken.uid);
    } catch {
        return false;
    }

    let content;
    try {
        content = await decryptVolume(masterPassword);
    } catch {
        return false;
    }

    if (!content.recipes || content.recipes.length === 0) {
        return false; 
    }

    const batch = db.batch();

    for (const recipe of content.recipes) {
        const visibility = recipe.visibility || 'public';
        const docRef = db.collection('recipes').doc(visibility).collection('items').doc(recipe.id);
        
        if (visibility === 'private') {
            const encryptedParams = encryptWithSystemKey(recipe);
            batch.set(docRef, encryptedParams);
        } else {
            batch.set(docRef, recipe);
        }
    }

    // Remove from volume
    content.recipes = [];
    await saveVolume(content, masterPassword);

    await batch.commit();
    return true; // migration ran
}
// ────────────────────────────────────────────────────────────────────────────

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

        // Optional one-time migration
        await runMigrationIfNecessary(request, decodedToken);

        const recipes: any[] = [];

        // 1. Fetch public recipes (plaintext)
        const publicSnap = await db.collection('recipes').doc('public').collection('items').get();
        publicSnap.forEach(doc => {
            recipes.push(doc.data());
        });

        // 2. Fetch private recipes (encrypted)
        const privateSnap = await db.collection('recipes').doc('private').collection('items').get();
        privateSnap.forEach(doc => {
            try {
                const decryptedRecipe = decryptWithSystemKey(doc.data() as any);
                recipes.push(decryptedRecipe);
            } catch (err) {
                console.error(`Failed to decrypt private recipe ${doc.id}`);
            }
        });

        return NextResponse.json(recipes);
    } catch (error) {
        console.error('Error fetching recipes:', error);
        return NextResponse.json({ error: 'Failed to fetch recipes' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const validation = CraftingRecipeSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors }, { status: 400 });
        }

        // Validate
        if (validation.data.ingredients.some(ing => ing.itemId === validation.data.outputItemId)) {
            return NextResponse.json({ error: 'A craftable item cannot be an ingredient in its own recipe.' }, { status: 400 });
        }

        const ingredientIds = validation.data.ingredients.map(ing => ing.itemId);
        if (new Set(ingredientIds).size !== ingredientIds.length) {
            return NextResponse.json({ error: 'A recipe cannot contain duplicate ingredients.' }, { status: 400 });
        }

        const newRecipe = {
            ...validation.data,
            id: body.id || Date.now().toString() + Math.random().toString(36).substring(2, 5),
            createdAt: new Date().toISOString(),
        };

        const visibility = newRecipe.visibility || 'public';
        const docRef = db.collection('recipes').doc(visibility).collection('items').doc(newRecipe.id);

        if (visibility === 'private') {
            const encryptedParams = encryptWithSystemKey(newRecipe);
            await docRef.set(encryptedParams);
        } else {
            await docRef.set(newRecipe);
        }

        // If the recipe switched visibility (e.g. from private to public), we should try to delete it from the other subcollection just in case
        const otherVisibility = visibility === 'public' ? 'private' : 'public';
        await db.collection('recipes').doc(otherVisibility).collection('items').doc(newRecipe.id).delete();

        return NextResponse.json(newRecipe, { status: 201 });
    } catch (error) {
        console.error('Error creating recipe:', error);
        return NextResponse.json({ error: 'Failed to save recipe' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const searchParams = request.nextUrl.searchParams;
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Recipe ID required' }, { status: 400 });
        }

        // Delete from both just to be safe
        await Promise.all([
            db.collection('recipes').doc('public').collection('items').doc(id).delete(),
            db.collection('recipes').doc('private').collection('items').doc(id).delete()
        ]);

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error('Error deleting recipe:', error);
        return NextResponse.json({ error: 'Failed to delete recipe' }, { status: 500 });
    }
}
