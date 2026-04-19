import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { db } from "@/config/firebase-admin";
import admin from '@/config/firebase-admin';
import { getMasterPassword } from '@/lib/sessionAuth';
import { decryptData } from "@/lib/encryption";

export async function POST(request: NextRequest) {
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
            return NextResponse.json({ error: 'Owner access required for Nuke operation' }, { status: 403 });
        }

        const body = await request.json();
        const { masterPassword } = body;

        if (!masterPassword) {
            return NextResponse.json({ error: 'Valid Master password session is required for Nuke operation' }, { status: 401 });
        }

        const authDoc = await db.collection('udhhmbtc').doc('auth').get();
        if (!authDoc.exists) {
            return NextResponse.json({ error: 'Valid Master password session is required for Nuke operation' }, { status: 401 });
        }
        try {
            const decryptedTest = decryptData(authDoc.data()!.encryptedData, masterPassword);
            if (decryptedTest !== 'master_password_valid') throw new Error('Invalid');
        } catch (e) {
            return NextResponse.json({ error: 'Valid Master password session is required for Nuke operation' }, { status: 401 });
        }

        const preserveConfig = body.preserveAppConfig === true;

        const allCollections = await db.listCollections();

        const report = { deleted: [] as string[], preserved: [] as string[], totalDocsDeleted: 0 };

        for (const coll of allCollections) {
            if (preserveConfig && (coll.id === 'app-config' || coll.id === 'assistant-config')) {
                report.preserved.push(coll.id);
                continue;
            }

            // We must call recursiveDelete on all collections even if they appear empty at the root level,
            // because they may contain subcollections (e.g. finances/{uid}/records/{id}) where the parent 
            // document is virtual. (A-04 remediation)
            try {
                const snapshot = await coll.get();
                if (!snapshot.empty) {
                    report.totalDocsDeleted += snapshot.size;
                }
                await db.recursiveDelete(coll);
                report.deleted.push(coll.id);
            } catch (collErr) {
                console.warn(`Error nuking collection ${coll.id}:`, collErr);
            }
        }

        // --- Explicit Deep Clean for specific structures (redundant but safe) ---
        try {
            // These are generally covered by the loop above, but we keep explicit calls 
            // for mission-critical E2E data integrity to ensure no orphaned documents remain.
            if (allCollections.some(c => c.id === 'recipes')) {
                await db.recursiveDelete(db.collection('recipes'));
            }
            if (allCollections.some(c => c.id === 'employees')) {
                await db.recursiveDelete(db.collection('employees'));
            }
        } catch (subErr) {
            console.warn("Non-fatal error cleaning specific subcollections during nuke:", subErr);
        }
        // -------------------------------------------------------------------------------
        // -------------------------------------------------------------------------------

        return NextResponse.json({ message: "Nuke successful", report });
    } catch (error) {
        console.error("Error during nuke:", error);
        return NextResponse.json({ error: "Failed to nuke database" }, { status: 500 });
    }
}
