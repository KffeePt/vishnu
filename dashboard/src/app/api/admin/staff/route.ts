import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import admin from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { EmployeeSchema } from '@/zod_schemas/candy-store-related';
import { Timestamp } from 'firebase-admin/firestore';
import { getMasterPassword } from '@/lib/sessionAuth';
import { encryptData, decryptData, EncryptedContent } from '@/lib/encryption';

export async function GET(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const usernameSnapshot = await db.collection('staff').get();
        const usernameMap = new Map<string, string>(
            usernameSnapshot.docs.flatMap((doc) => {
                const username = doc.data()?.username;
                return typeof username === 'string' && username.trim().length > 0
                    ? [[doc.id, username]]
                    : [];
            })
        );

        // Check if querying for pending staff specifically
        // Handled FIRST without requiring a master password session
        const statusParam = request.nextUrl.searchParams.get('status');
        if (statusParam === 'pending') {
            // Remove orderBy to avoid requiring a composite index
            const pendingSnapshot = await db.collection('staff-data')
                .where('status', '==', 'pending')
                .get();

            const now = Date.now();
            const FIVE_MINUTES = 5 * 60 * 1000;
            const validDocs = [];

            // First pass: Delete expired pending requests
            for (const doc of pendingSnapshot.docs) {
                const data = doc.data();
                const setupTime = new Date(data.setupCompletedAt || data.updatedAt).getTime();
                if (now - setupTime > FIVE_MINUTES) {
                    const batch = db.batch();
                    batch.delete(db.collection('staff-data').doc(doc.id));
                    batch.delete(db.collection('public').doc(doc.id));
                    await batch.commit();
                } else {
                    validDocs.push({ doc, data });
                }
            }

            // Pending users won't have encrypted admin data yet, just auth info
            const pendingUsers = await Promise.all(validDocs.map(async ({ doc, data }) => {
                try {
                    const userRecord = await admin.auth().getUser(doc.id);
                    return {
                        id: doc.id,
                        email: userRecord.email || 'Unknown',
                        name: userRecord.displayName || 'Unknown Staff',
                        username: usernameMap.get(doc.id),
                        status: 'pending',
                        createdAt: data.setupCompletedAt || data.updatedAt,
                        updatedAt: data.updatedAt
                    };
                } catch (e) {
                    return {
                        id: doc.id,
                        email: 'Unknown (Auth Error)',
                        name: 'Unknown Staff',
                        username: usernameMap.get(doc.id),
                        status: 'pending',
                        createdAt: data.setupCompletedAt || data.updatedAt,
                        updatedAt: data.updatedAt
                    };
                }
            }));

            // Sort in memory to avoid needing a Firestore composite index
            pendingUsers.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0).getTime();
                const dateB = new Date(b.createdAt || 0).getTime();
                return dateB - dateA;
            });

            return NextResponse.json(pendingUsers);
        }

        let masterPassword = '';
        try {
            masterPassword = await getMasterPassword(request);
        } catch (e) {
            // No valid session or system not initialized — return unencrypted stubs only
        }

        const snapshot = await db.collection('staff-data').orderBy('createdAt', 'desc').get();

        if (!masterPassword) {
            // Return basic stubs without decrypted data
            const stubs = await Promise.all(snapshot.docs.map(async doc => {
                const data = doc.data();
                try {
                    const userRecord = await admin.auth().getUser(doc.id);
                    return {
                        id: doc.id,
                        email: userRecord.email || 'Unknown',
                        name: userRecord.displayName || 'Unknown Staff',
                        username: usernameMap.get(doc.id),
                        role: 'staff',
                        isActive: true,
                        status: data.status || 'approved',
                        createdAt: data.setupCompletedAt || data.updatedAt || new Date().toISOString(),
                        updatedAt: data.updatedAt,
                        _encrypted: true, // flag so frontend knows data is partial
                    };
                } catch (e) {
                    return { id: doc.id, name: 'Unknown', username: usernameMap.get(doc.id), email: 'Unknown', role: 'staff', isActive: true, status: data.status || 'approved', _encrypted: true };
                }
            }));
            return NextResponse.json(stubs);
        }

        const employees = await Promise.all(snapshot.docs.map(async doc => {
            const data = doc.data();
            if (data.encryptedData) {
                try {
                    const decrypted = decryptData(data as EncryptedContent, masterPassword);
                    return {
                        id: doc.id,
                        ...decrypted,
                        username: usernameMap.get(doc.id),
                        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
                        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
                    };
                } catch (e) {
                    return {
                        id: doc.id,
                        username: usernameMap.get(doc.id),
                        _error: 'Decryption failed',
                        createdAt: data.createdAt?.toDate?.()?.toISOString() || data.createdAt,
                        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt
                    };
                }
            }

            // Fallback for self-registered approved users without encrypted data
            try {
                const userRecord = await admin.auth().getUser(doc.id);
                return {
                    id: doc.id,
                    email: userRecord.email || 'Unknown',
                    name: userRecord.displayName || 'Unknown Staff',
                    username: usernameMap.get(doc.id),
                    role: 'staff',
                    isActive: true,
                    status: data.status || 'approved',
                    createdAt: data.setupCompletedAt || data.updatedAt || new Date().toISOString(),
                    updatedAt: data.updatedAt
                };
            } catch (e) {
                return { id: doc.id, name: 'Unknown', username: usernameMap.get(doc.id), email: 'Unknown', role: 'staff', isActive: true, ...data };
            }
        }));

        return NextResponse.json(employees);
    } catch (error) {
        console.error('Error fetching employees:', error);
        return NextResponse.json({ error: 'Failed to fetch employees' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const masterPassword = await getMasterPassword(request);

        const body = await request.json();
        const validation = EmployeeSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json({ error: validation.error.errors }, { status: 400 });
        }

        const { name, email, role, username, phoneNumber, isActive, userId, password } = validation.data;

        let finalUserId = userId;

        if (password && !userId) {
            try {
                const newAuthUser = await admin.auth().createUser({
                    email,
                    password,
                    displayName: name,
                });
                finalUserId = newAuthUser.uid;
            } catch (err: any) {
                return NextResponse.json({ error: err.message || 'Failed to create Firebase Auth user' }, { status: 400 });
            }
        } else if (!userId) {
            return NextResponse.json({ error: 'Either existing userId or a new password is required to create a staff member.' }, { status: 400 });
        }

        if (username) {
            const authHeader = request.headers.get('authorization');
            const idToken = authHeader?.startsWith('Bearer ') ? authHeader.split('Bearer ')[1] : '';
            const decodedToken = idToken ? await admin.auth().verifyIdToken(idToken) : null;

            if (decodedToken?.uid === finalUserId && (decodedToken?.admin === true || decodedToken?.owner === true)) {
                return NextResponse.json({ error: 'Admin/owner users cannot set a username for themselves.' }, { status: 403 });
            }
        }

        // Note: Email uniqueness check removed as data is encrypted
        // Relying on admin discipline to avoid duplicates

        const dataToEncrypt = {
            name,
            email,
            role,
            phoneNumber: phoneNumber || null,
            isActive: isActive ?? true,
            userId: finalUserId,
            profitPercent: validation.data.profitPercent ?? 50, // Default to 50%
        };

        const encryptedContent = encryptData(dataToEncrypt, masterPassword);

        const newDoc = {
            ...encryptedContent,
            createdAt: Timestamp.now(),
            updatedAt: Timestamp.now(),
        };

        // employee data is now merged directly into the staff-data doc
        await db.collection('staff-data').doc(finalUserId as string).set(newDoc, { merge: true });

        if (username) {
            await db.collection('staff').doc(finalUserId as string).set({
                username,
                updatedAt: Timestamp.now(),
            }, { merge: true });
        }

        return NextResponse.json({ id: finalUserId, ...dataToEncrypt, username, createdAt: newDoc.createdAt, updatedAt: newDoc.updatedAt }, { status: 201 });
    } catch (error) {
        console.error('Error creating employee:', error);
        return NextResponse.json({ error: 'Failed to create employee' }, { status: 500 });
    }
}
