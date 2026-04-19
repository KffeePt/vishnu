import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import {
    type FirestoreBackupSnapshotV2,
    restoreFirestoreBackupSnapshot,
} from '@/lib/firestore-backup';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';

type LegacyBackupCollection = {
    documents?: Record<string, Record<string, any>>;
    subcollections?: Record<string, Record<string, LegacyBackupCollection>>;
};

function normalizeLegacyCollection(
    collectionName: string,
    collectionData: LegacyBackupCollection,
    parentPath?: string
): FirestoreBackupSnapshotV2['rootCollections'][number] {
    const collectionPath = parentPath ? `${parentPath}/${collectionName}` : collectionName;

    return {
        id: collectionName,
        path: collectionPath,
        documents: Object.entries(collectionData.documents || {}).map(([docId, data]) => ({
            id: docId,
            path: `${collectionPath}/${docId}`,
            data,
            subcollections: Object.entries(collectionData.subcollections?.[docId] || {}).map(
                ([subcollectionName, subcollectionData]) =>
                    normalizeLegacyCollection(subcollectionName, subcollectionData, `${collectionPath}/${docId}`)
            ),
        })),
    };
}

function normalizeBackupPayload(payload: any): FirestoreBackupSnapshotV2 | null {
    if (
        payload?.format === 'candyland.firestore.snapshot' &&
        payload?.version === 2 &&
        Array.isArray(payload?.rootCollections)
    ) {
        return payload as FirestoreBackupSnapshotV2;
    }

    if (payload?.version === 1 && payload?.collections && typeof payload.collections === 'object') {
        return {
            format: 'candyland.firestore.snapshot',
            version: 2,
            exportedAt: payload.timestamp || new Date().toISOString(),
            sourceProjectId: null,
            rootCollections: Object.entries(payload.collections).map(([collectionName, collectionData]) =>
                normalizeLegacyCollection(collectionName, collectionData as LegacyBackupCollection)
            ),
        };
    }

    return null;
}

export async function POST(request: NextRequest) {
    const authResult = await adminAuthMiddleware(request);
    if (authResult) {
        return authResult;
    }

    try {
        const payload = await request.json();
        const normalized = normalizeBackupPayload(payload);

        if (!normalized) {
            return NextResponse.json({ error: 'Invalid backup file format' }, { status: 400 });
        }

        const metrics = await restoreFirestoreBackupSnapshot(db, normalized);

        return NextResponse.json(
            {
                success: true,
                message: `Restored ${metrics.totalDocs} documents across ${metrics.totalCollections} collections.`,
                metrics,
                snapshotInfo: {
                    sourceProjectId: normalized.sourceProjectId,
                    exportedAt: normalized.exportedAt,
                    targetProjectId: process.env.FIREBASE_PROJECT_ID ?? null,
                },
            },
            { status: 200 }
        );
    } catch (error) {
        console.error('Database restore failed:', error);
        return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 });
    }
}
