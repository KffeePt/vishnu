import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { getMasterPassword } from '@/lib/sessionAuth';
import { encryptData, decryptData, EncryptedContent } from '@/lib/encryption';
import { Timestamp } from 'firebase-admin/firestore';
import { z } from 'zod';

const SellingRulesSchema = z.record(
    z.string(),
    z.object({
        unitValue: z.number().min(0)
    })
);

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ employeeId: string }> }
) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const masterPassword = await getMasterPassword(request);
        const resolvedParams = await params;
        const employeeId = resolvedParams.employeeId;

        const docRef = db.collection('staff-data').doc(employeeId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const data = docSnap.data();
        if (!data?.encryptedData) {
            return NextResponse.json({ sellingRules: {} });
        }

        try {
            const decrypted = decryptData(data as EncryptedContent, masterPassword);
            return NextResponse.json({ sellingRules: decrypted.sellingRules || {} });
        } catch (e) {
            console.error('Failed to decrypt staff data for rules:', e);
            return NextResponse.json({ error: 'Failed to decrypt staff data' }, { status: 500 });
        }
    } catch (error) {
        console.error('Error fetching selling rules:', error);
        return NextResponse.json({ error: 'Failed to fetch selling rules' }, { status: 500 });
    }
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ employeeId: string }> }
) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const masterPassword = await getMasterPassword(request);
        const resolvedParams = await params;
        const employeeId = resolvedParams.employeeId;

        const body = await request.json();

        // Ensure sellingRules block is valid
        if (!body.sellingRules || typeof body.sellingRules !== 'object') {
            return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
        }

        const validation = SellingRulesSchema.safeParse(body.sellingRules);
        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors }, { status: 400 });
        }

        const docRef = db.collection('staff-data').doc(employeeId);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const data = docSnap.data();
        let decryptedData: any = {};

        if (data?.encryptedData) {
            try {
                decryptedData = decryptData(data as EncryptedContent, masterPassword);
            } catch (e) {
                console.error('Failed to decrypt staff data for rules update:', e);
                return NextResponse.json({ error: 'Failed to decrypt staff data' }, { status: 500 });
            }
        } else {
            // Unencrypted fallback (though realistically staff-data is always encrypted)
            decryptedData = { ...data };
        }

        // Merge the new rules
        const updatedData = {
            ...decryptedData,
            sellingRules: validation.data
        };

        const encryptedContent = encryptData(updatedData, masterPassword);

        const updatePayload: any = {
            ...encryptedContent,
            updatedAt: Timestamp.now(),
        };

        await docRef.update(updatePayload);

        return NextResponse.json({ message: 'Selling rules updated successfully' });
    } catch (error) {
        console.error('Error updating selling rules:', error);
        return NextResponse.json({ error: 'Failed to update selling rules' }, { status: 500 });
    }
}
