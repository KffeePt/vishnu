import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { EmployeeSchema } from '@/zod_schemas/candy-store-related';
import { Timestamp } from 'firebase-admin/firestore';
import { getMasterPassword } from '@/lib/sessionAuth';
import { encryptData, decryptData, EncryptedContent } from '@/lib/encryption';

export async function GET(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const masterPassword = await getMasterPassword(request);

        const { employeeId } = await params;
        const docRef = db.collection('staff-data').doc(employeeId);
        const doc = await docRef.get();
        const usernameDoc = await db.collection('staff').doc(employeeId).get();
        const username = typeof usernameDoc.data()?.username === 'string' ? usernameDoc.data()?.username : undefined;

        if (!doc.exists) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const data = doc.data()!;
        if (data.encryptedData) {
            try {
                const decrypted = decryptData(data as EncryptedContent, masterPassword);
                return NextResponse.json({ id: doc.id, ...decrypted, username, createdAt: data.createdAt, updatedAt: data.updatedAt });
            } catch (e) {
                return NextResponse.json({ error: 'Failed to decrypt employee data' }, { status: 500 });
            }
        }

        return NextResponse.json({ id: doc.id, ...data, username });
    } catch (error) {
        console.error('Error fetching employee:', error);
        return NextResponse.json({ error: 'Failed to fetch employee' }, { status: 500 });
    }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const masterPassword = await getMasterPassword(request);

        const { employeeId } = await params;
        const body = await request.json();

        // Validate partial updates
        const validation = EmployeeSchema.partial().safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors }, { status: 400 });
        }

        const docRef = db.collection('staff-data').doc(employeeId);
        const authHeader = request.headers.get('authorization');
        const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : '';
        const decodedToken = idToken ? await admin.auth().verifyIdToken(idToken) : null;

        if (validation.data.username !== undefined && decodedToken?.uid === employeeId && (decodedToken.admin === true || decodedToken.owner === true)) {
            return NextResponse.json({ error: 'Admin/owner users cannot set a username for themselves.' }, { status: 403 });
        }

        // Check if employee exists
        const doc = await docRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const data = doc.data()!;
        let currentData: any = data;

        if (data.encryptedData) {
            try {
                currentData = decryptData(data as EncryptedContent, masterPassword);
            } catch (e) {
                return NextResponse.json({ error: 'Failed to decrypt employee data' }, { status: 500 });
            }
        }

        // Email uniqueness check removed

        const updatedData = {
            ...currentData,
            ...validation.data,
        };
        delete updatedData.username;

        const encryptedContent = encryptData(updatedData, masterPassword);

        const updatePayload: any = {
            ...encryptedContent,
            updatedAt: Timestamp.now(),
        };

        await docRef.update(updatePayload);

        if (validation.data.username !== undefined) {
            await db.collection('staff').doc(employeeId).set({
                username: validation.data.username,
                updatedAt: Timestamp.now(),
            }, { merge: true });
        }

        return NextResponse.json({ message: 'Employee updated successfully' });
    } catch (error) {
        console.error('Error updating employee:', error);
        return NextResponse.json({ error: 'Failed to update employee' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const masterPassword = await getMasterPassword(request);

        const { employeeId } = await params;
        const docRef = db.collection('staff-data').doc(employeeId);

        const doc = await docRef.get();
        if (!doc.exists) {
            return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
        }

        const data = doc.data()!;
        let currentData: any = data;

        if (data.encryptedData) {
            try {
                currentData = decryptData(data as EncryptedContent, masterPassword);
            } catch (e) {
                return NextResponse.json({ error: 'Failed to decrypt employee data' }, { status: 500 });
            }
        }

        currentData.isActive = false;

        const encryptedContent = encryptData(currentData, masterPassword);

        // Soft delete - just mark as inactive
        await docRef.update({
            ...encryptedContent,
            updatedAt: Timestamp.now(),
        });

        return NextResponse.json({ message: 'Employee deactivated successfully' });
    } catch (error) {
        console.error('Error deactivating employee:', error);
        return NextResponse.json({ error: 'Failed to deactivate employee' }, { status: 500 });
    }
}
