import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { z } from 'zod';

const UpdateRefundSchema = z.object({
    status: z.enum(['pending', 'approved_with_return', 'approved_without_return', 'rejected']),
});

export async function GET(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const url = new URL(request.url);
        const statusFilter = url.searchParams.get('status');

        let query: FirebaseFirestore.Query = db.collection('refunds');
        if (statusFilter) {
            query = query.where('status', '==', statusFilter);
        }

        const snapshot = await query.orderBy('createdAt', 'desc').get();
        const refunds = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        return NextResponse.json(refunds);
    } catch (error) {
        console.error('Error fetching refunds:', error);
        return NextResponse.json({ error: 'Failed to fetch refunds' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const { id, status } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing refund ID' }, { status: 400 });
        }

        const validation = UpdateRefundSchema.safeParse({ status });
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors }, { status: 400 });
        }

        const ref = db.collection('refunds').doc(id);
        const doc = await ref.get();
        if (!doc.exists) {
            return NextResponse.json({ error: 'Refund not found' }, { status: 404 });
        }

        await ref.update({
            status: validation.data.status,
            resolvedAt: new Date().toISOString()
        });

        return NextResponse.json({ success: true, status: validation.data.status });
    } catch (error) {
        console.error('Error updating refund:', error);
        return NextResponse.json({ error: 'Failed to update refund' }, { status: 500 });
    }
}
