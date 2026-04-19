import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { applyRateLimit } from '@/lib/rate-limiter';
import { decryptCredentialBlob, EncryptedCredentialBlob } from '@/lib/credential-crypto';
import { getPasskeysForUserCached } from '@/lib/passkeyCache';
import { getPasskeyPanelLabel } from '@/lib/passkey-panels';

async function getHandler(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

        const { isBootstrapOwner } = require('@/lib/ownerBootstrap');
        if (decodedToken.staff !== true && decodedToken.admin !== true && decodedToken.owner !== true && !(await isBootstrapOwner(decodedToken))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const userId = decodedToken.uid;

        // Get all passkeys for this user (remove orderBy to avoid composite index failure)
        const passkeyDocs = await getPasskeysForUserCached(userId);

        const passkeys = passkeyDocs.map(doc => {
            const data = doc.data();
            let transports: string[] = [];

            // Handle encrypted passkeys
            if (data.encryptedBlob && data.iv && data.authTag) {
                try {
                    const blob: EncryptedCredentialBlob = {
                        encryptedBlob: data.encryptedBlob,
                        iv: data.iv,
                        authTag: data.authTag
                    };
                    const decryptedData = decryptCredentialBlob(blob);
                    transports = decryptedData.transports || [];
                } catch (err) {
                    console.error(`Failed to decrypt blob for passkey ${doc.id}`);
                }
            } else {
                // Fallback for unmigrated plaintext passkeys
                transports = data.transports || [];
            }

            return {
                id: doc.id,
                name: data.name,
                isAdmin: data.isAdmin === true,
                isCandyman: data.isCandyman === true,
                panelLabel: getPasskeyPanelLabel(data),
                createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
                lastUsed: data.lastUsed?.toDate?.()?.toISOString() || null,
                transports: transports,
                backedUp: data.backedUp || false,
            };
        });

        // Sort in-memory descending by createdAt
        passkeys.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });

        return NextResponse.json({ passkeys });

    } catch (error: any) {
        console.error('Error getting passkeys:', error);
        return NextResponse.json(
            { error: 'Failed to get passkeys' },
            { status: 500 }
        );
    }
}

async function deleteHandler(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

        const { isBootstrapOwner } = require('@/lib/ownerBootstrap');
        if (decodedToken.staff !== true && decodedToken.admin !== true && decodedToken.owner !== true && !(await isBootstrapOwner(decodedToken))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const userId = decodedToken.uid;

        const { passkeyId } = await request.json();

        if (!passkeyId) {
            return NextResponse.json(
                { error: 'Missing passkeyId' },
                { status: 400 }
            );
        }

        // Verify the passkey belongs to this user
        const passkeyDoc = await db.collection('passkeys').doc(passkeyId).get();
        if (!passkeyDoc.exists) {
            return NextResponse.json(
                { error: 'Passkey not found' },
                { status: 404 }
            );
        }

        const passkeyData = passkeyDoc.data();
        if (passkeyData?.userId !== userId) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 403 }
            );
        }

        // Delete the passkey
        await db.collection('passkeys').doc(passkeyId).delete();

        return NextResponse.json({ message: 'Passkey deleted successfully' });

    } catch (error: any) {
        console.error('Error deleting passkey:', error);
        return NextResponse.json(
            { error: 'Failed to delete passkey' },
            { status: 500 }
        );
    }
}

export async function GET(request: NextRequest) {
    return applyRateLimit(request, getHandler, { type: 'read' });
}

export async function DELETE(request: NextRequest) {
    return applyRateLimit(request, deleteHandler, { type: 'write' });
}
