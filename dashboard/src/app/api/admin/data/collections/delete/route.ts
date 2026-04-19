import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { db } from "@/config/firebase-admin";
import admin from '@/config/firebase-admin';
import { getMasterPassword } from '@/lib/sessionAuth';

export async function DELETE(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const idToken = authHeader.substring(7);
        const decodedToken = await admin.auth().verifyIdToken(idToken);

        if (!decodedToken.owner) {
            return NextResponse.json({ error: 'Owner access required' }, { status: 403 });
        }

        let masterPassword = '';
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
            if (!masterPassword) throw new Error('Missing password');
        } catch (e) {
            return NextResponse.json({ error: 'Valid master password session required.' }, { status: 401 });
        }

        const body = await request.json();
        const { collection } = body;

        if (!collection || typeof collection !== 'string') {
            return NextResponse.json({ error: 'Invalid collection name' }, { status: 400 });
        }

        // Check if collection is whitelisted
        const whitelistDoc = await db.collection('firestore-registry').doc('collection-whitelist').get();
        const whitelistedCollections = whitelistDoc.exists ? (whitelistDoc.data()?.collections || []) : [];

        if (whitelistedCollections.includes(collection)) {
            return NextResponse.json({ error: 'Cannot delete a whitelisted collection' }, { status: 403 });
        }

        const snapshot = await db.collection(collection).get();
        let deletedCount = 0;

        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                deletedCount++;
            });
            await batch.commit();
        }

        // Also attempt to delete its config doc if it exists
        const configDoc = await db.collection('collection-configs').doc(collection).get();
        if (configDoc.exists) {
            await configDoc.ref.delete();
        }

        return NextResponse.json({ message: `Successfully deleted ${deletedCount} documents from ${collection}.` });
    } catch (error) {
        console.error(`Error deleting collection:`, error);
        return NextResponse.json({ error: `Failed to delete collection` }, { status: 500 });
    }
}
