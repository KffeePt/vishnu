import { NextRequest, NextResponse } from "next/server";
import { adminAuthMiddleware } from "@/middleware/adminAuthMiddleware";
import admin from '@/config/firebase-admin';
import { getMasterPassword } from '@/lib/sessionAuth';
import { runFullDbInit } from '@/lib/db-init';

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

        if (!decodedToken.owner && !decodedToken.admin) {
            return NextResponse.json({ error: 'Admin or Owner access required' }, { status: 403 });
        }

        let masterPassword = '';
        try {
            masterPassword = await getMasterPassword(request, decodedToken.uid);
        } catch (e) {
            console.log("Master password not provided or invalid. Encrypted collections won't initialize.");
        }

        const report = await runFullDbInit(masterPassword || undefined);

        return NextResponse.json({
            message: "Database fixed successfully",
            report,
            ownersMissingKeys: report.ownersMissingKeys,
        });
    } catch (error) {
        console.error("Error fixing db:", error);
        return NextResponse.json({ error: "Failed to fix db" }, { status: 500 });
    }
}
