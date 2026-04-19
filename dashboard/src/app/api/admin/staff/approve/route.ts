import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { getMasterPassword } from '@/lib/sessionAuth';
import { encryptData } from '@/lib/encryption';
import { Timestamp } from 'firebase-admin/firestore';

export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const body = await request.json();
        const { uid, action } = body;

        if (!uid || !action || !['approve', 'reject'].includes(action)) {
            return NextResponse.json({ error: 'Valid UID and action (approve/reject) required' }, { status: 400 });
        }

        const docRef = db.collection('staff-data').doc(uid);
        const doc = await docRef.get();

        if (!doc.exists) {
            return NextResponse.json({ error: 'Staff registration not found' }, { status: 404 });
        }

        const data = doc.data();

        // Server-Side Vercel-Safe Expiration Check
        // Explicitly reject and delete if the request is older than 5 minutes
        if (data?.status === 'pending') {
            const setupTime = new Date(data.setupCompletedAt || data.updatedAt).getTime();
            if (Date.now() - setupTime > 5 * 60 * 1000) {
                const batch = db.batch();
                batch.delete(docRef);
                batch.delete(db.collection('public').doc(uid));
                await batch.commit();

                return NextResponse.json({ error: 'Registration request expired.' }, { status: 400 });
            }
        }

        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        if (action === 'approve') {
            // Get master password from session to create encrypted employee data
            let masterPassword = '';
            try {
                masterPassword = await getMasterPassword(request);
            } catch (e) {
                return NextResponse.json({ error: 'Master password required to approve staff (needed for encryption)' }, { status: 400 });
            }

            // Fetch user's Auth record for employee data
            const userRecord = await admin.auth().getUser(uid);
            const employeeName = userRecord.displayName || 'Unknown Staff';
            const employeeEmail = userRecord.email || 'Unknown';

            // Create encrypted employee data block (same structure as admin POST /api/admin/staff)
            const employeeData = {
                name: employeeName,
                email: employeeEmail,
                role: 'staff',
                phoneNumber: null,
                isActive: true,
                userId: uid,
            };

            const encryptedContent = encryptData(employeeData, masterPassword);

            // Merge encrypted data + status into the existing staff-data doc
            await docRef.update({
                ...encryptedContent,
                status: newStatus,
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
            });

            // Grant staff and user claims
            const currentClaims = userRecord.customClaims || {};
            await admin.auth().setCustomUserClaims(uid, {
                ...currentClaims,
                staff: true,
                user: true
            });
        } else {
            // Reject: update status and ensure createdAt exists for ordering
            await docRef.update({
                status: newStatus,
                createdAt: data?.setupCompletedAt ? Timestamp.fromDate(new Date(data.setupCompletedAt)) : Timestamp.now(),
                updatedAt: Timestamp.now(),
            });
        }

        return NextResponse.json({
            success: true,
            message: `Staff registration ${action}d successfully`,
            status: newStatus
        });
    } catch (error: any) {
        console.error(`Error processing staff approval:`, error);
        return NextResponse.json({ error: error.message || 'Failed to process approval' }, { status: 500 });
    }
}
