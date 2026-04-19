import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import { db } from "@/config/firebase-admin";
import admin from '@/config/firebase-admin';
import { decryptWithSystemKey } from "@/lib/encryption";
import { getWhitelistedCollections } from "@/lib/rules-whitelist";
import { getAuthDocCached } from "@/lib/sessionAuth";

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

        if (!decodedToken.owner && !decodedToken.admin) {
            return NextResponse.json({ error: 'Admin or Owner access required' }, { status: 403 });
        }

        // Fetch dynamic whitelist from firestore.rules
        const rulesCollections = getWhitelistedCollections();

        // Ensure inventory is tracked
        const allApproved = Array.from(new Set(rulesCollections));

        // Discover all existing collections
        const allCollectionsRef = await db.listCollections();
        const allCollectionIds = allCollectionsRef.map(c => c.id);

        const healthStatus: Record<string, { exists: boolean, details?: string }> = {};
        let isComplete = true;

        const whitelisted: string[] = [];
        const outOfPlace: string[] = [];
        const missing: string[] = [];

        // Check health status for backward compatibility & 'missing'
        for (const coll of allApproved) {
            // Check if collection actually exists in Firestore
            const actuallyExists = allCollectionIds.includes(coll);
            let exists = actuallyExists;

            if (!actuallyExists) {
                // Secondary check: sometimes listCollections misses collections with only config docs
                const snapshot = await db.collection(coll).limit(1).get();
                if (!snapshot.empty) exists = true;
            }

            if (exists) {
                whitelisted.push(coll);
            } else {
                missing.push(coll);
            }

            healthStatus[coll] = { exists };
        }

        // Find outOfPlace collections
        for (const collId of allCollectionIds) {
            if (!allApproved.includes(collId)) {
                outOfPlace.push(collId);
                healthStatus[collId] = { exists: true, details: 'Out of place' };
            } else {
                if (!whitelisted.includes(collId)) whitelisted.push(collId);
            }
        }

        // Specific document checks (cached)
        const authDoc = await getAuthDocCached();
        healthStatus['udhhmbtc/auth'] = { exists: authDoc.exists };
        if (!authDoc.exists) isComplete = false;

        const metaDoc = await db.collection('udhhmbtc').doc('meta-data').get();
        healthStatus['udhhmbtc/meta-data'] = { exists: metaDoc.exists };

        const appConfigSnapshot = await db.collection('app-config').limit(1).get();
        healthStatus['app-config'] = { exists: !appConfigSnapshot.empty };
        if (appConfigSnapshot.empty) isComplete = false;

        // Overall status
        const requiredAlways = ['udhhmbtc/auth', 'app-config', 'users'];

        for (const req of requiredAlways) {
            if (req.includes('/')) {
                if (!healthStatus[req]?.exists) isComplete = false;
            } else {
                if (!healthStatus[req]?.exists) {
                    const snap = await db.collection(req).limit(1).get();
                    if (snap.empty) isComplete = false;
                }
            }
        }

        // If any approved collection is missing, the DB needs fixing
        if (missing.length > 0) {
            isComplete = false;
        }

        return NextResponse.json({
            status: isComplete ? 'complete' : 'incomplete',
            whitelisted: Array.from(new Set(whitelisted)),
            outOfPlace: Array.from(new Set(outOfPlace)),
            missing: Array.from(new Set(missing)),
            topLevelCollectionCount: allCollectionIds.length,
            collections: healthStatus,
        });
    } catch (error) {
        console.error("Error fetching db health:", error);
        return NextResponse.json({ error: "Failed to fetch db health" }, { status: 500 });
    }
}
