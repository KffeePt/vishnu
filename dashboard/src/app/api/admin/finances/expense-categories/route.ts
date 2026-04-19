import { db, admin } from "@/config/firebase-admin";
import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { decryptData, encryptData, sha256Hash } from "@/lib/encryption";
import { validateSession } from '@/lib/sessionAuth';
import crypto from 'crypto';

async function decryptVolume(masterPassword: string) {
    // Get metadata
    const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
    if (!metaDoc.exists) {
        throw new Error('Volume not found');
    }

    const meta = metaDoc.data()!;
    const decryptedMeta = decryptData({
        encryptedData: meta.encryptedData,
        salt: meta.salt,
        iv: meta.iv,
        authTag: meta.authTag
    }, masterPassword);

    const { chunkIds } = decryptedMeta;

    // Get all chunks
    const chunks: string[] = [];
    for (const chunkId of chunkIds) {
        const chunkDoc = await db.collection('udhhmbtc').doc(chunkId).get();
        if (!chunkDoc.exists) {
            throw new Error(`Missing chunk: ${chunkId}`);
        }
        chunks.push(chunkDoc.data()!.chunk);
    }

    // Combine chunks
    const encryptedDataStr = chunks.join('');

    // Decrypt the content
    const content = decryptData({
        encryptedData: encryptedDataStr,
        salt: decryptedMeta.salt,
        iv: decryptedMeta.iv,
        authTag: decryptedMeta.authTag
    }, masterPassword);

    return content;
}

async function saveVolume(content: any, masterPassword: string) {
    // Encrypt the content
    const encryptedObj = encryptData(content, masterPassword);
    const dataHash = sha256Hash(JSON.stringify(content));

    // Split into chunks (1MB each)
    const chunkSize = 1024 * 1024;
    const chunks: string[] = [];
    for (let i = 0; i < encryptedObj.encryptedData.length; i += chunkSize) {
        chunks.push(encryptedObj.encryptedData.slice(i, i + chunkSize));
    }

    // Get current metadata to get old chunk IDs
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

    // Create new metadata
    const newMeta = {
        chunkCount: chunks.length,
        salt: encryptedObj.salt,
        iv: encryptedObj.iv,
        authTag: encryptedObj.authTag,
        chunkIds: chunks.map(() => crypto.randomUUID()),
        dataHash,
    };
    const encryptedMeta = encryptData(newMeta, masterPassword);

    // Batch update
    const batch = db.batch();

    // Delete old chunks
    for (const chunkId of oldChunkIds) {
        batch.delete(db.collection('udhhmbtc').doc(chunkId));
    }

    // Set new chunks
    for (let i = 0; i < chunks.length; i++) {
        batch.set(db.collection('udhhmbtc').doc(newMeta.chunkIds[i]), {
            chunk: chunks[i],
            createdAt: new Date(),
        });
    }

    // Update metadata
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

        if (!decodedToken.owner || decodedToken.owner !== true) {
            return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
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
            return NextResponse.json({ error: 'Master password required' }, { status: 400 });
        }

        const authDoc = await db.collection('udhhmbtc').doc('auth').get();
        if (!authDoc.exists) {
            return NextResponse.json({ error: 'Master password not set' }, { status: 400 });
        }
        const authData = authDoc.data()!;
        try {
            const decryptedTest = decryptData(authData.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') {
                throw new Error('Invalid');
            }
        } catch (error) {
            return NextResponse.json({ error: 'Invalid master password' }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);

        return NextResponse.json({
            expenseCategories: content.expenseCategories || []
        });
    } catch (error) {
        console.error("Error fetching expense categories:", error);
        return NextResponse.json({ error: "Failed to fetch expense categories" }, { status: 500 });
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

        if (!decodedToken.owner || decodedToken.owner !== true) {
            return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
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
            return NextResponse.json({ error: 'Master password required' }, { status: 400 });
        }

        const { name, description } = await request.json();

        if (!name) {
            return NextResponse.json({ error: "Missing required field: name" }, { status: 400 });
        }

        const authDoc = await db.collection('udhhmbtc').doc('auth').get();
        if (!authDoc.exists) {
            return NextResponse.json({ error: "Master password not set" }, { status: 400 });
        }

        const authData = authDoc.data()!;
        try {
            const decryptedTest = decryptData(authData.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') {
                return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
            }
        } catch (error) {
            return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);

        const newCategory = {
            id: Date.now().toString(),
            name,
            description: description || "",
            createdAt: new Date(),
        };

        content.expenseCategories = content.expenseCategories || [];
        content.expenseCategories.push(newCategory);

        await saveVolume(content, masterPassword);

        return NextResponse.json({
            message: "Expense category created successfully",
            category: newCategory,
        });
    } catch (error) {
        console.error("Error saving expense category:", error);
        return NextResponse.json({ error: "Failed to save expense category" }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (!decodedToken.owner || decodedToken.owner !== true) {
            return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
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
            return NextResponse.json({ error: 'Master password required' }, { status: 400 });
        }

        const url = new URL(request.url);
        const categoryId = url.searchParams.get('id');
        if (!categoryId) {
            return NextResponse.json({ error: 'Category ID required' }, { status: 400 });
        }

        const { name, description } = await request.json();

        const authDoc = await db.collection('udhhmbtc').doc('auth').get();
        if (!authDoc.exists) {
            return NextResponse.json({ error: "Master password not set" }, { status: 400 });
        }

        const authData = authDoc.data()!;
        try {
            const decryptedTest = decryptData(authData.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') {
                return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
            }
        } catch (error) {
            return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);

        if (!content.expenseCategories || !Array.isArray(content.expenseCategories)) {
            return NextResponse.json({ error: 'No expense categories data found' }, { status: 404 });
        }

        const catIndex = content.expenseCategories.findIndex((c: any) => c.id === categoryId);
        if (catIndex === -1) {
            return NextResponse.json({ error: 'Expense category not found' }, { status: 404 });
        }

        content.expenseCategories[catIndex] = {
            ...content.expenseCategories[catIndex],
            name: name || content.expenseCategories[catIndex].name,
            description: description !== undefined ? description : content.expenseCategories[catIndex].description,
        };

        await saveVolume(content, masterPassword);

        return NextResponse.json({
            message: "Expense category updated successfully",
            category: content.expenseCategories[catIndex],
        });
    } catch (error) {
        console.error("Error updating expense category:", error);
        return NextResponse.json({ error: "Failed to update expense category" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (!decodedToken.owner || decodedToken.owner !== true) {
            return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
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
            return NextResponse.json({ error: 'Master password required' }, { status: 400 });
        }

        const url = new URL(request.url);
        const categoryId = url.searchParams.get('id');
        if (!categoryId) {
            return NextResponse.json({ error: 'Category ID required' }, { status: 400 });
        }

        const authDoc = await db.collection('udhhmbtc').doc('auth').get();
        if (!authDoc.exists) {
            return NextResponse.json({ error: "Master password not set" }, { status: 400 });
        }

        const authData = authDoc.data()!;
        try {
            const decryptedTest = decryptData(authData.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') {
                return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
            }
        } catch (error) {
            return NextResponse.json({ error: "Invalid master password" }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);

        if (!content.expenseCategories || !Array.isArray(content.expenseCategories)) {
            return NextResponse.json({ error: 'No expense categories data found' }, { status: 404 });
        }

        const catIndex = content.expenseCategories.findIndex((c: any) => c.id === categoryId);
        if (catIndex === -1) {
            return NextResponse.json({ error: 'Expense category not found' }, { status: 404 });
        }

        content.expenseCategories.splice(catIndex, 1);

        await saveVolume(content, masterPassword);

        return NextResponse.json({
            message: "Expense category deleted successfully",
            deletedCategoryId: categoryId,
        });
    } catch (error) {
        console.error("Error deleting expense category:", error);
        return NextResponse.json({ error: "Failed to delete expense category" }, { status: 500 });
    }
}
