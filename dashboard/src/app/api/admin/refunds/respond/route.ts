import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { z } from 'zod';

const RefundResponseSchema = z.object({
    refundId: z.string().min(1),
    action: z.enum(['approve_with_return_backend_only', 'approve_without_return', 'approve_loss', 'deny']),
});

export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const validation = RefundResponseSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: 'Invalid request', details: validation.error.errors }, { status: 400 });
        }

        const { refundId, action } = validation.data;

        const refundRef = db.collection('refunds').doc(refundId);
        const refundDoc = await refundRef.get();

        if (!refundDoc.exists) {
            return NextResponse.json({ error: 'Refund not found' }, { status: 404 });
        }

        const refundData = refundDoc.data()!;
        if (refundData.status !== 'pending') {
            return NextResponse.json({ error: 'Refund is no longer pending' }, { status: 400 });
        }

        // The saleRecordId lives INSIDE the encrypted wrapper by design.
        // The admin client decrypts the envelope and sends the plaintext
        // saleRecordId to this endpoint ONLY to perform the finance deletion.
        const saleRecordId = body.saleRecordId;
        const employeeId = refundData.employeeId;

        if ((action === 'approve_with_return_backend_only' || action === 'approve_without_return') && !saleRecordId) {
            return NextResponse.json({ error: 'Missing plaintext saleRecordId required for approval flow' }, { status: 400 });
        }

        const batch = db.batch();

        if (action === 'approve_with_return_backend_only' || action === 'approve_without_return') {
            // Delete the finance record server-side
            const financeRecordRef = db.collection('finances').doc(employeeId).collection('records').doc(saleRecordId);
            batch.delete(financeRecordRef);

            // The client (Admin) has ALREADY performed the E2E inventory decryption,
            // increment, and re-encryption loop if the action was `approve_with_return_backend_only`.
            // We just need to update the status now.
            const newStatus = action === 'approve_with_return_backend_only' ? 'approved_with_return' : 'approved_without_return';
            batch.update(refundRef, {
                status: newStatus,
                resolvedAt: new Date().toISOString(),
            });

        } else if (action === 'approve_loss') {
            // Inventory loss has no associated finance record to delete because it was never a sale.
            // We just mark the refund request as approved. The client already handled burning the master inventory item.
            batch.update(refundRef, {
                status: 'approved_loss',
                resolvedAt: new Date().toISOString(),
            });
        } else if (action === 'deny') {
            batch.update(refundRef, {
                status: 'rejected',
                resolvedAt: new Date().toISOString(),
            });
        }

        await batch.commit();

        return NextResponse.json({ success: true, message: 'Refund processed successfully' });

    } catch (error) {
        console.error('Error processing refund response:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
