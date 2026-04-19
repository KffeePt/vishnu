import { NextRequest, NextResponse } from 'next/server';
import { admin } from '@/config/firebase-admin';
import { decryptData } from '@/lib/encryption';
import { getAuthDocCached, getMasterPassword } from '@/lib/sessionAuth';
import { purgeStaffMemberCompletely } from '@/lib/staff-purge';

/**
 * DELETE /api/admin/staff-data/[uid]
 * Owner-only: detailed wipe of a staff member's security and app data.
 * This includes auth, username, public keys, passkeys, TOTP, shadow assignments,
 * inventory pushes, related chats/logs, Firebase Auth, and staff-linked volume data.
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ uid: string }> }
) {
    try {
        const { uid: targetUid } = await params;
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);

        // Only owners can reset staff key data
        if (!decodedToken.owner) {
            return NextResponse.json({ error: 'Forbidden: owner role required' }, { status: 403 });
        }

        if (!targetUid) {
            return NextResponse.json({ error: 'Missing uid parameter' }, { status: 400 });
        }

        const body = await request.json().catch(() => ({}));
        let masterPassword = typeof body?.masterPassword === 'string' ? body.masterPassword : '';
        const deleteAuthUser = body?.deleteAuthUser !== false;

        if (masterPassword) {
            const authDoc = await getAuthDocCached();
            if (!authDoc.exists) {
                return NextResponse.json({ error: 'Master password not set' }, { status: 400 });
            }

            try {
                const decryptedTest = decryptData(authDoc.data()!.encryptedData, masterPassword);
                if (decryptedTest !== 'master_password_valid') {
                    throw new Error('Invalid');
                }
            } catch {
                return NextResponse.json({ error: 'Invalid master password' }, { status: 401 });
            }
        } else {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        }

        const deleted = await purgeStaffMemberCompletely(targetUid, masterPassword, { deleteAuthUser });

        console.log(`Successfully wiped all data for user ${targetUid}`);

        return NextResponse.json({
            success: true,
            message: 'Staff member fully removed from the system.',
            deleted,
        });
    } catch (error: any) {
        console.error('Error clearing staff data:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
