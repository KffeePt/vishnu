import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { z } from 'zod';
import { decryptData, encryptData, sha256Hash } from '@/lib/encryption';
import { getMasterPassword } from '@/lib/sessionAuth';
import { formatQty } from '@/lib/format-qty';
import { convertQty, SupportedUnit } from '@/lib/unit-conversion';
import crypto from 'crypto';

const AssignActionSchema = z.object({
    action: z.enum(['assign', 'unassign', 'delete_assignment', 'undo_sale_unassign', 'restock_item', 'burn_item']),
    employeeId: z.string().optional(),
    quantity: z.number().positive(),
    soldQuantity: z.number().nonnegative().optional(), // For delete_assignment quantity crunching
});

const UpdateItemSchema = z.object({
    name: z.string().min(2).optional(),
    category: z.string().min(1).optional(),
    description: z.string().optional(),
    unitValue: z.number().min(0).optional(),
    quantity: z.number().min(0).optional(),
    unit: z.enum(['pcs', 'mg', 'grams', 'kg', 'oz']).optional(),
    notes: z.string().nullable().optional(),
    flexiblePrice: z.boolean().optional(),
    flexibilityPercent: z.number().min(0).max(100).optional(),
});

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        const { itemId } = await params;

        let masterPassword;
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);
        const inventory = content.inventory || [];
        const item = inventory.find((i: any) => i.id === itemId);

        if (!item) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        return NextResponse.json(item);
    } catch (error) {
        console.error('Error fetching inventory item:', error);
        return NextResponse.json({ error: 'Failed to fetch inventory item' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        const { itemId } = await params;
        const body = await request.json();

        let masterPassword;
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);
        if (!content.inventory || !Array.isArray(content.inventory)) {
            return NextResponse.json({ error: 'No inventory data found' }, { status: 404 });
        }

        const itemIndex = content.inventory.findIndex((i: any) => i.id === itemId);
        if (itemIndex === -1) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        const itemData = content.inventory[itemIndex];

        // --- Assignment action ---
        const assignmentActions = ['assign', 'unassign', 'delete_assignment', 'undo_sale_unassign', 'restock_item', 'burn_item'];
        if (assignmentActions.includes(body.action)) {
            const validation = AssignActionSchema.safeParse(body);
            if (!validation.success) {
                return NextResponse.json({ error: validation.error.errors }, { status: 400 });
            }

            const { action, employeeId, quantity, soldQuantity } = validation.data;

            if (!employeeId && action !== 'burn_item') {
                return NextResponse.json({ error: "employeeId is required for this action" }, { status: 400 });
            }

            const totalQty: number = itemData.quantity ?? 0;
            let assignments: Array<{ employeeId: string; employeeName: string; quantity: number }> =
                itemData.assignments ?? [];

            if (action === 'assign' && employeeId) {
                // Fetch employee name for denormalization
                const empDoc = await db.collection('staff-data').doc(employeeId).get();
                let employeeName = 'Unknown';
                try {
                    const userRecord = await admin.auth().getUser(employeeId);
                    employeeName = userRecord.displayName || userRecord.email || 'Unknown Staff';
                } catch {
                    if (empDoc.exists) {
                        const data = empDoc.data() || {};
                        employeeName = data.name || `Staff ${employeeId.substring(0, 4)}`;
                    }
                }

                // Check available capacity
                const currentlyAssigned = formatQty(assignments.reduce((sum, a) => sum + (Number(a.quantity) || 0), 0));
                const available = formatQty(totalQty - currentlyAssigned);

                if (quantity > available) {
                    return NextResponse.json(
                        { error: `Cannot assign ${quantity} — only ${available} available` },
                        { status: 400 }
                    );
                }

                const existing = assignments.find(a => a.employeeId === employeeId);
                if (existing) {
                    assignments = assignments.map(a =>
                        a.employeeId === employeeId ? { ...a, quantity: formatQty(a.quantity + quantity) } : a
                    );
                } else {
                    assignments = [...assignments, { employeeId, employeeName, quantity }];
                }
            } else if (action === 'delete_assignment' && employeeId) {
                // Remove assignment entirely
                const existing = assignments.find(a => a.employeeId === employeeId);
                
                // If it existed in master, returning it to stock means we don't change totalQty
                // UNLESS it was a crafted item (shadow assignment > master assignment)
                // However, the API only knows what was in master. 
                // The UI will pass the FULL quantity to unassign.
                
                // Logic: If returning more than what we gave them, it's a 'crafted' return.
                const masterQty = existing ? (Number(existing.quantity) || 0) : 0;
                const returnQty = Number(quantity) || 0;
                const excessReturn = Math.max(0, returnQty - masterQty);

                // Update total stock only by the amount they crafted (excess)
                itemData.quantity = formatQty(totalQty + excessReturn);

                // Completely remove the assignment from master
                assignments = assignments.filter(a => a.employeeId !== employeeId);

            } else if (action === 'unassign' && employeeId) {
                // Unassign (standard or partial)
                const existing = assignments.find(a => a.employeeId === employeeId);
                const masterQty = existing ? (Number(existing.quantity) || 0) : 0;
                const returnQty = Number(quantity) || 0;
                
                // Calculate how much of this return is "new" to the master inventory (crafted)
                const excessReturn = Math.max(0, returnQty - masterQty);
                const masterDeduction = Math.min(masterQty, returnQty);

                // 1. Add crafted items to total stock
                itemData.quantity = formatQty(totalQty + excessReturn);

                // 2. Reduce master assignment by its portion of the return
                if (existing) {
                    const newMasterQty = formatQty(masterQty - masterDeduction);
                    if (newMasterQty <= 0) {
                        assignments = assignments.filter(a => a.employeeId !== employeeId);
                    } else {
                        assignments = assignments.map(a => 
                            a.employeeId === employeeId ? { ...a, quantity: newMasterQty } : a
                        );
                    }
                }
            }

            content.inventory[itemIndex] = {
                ...itemData,
                assignments,
                updatedAt: new Date().toISOString()
            };

            await saveVolume(content, masterPassword);
            return NextResponse.json({ message: 'Assignment updated', assignments });
        }

        // --- Regular field update ---
        const validation = UpdateItemSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors }, { status: 400 });
        }

        let assignments = itemData.assignments ?? [];

        // If unit is changing, mathematically scale all existing assignments to match
        if (validation.data.unit && itemData.unit && validation.data.unit !== itemData.unit) {
            const fromUnit = itemData.unit as SupportedUnit;
            const toUnit = validation.data.unit as SupportedUnit;

            assignments = assignments.map((a: any) => ({
                ...a,
                quantity: convertQty(a.quantity, fromUnit, toUnit)
            }));
        }

        content.inventory[itemIndex] = {
            ...itemData,
            ...validation.data,
            assignments,
            updatedAt: new Date().toISOString()
        };

        await saveVolume(content, masterPassword);
        return NextResponse.json({ message: 'Item updated successfully' });

    } catch (error) {
        console.error('Error updating inventory item:', error);
        return NextResponse.json({ error: 'Failed to update inventory item' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        const { itemId } = await params;

        let masterPassword;
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);
        if (!content.inventory || !Array.isArray(content.inventory)) {
            return NextResponse.json({ error: 'No inventory data found' }, { status: 404 });
        }

        let body: any = {};
        try {
            // NextRequest json() throws if body is empty
            const text = await request.text();
            if (text) {
                body = JSON.parse(text);
            }
        } catch (e) {
            console.error("Failed to parse DELETE body", e);
        }

        const burnStaffInventory = body?.burnStaffInventory === true;

        const itemIndex = content.inventory.findIndex((i: any) => i.id === itemId);
        if (itemIndex === -1) {
            return NextResponse.json({ error: 'Item not found' }, { status: 404 });
        }

        const itemData = content.inventory[itemIndex];

        // If burning staff inventory is NOT requested, block deletion if assignments exist
        if (!burnStaffInventory && (itemData.assignments ?? []).length > 0) {
            return NextResponse.json(
                { error: 'Cannot delete item with active assignments. Unassign all staff first.' },
                { status: 400 }
            );
        }

        // Remove from master volume
        content.inventory.splice(itemIndex, 1);
        await saveVolume(content, masterPassword);

        // --- Recipe Deletion Hook ---
        // Find and delete any recipes where this item is the outputItem
        const batch = db.batch();
        
        // 1. Delete associated public recipes
        const pubSnap = await db.collection('recipes').doc('public').collection('items').where('outputItemId', '==', itemId).get();
        pubSnap.forEach(doc => batch.delete(doc.ref));

        // 2. Delete associated private recipes
        // Since private recipes are encrypted with a system key, we have to fetch all, decrypt, and check the outputItemId
        try {
            const { decryptWithSystemKey } = await import('@/lib/encryption');
            const privSnap = await db.collection('recipes').doc('private').collection('items').get();
            privSnap.forEach(doc => {
                try {
                    const dec = decryptWithSystemKey(doc.data() as any);
                    if (dec.outputItemId === itemId) {
                        batch.delete(doc.ref);
                    }
                } catch(e) {}
            });
        } catch (e) {
            console.error("Failed to process private recipes for deletion:", e);
        }

        await batch.commit();
        // ----------------------------

        return NextResponse.json({ message: 'Item deleted successfully' });
    } catch (error) {
        console.error('Error deleting inventory item:', error);
        return NextResponse.json({ error: 'Failed to delete inventory item' }, { status: 500 });
    }
}
