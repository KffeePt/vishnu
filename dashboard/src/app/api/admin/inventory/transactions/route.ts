import { NextRequest, NextResponse } from 'next/server';
import { db, admin } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { decryptData } from '@/lib/encryption';
import { getMasterPassword } from '@/lib/sessionAuth';
import { CandySale } from '@/types/candyland';

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

        let masterPassword;
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        } catch (e: any) {
            return NextResponse.json({ error: e.message }, { status: 401 });
        }

        const content = await decryptVolume(masterPassword);
        const inventory = content.inventory || [];
        const sales: any[] = content.sales || [];

        // Assemble transactions based on what the UI expects (likely assignment events and sale events)
        const transactions: any[] = [];

        // Push sales as transactions
        sales.forEach(sale => {
            transactions.push({
                id: sale.id,
                date: sale.date,
                type: 'sale',
                totalAmount: sale.totalAmount,
                items: sale.items,
                staffId: sale.staffId || 'admin',
                description: `Sold ${sale.items.length} item(s)`,
            });
        });

        // Push inventory assignments as transactions
        inventory.forEach((item: any) => {
            if (item.assignments && Array.isArray(item.assignments)) {
                item.assignments.forEach((assignment: any) => {
                    transactions.push({
                        id: assignment.id || crypto.randomUUID(),
                        date: assignment.assignedAt,
                        type: 'assignment',
                        itemId: item.id,
                        itemName: item.name,
                        quantity: assignment.quantity,
                        staffId: assignment.staffId,
                        staffName: assignment.staffName || 'Staff',
                        description: `Assigned ${assignment.quantity} unit(s) to ${assignment.staffName}`,
                    });
                });
            }
        });

        // Sort chronologically descending
        transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        return NextResponse.json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json({ error: 'Failed to fetch tracking data' }, { status: 500 });
    }
}
