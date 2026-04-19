import { NextRequest, NextResponse } from 'next/server';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import admin from '@/config/firebase-admin';
import { initAdmin } from '@/config/firebase-admin';

// Initialize Firebase Admin if not already initialized
initAdmin();

export async function POST(request: NextRequest) {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) return authResult;

    try {
        const { uid, role } = await request.json();

        if (!uid || !role) {
            return NextResponse.json({ error: 'UID and Role are required' }, { status: 400 });
        }

        // Verify the requester is an OWNER (only owners can manage roles)
        const idToken = request.headers.get('Authorization')?.split('Bearer ')[1];
        if (!idToken) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const { isBootstrapOwner, closeBootstrapGate } = require('@/lib/ownerBootstrap');
        const isBootstrap = await isBootstrapOwner(decodedToken);

        if (!decodedToken.owner && !isBootstrap) {
            return NextResponse.json({ error: 'Only Owners can manage roles' }, { status: 403 });
        }

        let customClaims: Record<string, boolean> = {};

        switch (role.toLowerCase()) {
            case 'owner':
                customClaims = { owner: true, admin: true, manager: true, staff: true, user: true };
                break;
            case 'admin':
                customClaims = { admin: true, manager: true, staff: true, user: true };
                break;
            case 'manager':
                customClaims = { manager: true, staff: true, user: true };
                break;
            case 'staff':
                customClaims = { staff: true, user: true };
                break;
            case 'user':
                customClaims = { user: true };
                break;
            case 'test':
                customClaims = { test: true };
                break;
            default:
                return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
        }

        await admin.auth().setCustomUserClaims(uid, customClaims);

        // If bootstrap owner just granted owner claims (to themselves or generally finished), 
        // permanently close the gate.
        if (isBootstrap && customClaims.owner === true) {
            await closeBootstrapGate();
        }

        // Get updated user record to confirm
        const userRecord = await admin.auth().getUser(uid);

        return NextResponse.json({
            success: true,
            message: `Role '${role}' assigned to user ${userRecord.email || uid}`,
            claims: userRecord.customClaims
        });

    } catch (error: any) {
        console.error('Error setting claims:', error);
        return NextResponse.json({ error: error.message || 'Failed to set claims' }, { status: 500 });
    }
}
